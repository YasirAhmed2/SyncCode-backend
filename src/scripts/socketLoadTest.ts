import axios from 'axios';
import { io, Socket } from 'socket.io-client';

type CliOptions = {
  serverUrl: string;
  roomId?: string;
  token?: string;
  language: 'javascript' | 'python';
  clients: number;
  rounds: number;
  intervalMs: number;
  connectionTimeoutMs: number;
};

type LatencyStats = {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
};

const DEFAULTS: CliOptions = {
  serverUrl: process.env.LOADTEST_SERVER_URL || 'http://localhost:5000',
  roomId: process.env.LOADTEST_ROOM_ID,
  token: process.env.LOADTEST_TOKEN,
  language: (process.env.LOADTEST_LANGUAGE as 'javascript' | 'python') || 'javascript',
  clients: Number(process.env.LOADTEST_CLIENTS || 100),
  rounds: Number(process.env.LOADTEST_ROUNDS || 25),
  intervalMs: Number(process.env.LOADTEST_INTERVAL_MS || 120),
  connectionTimeoutMs: Number(process.env.LOADTEST_CONNECTION_TIMEOUT_MS || 10000),
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2);
  const options: CliOptions = { ...DEFAULTS };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--serverUrl' && next) options.serverUrl = next;
    if (arg === '--roomId' && next) options.roomId = next;
    if (arg === '--token' && next) options.token = next;
    if (arg === '--language' && next && (next === 'javascript' || next === 'python')) options.language = next;
    if (arg === '--clients' && next) options.clients = Number(next);
    if (arg === '--rounds' && next) options.rounds = Number(next);
    if (arg === '--intervalMs' && next) options.intervalMs = Number(next);
    if (arg === '--connectionTimeoutMs' && next) options.connectionTimeoutMs = Number(next);
  }

  if (!Number.isFinite(options.clients) || options.clients < 2) {
    throw new Error('clients must be a number >= 2');
  }

  if (!Number.isFinite(options.rounds) || options.rounds < 1) {
    throw new Error('rounds must be a number >= 1');
  }

  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 20) {
    throw new Error('intervalMs must be a number >= 20');
  }

  return options;
};

const percentile = (sorted: number[], p: number) => {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
};

const computeStats = (numbers: number[]): LatencyStats => {
  const sorted = [...numbers].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, n) => acc + n, 0);
  return {
    min: sorted[0] || 0,
    max: sorted[sorted.length - 1] || 0,
    avg: sorted.length ? sum / sorted.length : 0,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
};

const fmt = (n: number) => `${n.toFixed(2)}ms`;

const ensureRoomId = async (options: CliOptions): Promise<string> => {
  if (options.roomId) {
    return options.roomId;
  }

  if (!options.token) {
    throw new Error('roomId is required unless token is provided for auto-room creation');
  }

  const createRoomUrl = `${options.serverUrl.replace(/\/$/, '')}/rooms/create`;
  const response = await axios.post(
    createRoomUrl,
    { language: options.language },
    {
      headers: {
        Authorization: `Bearer ${options.token}`,
      },
    }
  );

  const roomId = response.data?.room?.roomId as string | undefined;
  if (!roomId) {
    throw new Error('failed to create room: no roomId returned');
  }

  return roomId;
};

const connectClient = (options: CliOptions, userIndex: number, roomId: string) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = io(options.serverUrl, {
      transports: ['websocket'],
      withCredentials: true,
      reconnection: false,
      timeout: options.connectionTimeoutMs,
      auth: options.token ? { token: options.token } : undefined,
    });

    const userId = `load_user_${userIndex}`;
    const userName = `LoadUser${userIndex}`;

    const timeoutHandle = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`connection timeout for user ${userIndex}`));
    }, options.connectionTimeoutMs + 500);

    socket.on('connect', () => {
      socket.emit('join-room', {
        roomId,
        userId,
        userName,
        avatarColor: '#22c55e',
      });
      clearTimeout(timeoutHandle);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      clearTimeout(timeoutHandle);
      reject(err);
    });
  });

const main = async () => {
  const options = parseArgs();
  const roomId = await ensureRoomId(options);
  const senderUserId = 'load_user_0';

  console.log('--- SyncCode Socket Load Test ---');
  console.log(`serverUrl: ${options.serverUrl}`);
  console.log(`roomId: ${roomId}`);
  console.log(`clients: ${options.clients}`);
  console.log(`rounds: ${options.rounds}`);
  console.log(`intervalMs: ${options.intervalMs}`);

  const sockets: Socket[] = [];
  const latencies: number[] = [];
  const sentAtBySeq = new Map<number, number>();
  const seenBySeqAndClient = new Set<string>();

  try {
    for (let i = 0; i < options.clients; i += 1) {
      const socket = await connectClient(options, i, roomId);
      sockets.push(socket);
    }

    console.log(`connected clients: ${sockets.length}`);
    await sleep(800);

    sockets.forEach((socket, clientIdx) => {
      socket.on('code-update', (payload: any) => {
        const code = String(payload?.code || '');
        const seqMatch = code.match(/\/\*load-seq:(\d+)\*\//);
        if (!seqMatch) return;

        const seq = Number(seqMatch[1]);
        if (!Number.isFinite(seq)) return;

        const start = sentAtBySeq.get(seq);
        if (!start) return;

        const dedupeKey = `${seq}:${clientIdx}`;
        if (seenBySeqAndClient.has(dedupeKey)) return;
        seenBySeqAndClient.add(dedupeKey);

        latencies.push(Date.now() - start);
      });
    });

    const sender = sockets[0];
    for (let seq = 1; seq <= options.rounds; seq += 1) {
      const code = `/*load-seq:${seq}*/\nconsole.log('seq:${seq} at ${Date.now()}');`;
      sentAtBySeq.set(seq, Date.now());

      sender.emit('code-change', {
        roomId,
        code,
        language: options.language,
        userId: senderUserId,
        userName: 'LoadUser0',
      });

      await sleep(options.intervalMs);
    }

    await sleep(Math.max(1200, options.intervalMs * 3));

    const expectedEvents = options.clients * options.rounds;
    const receivedEvents = latencies.length;
    const dropRate = expectedEvents > 0 ? ((expectedEvents - receivedEvents) / expectedEvents) * 100 : 0;
    const stats = computeStats(latencies);

    console.log('');
    console.log('--- Results ---');
    console.log(`expected events: ${expectedEvents}`);
    console.log(`received events: ${receivedEvents}`);
    console.log(`drop rate: ${dropRate.toFixed(2)}%`);
    console.log(`latency min: ${fmt(stats.min)}`);
    console.log(`latency avg: ${fmt(stats.avg)}`);
    console.log(`latency p50: ${fmt(stats.p50)}`);
    console.log(`latency p95: ${fmt(stats.p95)}`);
    console.log(`latency p99: ${fmt(stats.p99)}`);
    console.log(`latency max: ${fmt(stats.max)}`);

    if (dropRate > 5) {
      console.log('status: WARN (high drop rate; consider reducing intervalMs or increasing server resources)');
    } else {
      console.log('status: OK');
    }
  } finally {
    sockets.forEach((socket) => {
      if (socket.connected) {
        socket.emit('leave-room', { roomId, userId: socket.id });
      }
      socket.disconnect();
    });
  }
};

main().catch((error) => {
  console.error('load test failed:', error?.message || error);
  process.exit(1);
});

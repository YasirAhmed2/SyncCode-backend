/**
 * RAG smoke test — end to end, without touching signup/email at all.
 *
 *   npm run test:rag
 *
 * What it does:
 *   1. seeds (or reuses) a verified test user directly in Mongo
 *   2. seeds (or reuses) a room with that user as teacher + participant
 *   3. signs a JWT for that user  → no /auth/login, no OTP, no Brevo key
 *   4. uploads a small sample document to /ai/:roomId/documents
 *   5. polls /ai/:roomId/documents until it is "ready" (or "failed")
 *   6. asks an on-topic question   → should come back grounded: true
 *   7. asks an off-topic question  → should come back grounded: false
 *
 * The server must already be running (`npm run dev`) in another terminal.
 *
 * Flags:
 *   --cleanup   delete the test document (and its chunks) when done
 *   --keep      leave the sample .txt on disk for inspection
 */

import "dotenv/config";
import fs from "fs";
import os from "os";
import path from "path";
import mongoose from "mongoose";

import User from "../models/user.mongo.js";
import Room from "../models/room.mongo.js";
import { generateToken } from "../utils/jwt.utils.js";
import { generateRoomId } from "../utils/roomId.utils.js";

const BASE_URL =
  process.env.TEST_BASE_URL || `http://localhost:${process.env.PORT || 5000}`;

const TEST_EMAIL = "rag-smoke-test@synccode.local";
const CLEANUP = process.argv.includes("--cleanup");
const KEEP_FILE = process.argv.includes("--keep");

const log = (...a: any[]) => console.log(...a);
const ok = (m: string) => log(`  \x1b[32m✓\x1b[0m ${m}`);
const bad = (m: string) => log(`  \x1b[31m✗\x1b[0m ${m}`);
const step = (n: number, m: string) => log(`\n\x1b[1m[${n}] ${m}\x1b[0m`);

const SAMPLE_DOC = `SyncCode Programming Notes — Chapter 4: Recursion

Recursion is a technique where a function calls itself in order to solve a
problem by breaking it down into smaller instances of the same problem.

Every correct recursive function needs two things. The first is a base case:
a condition under which the function returns a value directly, without calling
itself again. Without a base case the function would call itself forever and
the program would crash with a stack overflow error. The second is a recursive
case: the part where the function calls itself with an input that moves closer
to the base case.

A classic example is the factorial of a number. The factorial of n is n
multiplied by the factorial of n minus one, and the factorial of zero is
defined as one. That definition of zero is the base case.

function factorial(n) {
  if (n === 0) return 1;        // base case
  return n * factorial(n - 1);  // recursive case
}

Recursion is not free. Each pending call occupies a frame on the call stack,
so deep recursion uses more memory than an equivalent loop. Many recursive
functions can be rewritten as iterative loops, and some languages optimise a
special shape called tail recursion where the recursive call is the very last
operation performed.

Chapter 5: Big O Notation

Big O notation describes how the running time or memory use of an algorithm
grows as the size of its input grows. It describes the worst case and it
ignores constant factors, because what matters at large input sizes is the
shape of the growth curve rather than the exact number of operations.

Linear search scans every element of a list one by one, so in the worst case it
looks at every element. Its time complexity is O(n). Binary search instead
halves the search space on every step, but it only works on a sorted list. Its
time complexity is O(log n), which is dramatically faster for large lists.
`;

async function api(pathname: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE_URL}${pathname}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.headers || {}),
    },
  });

  const text = await res.text();
  let body: any;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body };
}

async function main() {
  log("\n\x1b[1m─── SyncCode RAG smoke test ───\x1b[0m");
  log(`  server: ${BASE_URL}`);

  // ── preflight ──────────────────────────────────────────────────────────────
  step(0, "Preflight");

  if (!process.env.DATABASE_URL) {
    bad("DATABASE_URL is not set in .env");
    process.exit(1);
  }
  if (!process.env.JWT_SECRET) {
    bad("JWT_SECRET is not set in .env");
    process.exit(1);
  }
  if (!process.env.GEMINI_API_KEY) {
    bad("GEMINI_API_KEY is not set in .env — ingestion will fail.");
    bad("Get a free key at https://aistudio.google.com/apikey");
    process.exit(1);
  }
  ok("env vars present");

  try {
    const health = await fetch(`${BASE_URL}/health`);
    if (!health.ok) throw new Error(`status ${health.status}`);
    ok("server is up");
  } catch (err: any) {
    bad(`server not reachable at ${BASE_URL} — run \`npm run dev\` first`);
    bad(String(err?.message || err));
    process.exit(1);
  }

  await mongoose.connect(process.env.DATABASE_URL);
  ok("mongo connected");

  // ── seed user + room ───────────────────────────────────────────────────────
  step(1, "Seed a verified user and a room (skips signup + email OTP entirely)");

  let user = await User.findOne({ email: TEST_EMAIL });
  if (!user) {
    user = await User.create({
      name: "RAG Test Teacher",
      email: TEST_EMAIL,
      provider: "local",
      isEmailVerified: true, // ← this is the line that lets us skip Brevo
    });
    ok(`created user ${TEST_EMAIL}`);
  } else {
    if (!user.isEmailVerified) {
      user.isEmailVerified = true;
      await user.save();
    }
    ok(`reusing user ${TEST_EMAIL}`);
  }

  const userId = user._id.toString();

  let room = await Room.findOne({ teacherId: user._id });
  if (!room) {
    room = await Room.create({
      roomId: generateRoomId(),
      name: "RAG Test Room",
      createdBy: user._id,
      teacherId: user._id,
      participants: [user._id],
      language: "javascript",
      code: "console.log('Hello, World!');",
    });
    ok(`created room ${room.roomId}`);
  } else {
    ok(`reusing room ${room.roomId}`);
  }

  const roomId = room.roomId;
  const token = generateToken({ userId });
  ok("signed a JWT for that user");
  log(`\n  roomId: \x1b[36m${roomId}\x1b[0m`);
  log(`  token:  \x1b[90m${token}\x1b[0m`);
  log("  (paste those into Postman if you want to poke at it by hand)");

  // ── upload ─────────────────────────────────────────────────────────────────
  step(2, "Upload a sample document (teacher only)");

  const tmpFile = path.join(os.tmpdir(), "synccode-rag-sample.txt");
  fs.writeFileSync(tmpFile, SAMPLE_DOC, "utf8");

  const form = new FormData();
  form.append(
    "file",
    new Blob([SAMPLE_DOC], { type: "text/plain" }),
    "programming-notes.txt"
  );
  form.append("title", "Programming Notes (smoke test)");

  const upload = await api(`/ai/${roomId}/documents`, token, {
    method: "POST",
    body: form,
  });

  if (upload.status !== 202) {
    bad(`expected 202, got ${upload.status}`);
    log(upload.body);
    process.exit(1);
  }
  const documentId = upload.body.document.id;
  ok(`accepted, document ${documentId} is processing`);

  // ── poll ───────────────────────────────────────────────────────────────────
  step(3, "Wait for embedding to finish");

  let status = "processing";
  let doc: any = null;
  const deadline = Date.now() + 120_000;

  while (status === "processing" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const list = await api(`/ai/${roomId}/documents`, token);
    doc = (list.body.documents || []).find((d: any) => d._id === documentId);
    status = doc?.status || "processing";
    process.stdout.write(`  status: ${status}   \r`);
  }

  if (status !== "ready") {
    bad(`document ended as "${status}"`);
    if (doc?.error) bad(`error: ${doc.error}`);
    bad("most likely a bad/absent GEMINI_API_KEY or a rate limit");
    process.exit(1);
  }
  ok(`ready — ${doc.chunkCount} chunks embedded`);

  // ── ask (on topic) ─────────────────────────────────────────────────────────
  step(4, "Ask an ON-TOPIC question (expect grounded: true)");

  const q1 = "Recursion kya hota hai? Base case kyun zaroori hai, example ke saath samjhao";
  log(`  Q: ${q1}\n`);

  const a1 = await api(`/ai/${roomId}/ask`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: q1 }),
  });

  if (a1.status !== 200) {
    bad(`expected 200, got ${a1.status}`);
    log(a1.body);
    process.exit(1);
  }

  log(`\x1b[36m${a1.body.answer}\x1b[0m\n`);
  log("  sources:");
  for (const s of a1.body.sources) {
    log(`    · ${s.title}  chunk ${s.chunkIndex}  score ${s.score}`);
  }

  if (a1.body.grounded) ok("grounded: true");
  else bad("grounded came back false — retrieval found nothing, check MIN_SCORE");

  // ── ask (off topic) ────────────────────────────────────────────────────────
  step(5, "Ask an OFF-TOPIC question (expect grounded: false, no hallucination)");

  const q2 = "What is the capital of Brazil and who won the 2022 World Cup?";
  log(`  Q: ${q2}\n`);

  const a2 = await api(`/ai/${roomId}/ask`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: q2 }),
  });

  log(`\x1b[90m${a2.body.answer}\x1b[0m\n`);

  if (a2.body.grounded === false) {
    ok("grounded: false — the guardrail held, no LLM call was made");
  } else {
    bad("grounded came back true for an off-topic question");
    bad("MIN_SCORE in rag.service.ts is probably too low");
  }

  // ── cleanup ────────────────────────────────────────────────────────────────
  if (CLEANUP) {
    step(6, "Cleanup");
    const del = await api(`/ai/${roomId}/documents/${documentId}`, token, {
      method: "DELETE",
    });
    if (del.status === 200) ok("test document and its chunks deleted");
    else bad(`delete returned ${del.status}`);
  } else {
    log("\n  (run with --cleanup to delete the test document afterwards)");
  }

  if (!KEEP_FILE) {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }

  log("\n\x1b[1m\x1b[32m─── done ───\x1b[0m\n");
  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n\x1b[31mSmoke test crashed:\x1b[0m", err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});

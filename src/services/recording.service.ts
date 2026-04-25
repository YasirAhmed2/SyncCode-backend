/**
 * RecordingService
 * ─────────────────
 * Lightweight, fire-and-forget session recording.
 * All public methods are async but callers should NOT await them —
 * they must never block the socket hot-path.
 */

import SessionRecording, { ISessionEvent } from '../models/sessionRecording.mongo.js';
import User from '../models/user.mongo.js';

const MAX_EVENTS_PER_SESSION = 500;
const SNAPSHOT_THROTTLE_MS = 3000; // 1 snapshot per user per 3 seconds

// In-memory throttle: `roomId:userId` → last saved timestamp
const snapshotThrottle = new Map<string, number>();

// Track which rooms have an active recording (in-memory, not persisted)
const activeRecordings = new Map<string, string>(); // roomId → sessionRecording _id (string)

// ─── START ────────────────────────────────────────────────────────────────────

export async function startRecording(roomId: string): Promise<void> {
  try {
    // If there's already an active recording for this room, don't create another.
    if (activeRecordings.has(roomId)) return;

    // Also check DB in case server restarted mid-session.
    const existing = await SessionRecording.findOne({
      roomId,
      endedAt: null,
    }).select('_id');

    if (existing) {
      activeRecordings.set(roomId, existing._id.toString());
      return;
    }

    const session = await SessionRecording.create({
      roomId,
      startedAt: new Date(),
      endedAt: null,
      events: [],
      analytics: null,
    });

    activeRecordings.set(roomId, session._id.toString());
    console.log(`[Recording] Started session for room ${roomId}`);
  } catch (err) {
    console.error('[Recording] startRecording error:', err);
  }
}

// ─── SNAPSHOT ────────────────────────────────────────────────────────────────

export async function addSnapshot(
  roomId: string,
  userId: string,
  code: string
): Promise<void> {
  try {
    const throttleKey = `${roomId}:${userId}`;
    const now = Date.now();
    const lastSaved = snapshotThrottle.get(throttleKey) ?? 0;

    // Throttle: skip if less than SNAPSHOT_THROTTLE_MS since last save.
    if (now - lastSaved < SNAPSHOT_THROTTLE_MS) return;

    const sessionId = activeRecordings.get(roomId);
    if (!sessionId) return;

    snapshotThrottle.set(throttleKey, now);

    const event: ISessionEvent = { userId, code, timestamp: now };

    await SessionRecording.findByIdAndUpdate(sessionId, {
      $push: {
        events: {
          $each: [event],
          $slice: -MAX_EVENTS_PER_SESSION, // keep only the last N events
        },
      },
    });
  } catch (err) {
    console.error('[Recording] addSnapshot error:', err);
  }
}

// ─── STOP ────────────────────────────────────────────────────────────────────

export async function stopRecording(roomId: string): Promise<void> {
  try {
    const sessionId = activeRecordings.get(roomId);
    if (!sessionId) return;

    // Remove from active map immediately so no more snapshots land.
    activeRecordings.delete(roomId);

    // Clean up throttle entries for this room.
    for (const key of snapshotThrottle.keys()) {
      if (key.startsWith(`${roomId}:`)) {
        snapshotThrottle.delete(key);
      }
    }

    const session = await SessionRecording.findById(sessionId);
    if (!session) return;

    session.endedAt = new Date();
    session.analytics = await computeAnalytics(session.events, session.startedAt, session.endedAt);
    await session.save();

    console.log(`[Recording] Stopped session for room ${roomId}`);
  } catch (err) {
    console.error('[Recording] stopRecording error:', err);
  }
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────

export async function computeAnalytics(
  events: ISessionEvent[],
  startedAt: Date,
  endedAt: Date
) {
  const totalDurationMs = endedAt.getTime() - startedAt.getTime();

  // Group events by userId
  const byUser = new Map<string, number[]>(); // userId → sorted timestamps
  for (const evt of events) {
    const arr = byUser.get(evt.userId) || [];
    arr.push(evt.timestamp);
    byUser.set(evt.userId, arr);
  }

  const userIds = Array.from(byUser.keys());

  // Resolve user names once
  const users = await User.find({ _id: { $in: userIds } }).select('_id name');
  const nameMap = new Map<string, string>();
  for (const u of users) {
    nameMap.set(u._id.toString(), u.name);
  }

  const userStats = userIds.map((userId) => {
    const timestamps = byUser.get(userId)!.sort((a, b) => a - b);
    const activityCount = timestamps.length;

    // Active time: sum of gaps between consecutive events, capped at 5s per gap
    let activeTimeMs = 0;
    const ACTIVE_GAP_CAP_MS = 5000;
    for (let i = 1; i < timestamps.length; i++) {
      activeTimeMs += Math.min(timestamps[i] - timestamps[i - 1], ACTIVE_GAP_CAP_MS);
    }

    const idleTimeMs = Math.max(0, totalDurationMs - activeTimeMs);

    return {
      userId,
      userName: nameMap.get(userId) || 'Unknown',
      activityCount,
      activeTimeMs,
      idleTimeMs,
    };
  });

  // Engagement score per user (0-100): activityCount relative to max
  const maxActivity = Math.max(...userStats.map((s) => s.activityCount), 1);
  const engagementScores = userStats.map((s) =>
    Math.round((s.activityCount / maxActivity) * 100)
  );
  const avgEngagement =
    engagementScores.length > 0
      ? Math.round(engagementScores.reduce((a, b) => a + b, 0) / engagementScores.length)
      : 0;

  const sorted = [...userStats].sort((a, b) => b.activityCount - a.activityCount);
  const mostActiveUser = sorted[0]?.userName || '';
  const leastActiveUser = sorted[sorted.length - 1]?.userName || '';

  return {
    totalUsers: userIds.length,
    mostActiveUser,
    leastActiveUser,
    avgEngagement,
    userStats,
  };
}

// ─── GETTERS (used by REST controllers) ──────────────────────────────────────

export async function getLatestRecording(roomId: string) {
  return SessionRecording.findOne({ roomId }).sort({ startedAt: -1 });
}

export async function getLatestReport(roomId: string) {
  // First try to find a completed session with analytics
  const completed = await SessionRecording.findOne({ roomId, endedAt: { $ne: null } })
    .sort({ startedAt: -1 })
    .select('roomId startedAt endedAt analytics events');

  if (completed) return completed;

  // Fall back to the active (in-progress) session so teachers can view live reports
  return SessionRecording.findOne({ roomId })
    .sort({ startedAt: -1 })
    .select('roomId startedAt endedAt analytics events');
}

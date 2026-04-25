import { Response } from 'express';
import Room from '@/models/room.mongo.js';
import * as RecordingService from '@/services/recording.service.js';

// ─── GET RECORDING (events for replay) ───────────────────────────────────────
// Teacher or any participant can fetch events.
export const getRecording = async (req: any, res: Response) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    // Verify the requester is a participant
    const room = await Room.findOne({ roomId }).select('participants teacherId');
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isParticipant = room.participants.some(
      (p: any) => p.toString() === userId
    );
    if (!isParticipant)
      return res.status(403).json({ message: 'Not a participant of this room' });

    const recording = await RecordingService.getLatestRecording(roomId);

    if (!recording) {
      return res.status(404).json({ message: 'No recording found for this room' });
    }

    // For students: filter events to only their own snapshots
    const isTeacher = room.teacherId?.toString() === userId;
    const events = isTeacher
      ? recording.events
      : recording.events.filter((e) => e.userId === userId);

    return res.status(200).json({
      success: true,
      data: {
        roomId: recording.roomId,
        startedAt: recording.startedAt,
        endedAt: recording.endedAt,
        isActive: !recording.endedAt,
        events,
      },
    });
  } catch (err) {
    console.error('[Recording] getRecording error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

// ─── GET REPORT (analytics) ───────────────────────────────────────────────────
// Teacher sees full report. Student sees only their own stat row.
export const getReport = async (req: any, res: Response) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const room = await Room.findOne({ roomId }).select('participants teacherId name');
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isParticipant = room.participants.some(
      (p: any) => p.toString() === userId
    );
    if (!isParticipant)
      return res.status(403).json({ message: 'Not a participant of this room' });

    const report = await RecordingService.getLatestReport(roomId);

    if (!report) {
      return res.status(404).json({ message: 'No completed session found' });
    }

    const isTeacher = room.teacherId?.toString() === userId;
    const analytics = report.analytics;

    if (!analytics) {
      return res.status(200).json({
        success: true,
        data: { roomId, roomName: room.name, message: 'Analytics not yet generated' },
      });
    }

    // Students only see their own stat
    const filteredUserStats = isTeacher
      ? analytics.userStats
      : analytics.userStats.filter((s) => s.userId === userId);

    const sessionDurationMs =
      report.endedAt && report.startedAt
        ? report.endedAt.getTime() - report.startedAt.getTime()
        : 0;

    return res.status(200).json({
      success: true,
      data: {
        roomId: report.roomId,
        roomName: room.name,
        startedAt: report.startedAt,
        endedAt: report.endedAt,
        sessionDurationMs,
        isTeacher,
        analytics: {
          totalUsers: isTeacher ? analytics.totalUsers : 1,
          mostActiveUser: isTeacher ? analytics.mostActiveUser : undefined,
          leastActiveUser: isTeacher ? analytics.leastActiveUser : undefined,
          avgEngagement: isTeacher ? analytics.avgEngagement : undefined,
          userStats: filteredUserStats,
        },
      },
    });
  } catch (err) {
    console.error('[Recording] getReport error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

import { Response } from 'express';
import Room from '@/models/room.mongo.js';
import * as RecordingService from '@/services/recording.service.js';

// ─── GET REPORT (analytics) ───────────────────────────────────────────────────
// Teacher sees full report. Student sees only their own stat row.
// Works for both completed and in-progress sessions.
export const getReport = async (req: any, res: Response) => {
  try {
    const { roomId } = req.params;
    const userId = req.user?.userId;

    if (!userId) return res.status(401).json({ message: 'Unauthorized' });

    const room = await Room.findOne({ roomId }).select('participants teacherId name practiceCodeBaseline');
    if (!room) return res.status(404).json({ message: 'Room not found' });

    const isParticipant = room.participants.some(
      (p: any) => p.toString() === userId
    );
    if (!isParticipant)
      return res.status(403).json({ message: 'Not a participant of this room' });

    const report = await RecordingService.getLatestReport(roomId);

    if (!report) {
      return res.status(404).json({ message: 'No session found for this room' });
    }

    const isTeacher = room.teacherId?.toString() === userId;

    // Use pre-computed analytics if available, otherwise compute live analytics
    let analytics = report.analytics;
    if (!analytics && report.events && report.events.length > 0) {
      // Active session — compute analytics on-the-fly
      const endTime = report.endedAt || new Date();
      analytics = await RecordingService.computeAnalytics(
        report.events,
        report.startedAt,
        endTime,
        room.teacherId?.toString()
      );
    }

    if (!analytics) {
      return res.status(200).json({
        success: true,
        data: { roomId, roomName: room.name, message: 'Analytics not yet generated — no activity recorded' },
      });
    }

    const teacherId = room.teacherId?.toString();
    const teacherExcludedStats = (analytics.userStats || []).filter(
      (stat: any) => stat.userId !== teacherId
    );
    const maxActivity = Math.max(...teacherExcludedStats.map((s: any) => s.activityCount), 1);
    const engagementScores = teacherExcludedStats.map((s: any) =>
      Math.round((s.activityCount / maxActivity) * 100)
    );
    const avgEngagement =
      engagementScores.length > 0
        ? Math.round(engagementScores.reduce((a: number, b: number) => a + b, 0) / engagementScores.length)
        : 0;
    const sortedStats = [...teacherExcludedStats].sort((a, b) => b.activityCount - a.activityCount);
    const normalizedAnalytics = {
      ...analytics,
      totalUsers: teacherExcludedStats.length,
      mostActiveUser: sortedStats[0]?.userName || '',
      leastActiveUser: sortedStats[sortedStats.length - 1]?.userName || '',
      avgEngagement,
      userStats: teacherExcludedStats,
    };

    // Students only see their own stat
    const filteredUserStats = isTeacher
      ? normalizedAnalytics.userStats
      : normalizedAnalytics.userStats.filter((s) => s.userId === userId);

    const allSubmissions = await RecordingService.getPracticeSubmissions(roomId);
    const rawSubmissions = isTeacher
      ? allSubmissions
      : allSubmissions.filter((entry: any) => entry.studentId === userId);

    const baseline =
      typeof room.practiceCodeBaseline === 'string' ? room.practiceCodeBaseline : '';

    const stripPracticeBaseline = (submitted: string): string => {
      const s = typeof submitted === 'string' ? submitted : '';
      if (!baseline) return s;
      if (s.startsWith(baseline)) return s.slice(baseline.length);
      let i = 0;
      const n = Math.min(s.length, baseline.length);
      while (i < n && s[i] === baseline[i]) i += 1;
      return s.slice(i);
    };

    const practiceSubmissions = rawSubmissions.map((entry: any) => ({
      studentId: entry.studentId,
      studentName: entry.studentName,
      code: stripPracticeBaseline(entry.code),
      language: entry.language,
      updatedAt: entry.updatedAt,
    }));

    const endTime = report.endedAt || new Date();
    const sessionDurationMs = endTime.getTime() - report.startedAt.getTime();

    return res.status(200).json({
      success: true,
      data: {
        roomId: report.roomId,
        roomName: room.name,
        startedAt: report.startedAt,
        endedAt: report.endedAt,
        isActive: !report.endedAt,
        sessionDurationMs,
        isTeacher,
        analytics: {
          totalUsers: isTeacher ? normalizedAnalytics.totalUsers : 1,
          mostActiveUser: isTeacher ? normalizedAnalytics.mostActiveUser : undefined,
          leastActiveUser: isTeacher ? normalizedAnalytics.leastActiveUser : undefined,
          avgEngagement: isTeacher ? normalizedAnalytics.avgEngagement : undefined,
          userStats: filteredUserStats,
        },
        practiceSubmissions,
      },
    });
  } catch (err) {
    console.error('[Recording] getReport error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};


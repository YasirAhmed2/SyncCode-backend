import mongoose, { Schema, Document } from 'mongoose';

export interface ISessionEvent {
  userId: string;
  code: string;
  timestamp: number; // ms since epoch
}

export interface IUserStat {
  userId: string;
  userName: string;
  activityCount: number;
  activeTimeMs: number;
  idleTimeMs: number;
}

export interface ISessionAnalytics {
  totalUsers: number;
  mostActiveUser: string;
  leastActiveUser: string;
  avgEngagement: number; // 0-100
  userStats: IUserStat[];
}

export interface ISessionRecording extends Document {
  roomId: string;
  startedAt: Date;
  endedAt: Date | null;
  events: ISessionEvent[];
  analytics: ISessionAnalytics | null;
}

const sessionEventSchema = new Schema<ISessionEvent>(
  {
    userId: { type: String, required: true },
    code: { type: String, required: true },
    timestamp: { type: Number, required: true },
  },
  { _id: false }
);

const userStatSchema = new Schema<IUserStat>(
  {
    userId: { type: String, required: true },
    userName: { type: String, required: true, default: 'Unknown' },
    activityCount: { type: Number, default: 0 },
    activeTimeMs: { type: Number, default: 0 },
    idleTimeMs: { type: Number, default: 0 },
  },
  { _id: false }
);

const sessionAnalyticsSchema = new Schema<ISessionAnalytics>(
  {
    totalUsers: { type: Number, default: 0 },
    mostActiveUser: { type: String, default: '' },
    leastActiveUser: { type: String, default: '' },
    avgEngagement: { type: Number, default: 0 },
    userStats: [userStatSchema],
  },
  { _id: false }
);

const sessionRecordingSchema = new Schema<ISessionRecording>(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      required: true,
      default: () => new Date(),
    },
    endedAt: {
      type: Date,
      default: null,
    },
    // Hard-cap at 500 events to avoid unbounded growth.
    events: {
      type: [sessionEventSchema],
      default: [],
    },
    analytics: {
      type: sessionAnalyticsSchema,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const SessionRecording = mongoose.model<ISessionRecording>(
  'SessionRecording',
  sessionRecordingSchema
);

export default SessionRecording;

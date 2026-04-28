import mongoose, { Schema, Document } from 'mongoose';

export interface IPracticeSubmission extends Document {
  roomId: string;
  studentId: string;
  studentName: string;
  code: string;
  language: 'javascript' | 'python';
  updatedAt: Date;
}

const practiceSubmissionSchema = new Schema<IPracticeSubmission>(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    studentId: {
      type: String,
      required: true,
      index: true,
    },
    studentName: {
      type: String,
      default: 'Unknown',
    },
    code: {
      type: String,
      default: '',
    },
    language: {
      type: String,
      enum: ['javascript', 'python'],
      default: 'javascript',
    },
    updatedAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  {
    timestamps: true,
  }
);

practiceSubmissionSchema.index({ roomId: 1, studentId: 1 }, { unique: true });

const PracticeSubmission = mongoose.model<IPracticeSubmission>(
  'PracticeSubmission',
  practiceSubmissionSchema
);

export default PracticeSubmission;

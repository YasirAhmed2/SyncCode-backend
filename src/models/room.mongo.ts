import mongoose, { Schema, Document } from "mongoose";

export interface IRoom extends Document {
  roomId: string;
  name: string;
  createdBy: mongoose.Types.ObjectId;
  teacherId: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[];
  code: string;
  yjsState?: string;
  language: "javascript" | "python";
  mode: "broadcast" | "practice";
  isLocked: boolean;
  /** Snapshot of shared editor text when practice mode was last enabled (used to strip template from session report). */
  practiceCodeBaseline?: string | null;
  createdAt: Date;
}

const roomSchema = new Schema<IRoom>(
  {
    roomId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },

    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    teacherId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    code: {
      type: String,
      default: "",
    },
    yjsState: {
      type: String,
      default: null,
    },
    language: {
      type: String,
      enum: ["javascript", "python"],
      default: "javascript",
    },
    mode: {
      type: String,
      enum: ["broadcast", "practice"],
      default: "broadcast",
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
    practiceCodeBaseline: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Room = mongoose.model<IRoom>("Room", roomSchema);
export default Room;



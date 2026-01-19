import mongoose, { Schema, Document } from "mongoose";

export interface IChat extends Document {
  roomId: string;
  sender: mongoose.Types.ObjectId;
  message: string;
  createdAt: Date;
}

const chatSchema = new Schema<IChat>(
  {
    roomId: {
      type: String,
      required: true,
    },
    sender: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model<IChat>("Chat", chatSchema);

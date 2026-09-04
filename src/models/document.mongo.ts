import mongoose, { Schema, Document } from "mongoose";

/**
 * A teaching document uploaded by a teacher into a room.
 * The extracted text lives in DocumentChunk (one row per chunk + embedding).
 */
export interface IRagDocument extends Document {
  roomId: string;
  title: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: mongoose.Types.ObjectId;
  chunkCount: number;
  status: "processing" | "ready" | "failed";
  error?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const ragDocumentSchema = new Schema<IRagDocument>(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160,
    },
    fileName: {
      type: String,
      required: true,
    },
    mimeType: {
      type: String,
      default: "",
    },
    sizeBytes: {
      type: Number,
      default: 0,
    },
    uploadedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    chunkCount: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["processing", "ready", "failed"],
      default: "processing",
      index: true,
    },
    error: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

const RagDocument = mongoose.model<IRagDocument>("RagDocument", ragDocumentSchema);
export default RagDocument;

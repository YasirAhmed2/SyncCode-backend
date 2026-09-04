import mongoose, { Schema, Document } from "mongoose";

/**
 * One retrievable piece of a teaching document, with its embedding vector.
 *
 * NOTE (basic version): the embedding is stored as a plain number[] and
 * similarity is computed in Node. That is fine for classroom-sized material
 * (a few thousand chunks per room). If a room ever grows past that, create an
 * Atlas Vector Search index on `embedding` and replace the scoring loop in
 * rag.service.ts with a $vectorSearch aggregation — nothing else changes.
 */
export interface IDocumentChunk extends Document {
  roomId: string;
  documentId: mongoose.Types.ObjectId;
  chunkIndex: number;
  content: string;
  embedding: number[];
  createdAt: Date;
}

const documentChunkSchema = new Schema<IDocumentChunk>(
  {
    roomId: {
      type: String,
      required: true,
      index: true,
    },
    documentId: {
      type: Schema.Types.ObjectId,
      ref: "RagDocument",
      required: true,
      index: true,
    },
    chunkIndex: {
      type: Number,
      required: true,
    },
    content: {
      type: String,
      required: true,
    },
    embedding: {
      type: [Number],
      required: true,
      // Excluded by default so a stray query never ships 768 floats per chunk
      // to a client. retrieve() in rag.service.ts asks for it explicitly.
      select: false,
    },
  },
  { timestamps: true }
);

documentChunkSchema.index({ roomId: 1, documentId: 1, chunkIndex: 1 });

const DocumentChunk = mongoose.model<IDocumentChunk>("DocumentChunk", documentChunkSchema);
export default DocumentChunk;

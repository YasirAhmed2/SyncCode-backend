import { Response } from "express";
import Room from "@/models/room.mongo.js";
import RagDocument from "@/models/document.mongo.js";
import { extractText, isSupportedFile, SUPPORTED_EXTENSIONS } from "@/utils/textExtract.js";
import { askQuestion, deleteDocument, ingestDocument } from "@/services/rag.service.js";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

/** Room must exist and the caller must be its teacher. */
const requireTeacher = async (roomId: string, userId: string) => {
  const room = await Room.findOne({ roomId }).select("teacherId participants");
  if (!room) return { error: { status: 404, message: "Room not found" } };
  if (room.teacherId.toString() !== userId) {
    return { error: { status: 403, message: "Only the teacher can manage room material" } };
  }
  return { room };
};

/** Room must exist and the caller must be in it. */
const requireParticipant = async (roomId: string, userId: string) => {
  const room = await Room.findOne({ roomId }).select("teacherId participants");
  if (!room) return { error: { status: 404, message: "Room not found" } };
  const inRoom = room.participants.some((p: any) => p.toString() === userId);
  if (!inRoom) {
    return { error: { status: 403, message: "You are not a participant of this room" } };
  }
  return { room };
};

// ─── POST /ai/:roomId/documents ──────────────────────────────────────────────

export const uploadDocument = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { roomId } = req.params;
    const file = req.file;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    // Authorize before saying anything about the upload shape.
    const { error } = await requireTeacher(roomId, userId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    if (!file) {
      return res.status(400).json({
        success: false,
        message: `No file received. Send multipart/form-data with a "file" field (${SUPPORTED_EXTENSIONS.join(", ")}).`,
      });
    }

    if (!isSupportedFile(file.originalname, file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Unsupported file type. Allowed: ${SUPPORTED_EXTENSIONS.join(", ")}`,
      });
    }

    // Read the text now so a broken/scanned file fails fast and loudly.
    let text = "";
    try {
      text = await extractText(file.buffer, file.originalname, file.mimetype);
    } catch (err: any) {
      return res.status(400).json({
        success: false,
        message: err?.message || "Could not read the file",
      });
    }

    if (text.trim().length < 100) {
      return res.status(400).json({
        success: false,
        message:
          "Almost no text could be extracted. If this is a scanned PDF, it needs OCR before upload.",
      });
    }

    const doc = await RagDocument.create({
      roomId,
      title: (req.body?.title || file.originalname).toString().trim().slice(0, 160),
      fileName: file.originalname,
      mimeType: file.mimetype,
      sizeBytes: file.size,
      uploadedBy: userId,
      status: "processing",
    });

    // Embedding a book takes a while — don't hold the request open for it.
    void ingestDocument(doc._id.toString(), roomId, text);

    return res.status(202).json({
      success: true,
      message: "Upload received. The document is being processed.",
      document: {
        id: doc._id,
        title: doc.title,
        fileName: doc.fileName,
        status: doc.status,
      },
    });
  } catch (err) {
    console.error("Upload document error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── GET /ai/:roomId/documents ───────────────────────────────────────────────

export const listDocuments = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { roomId } = req.params;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { error } = await requireParticipant(roomId, userId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const documents = await RagDocument.find({ roomId })
      .sort({ createdAt: -1 })
      .select("title fileName status chunkCount error createdAt")
      .lean();

    return res.status(200).json({ success: true, documents });
  } catch (err) {
    console.error("List documents error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── DELETE /ai/:roomId/documents/:documentId ────────────────────────────────

export const removeDocument = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { roomId, documentId } = req.params;

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    const { error } = await requireTeacher(roomId, userId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const doc = await RagDocument.findOne({ _id: documentId, roomId }).select("_id");
    if (!doc) return res.status(404).json({ success: false, message: "Document not found" });

    await deleteDocument(documentId);

    return res.status(200).json({ success: true, message: "Document removed" });
  } catch (err) {
    console.error("Remove document error:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

// ─── POST /ai/:roomId/ask ────────────────────────────────────────────────────

export const ask = async (req: any, res: Response) => {
  try {
    const userId = req.user?.userId;
    const { roomId } = req.params;
    const { question } = req.body || {};

    if (!userId) return res.status(401).json({ message: "Unauthorized" });

    if (typeof question !== "string" || !question.trim()) {
      return res.status(400).json({ success: false, message: "question is required" });
    }

    const { error } = await requireParticipant(roomId, userId);
    if (error) return res.status(error.status).json({ success: false, message: error.message });

    const result = await askQuestion(roomId, question);

    return res.status(200).json({ success: true, ...result });
  } catch (err: any) {
    console.error("Ask error:", err);
    const status = err?.statusCode || 500;
    return res.status(status).json({
      success: false,
      message:
        status === 500
          ? "The AI tutor is unavailable right now. Please try again."
          : err.message,
    });
  }
};

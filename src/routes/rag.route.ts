import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { authenticate } from "@/middlewares/auth.middleware.js";
import {
  ask,
  listDocuments,
  removeDocument,
  uploadDocument,
} from "@/controllers/rag.controller.js";

const ragRouter = Router();

// Files stay in memory: they are parsed to text immediately and never stored on disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
});

// LLM calls cost money and time — keep one student from hammering them.
const askLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many questions. Please slow down a little." },
});

// Turn multer's own errors (e.g. file too large) into a clean 400 instead of a 500.
const handleUpload = (req: any, res: any, next: any) =>
  upload.single("file")(req, res, (err: any) => {
    if (!err) return next();
    const tooBig = err?.code === "LIMIT_FILE_SIZE";
    return res.status(400).json({
      success: false,
      message: tooBig ? "File is larger than the 15 MB limit" : err.message || "Upload failed",
    });
  });

// Teacher: upload / remove material
ragRouter.post("/:roomId/documents", authenticate, handleUpload, uploadDocument);
ragRouter.delete("/:roomId/documents/:documentId", authenticate, removeDocument);

// Anyone in the room: see what is available, ask a question
ragRouter.get("/:roomId/documents", authenticate, listDocuments);
ragRouter.post("/:roomId/ask", authenticate, askLimiter, ask);

export default ragRouter;

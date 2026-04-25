import express from "express";
import "dotenv/config";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import fs from "fs";
import type { Request } from "express";

import initSocket from "./socket.js";

import authRouter from "./routes/auth.route.js";
import userRouter from "./routes/user.route.js";
import roomRouter from "./routes/room.route.js";
import executeRouter from "./routes/execute.route.js";
import sessionRouter from "./routes/session.route.js";
import { globalErrorHandler } from "./middlewares/error.middleware.js";

const app = express();
app.set("trust proxy", 1);

const defaultAllowedOrigins = [
  "https://www.synccode.dev",
  "https://synccode.dev",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080",
  "https://synccode-backend-production.up.railway.app"
];

const envAllowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOriginSet = new Set([...defaultAllowedOrigins, ...envAllowedOrigins]);

const allowedOriginPatterns = [
  /^https?:\/\/localhost(?::\d+)?$/i,
  /^https:\/\/([a-z0-9-]+\.)?synccode\.dev$/i,
  /^https:\/\/[a-z0-9-]+\.vercel\.app$/i,
  /^https:\/\/[a-z0-9-]+\.netlify\.app$/i
];

const isAllowedOrigin = (origin: string) => {
  if (allowedOriginSet.has(origin)) {
    return true;
  }

  return allowedOriginPatterns.some((pattern) => pattern.test(origin));
};

const corsOptionsDelegate: cors.CorsOptionsDelegate<Request> = (req, callback) => {
  const requestOrigin = req.header("Origin");

  // Non-browser requests (no Origin header) should continue to work.
  if (!requestOrigin) {
    return callback(null, { origin: true, credentials: true });
  }

  if (isAllowedOrigin(requestOrigin)) {
    return callback(null, {
      origin: requestOrigin,
      credentials: true,
      methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
      allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"]
    });
  }

  return callback(null, { origin: false });
};

app.use(cors(corsOptionsDelegate));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());


app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url} | Origin: ${req.headers.origin}`);
  next();
});

app.use("/auth", authRouter);
app.use("/execute", executeRouter);
app.use("/user", userRouter);
app.use("/rooms", roomRouter);
app.use("/sessions", sessionRouter);


app.get("/", (_req, res) => {
  res.json({ message: "Welcome to SyncCode Backend API" });
});

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});


app.use(globalErrorHandler);

const server = http.createServer(app);
initSocket(server);

const startServer = async () => {
  try {
    const PORT = process.env.PORT || 5000;

    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not defined");
    }

    await mongoose.connect(process.env.DATABASE_URL);
    console.log("Database connected");

    server.listen(PORT, () => {
      console.log(` Server running on port ${PORT}`);
    });
  } catch (error: any) {
    console.error("Startup failed:", error.message);
    process.exit(1);
  }
};

startServer();


process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION 💥", err);
  try {
    fs.writeFileSync("crash_uncaught.log", err.stack || err.message);
  } catch { }
  process.exit(1);
});

process.on("unhandledRejection", (err: any) => {
  console.error("UNHANDLED REJECTION 💥", err);
  try {
    fs.writeFileSync("crash_rejection.log", err.stack || err.message);
  } catch { }
  server.close(() => process.exit(1));
});

export default app;

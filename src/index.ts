import express from "express";
import "dotenv/config";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import fs from "fs";

import initSocket from "./socket.js";

import authRouter from "./routes/auth.route.js";
import userRouter from "./routes/user.route.js";
import roomRouter from "./routes/room.route.js";
import executeRouter from "./routes/execute.route.js";
import { globalErrorHandler } from "./middlewares/error.middleware.js";

const app = express();

/* -------------------------------------------------- */
/* 🌍 ALLOWED ORIGINS */
/* -------------------------------------------------- */
const allowedOrigins = [
  "https://www.synccode.dev",
  "https://synccode.dev",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080"
];

/* -------------------------------------------------- */
/* ✅ HARD OPTIONS HANDLER (NODE 22 SAFE) */
/* -------------------------------------------------- */
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin as string | undefined;

    if (origin && allowedOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
    }

    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,DELETE,PATCH,OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With, Accept"
    );

    return res.sendStatus(204);
  }

  next();
});

/* -------------------------------------------------- */
/* 🌍 CORS (NO CALLBACK, NO ERRORS) */
/* -------------------------------------------------- */
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true
  })
);

/* -------------------------------------------------- */
/* 🧠 BODY + COOKIE */
/* -------------------------------------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* -------------------------------------------------- */
/* 🔍 DEBUG LOG */
/* -------------------------------------------------- */
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url} | Origin: ${req.headers.origin}`);
  next();
});

/* -------------------------------------------------- */
/* 🚦 ROUTES */
/* -------------------------------------------------- */
app.use("/auth", authRouter);
app.use("/execute", executeRouter);
app.use("/user", userRouter);
app.use("/rooms", roomRouter);

/* -------------------------------------------------- */
/* 🩺 HEALTH */
/* -------------------------------------------------- */
app.get("/", (_req, res) => {
  res.json({ message: "Welcome to SyncCode Backend API" });
});

app.get("/health", (_req, res) => {
  res.status(200).send("OK");
});

/* -------------------------------------------------- */
/* ❌ GLOBAL ERROR HANDLER */
/* -------------------------------------------------- */
app.use(globalErrorHandler);

/* -------------------------------------------------- */
/* 🚀 SERVER + SOCKET */
/* -------------------------------------------------- */
const server = http.createServer(app);
initSocket(server);

/* -------------------------------------------------- */
/* 🗄️ DB + START */
/* -------------------------------------------------- */
const startServer = async () => {
  try {
    const PORT = process.env.PORT || 5000;

    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not defined");
    }

    await mongoose.connect(process.env.DATABASE_URL);
    console.log("✅ Database connected");

    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (error: any) {
    console.error("❌ Startup failed:", error.message);
    process.exit(1);
  }
};

startServer();

/* -------------------------------------------------- */
/* 💥 SAFETY */
/* -------------------------------------------------- */
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

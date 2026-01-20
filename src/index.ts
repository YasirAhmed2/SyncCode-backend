import express from "express";
import "dotenv/config";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
import http from "http";
import initSocket from "./socket.js";

import authRouter from "./routes/auth.route.js";
import userRouter from "./routes/user.route.js";
import roomRouter from "./routes/room.route.js";
import executeRouter from "./routes/execute.route.js";
import { globalErrorHandler } from "./middlewares/error.middleware.js";

const app = express();

app.use((req, res, next) => {
  console.log(`[DEBUG] ${req.method} ${req.url} | Origin: ${req.headers.origin}`);
  next();
});

/* ---------- MIDDLEWARE ---------- */
app.use(cors({
  origin: (origin, callback) => {
    const allowedOrigins = [
      "https://www.synccode.dev",
      "https://synccode.dev",
      "http://localhost:8080",
      ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(",") : [])
    ];

    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

/* ---------- ROUTES ---------- */
app.use("/auth", authRouter);
app.use("/execute", executeRouter);
app.use("/user", userRouter);
app.use("/rooms", roomRouter);

app.use(globalErrorHandler);

app.get("/", (req, res) => {
  res.json({ message: "Welcome to SyncCode Backend API" });
});

/* ---------- SERVER ---------- */
const server = http.createServer(app);

/* ---------- SOCKET INIT ---------- */
initSocket(server);

/* ---------- START ---------- */
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is not defined");
    }

    await mongoose.connect(process.env.DATABASE_URL);
    console.log("Database Connected Successfully");

    // Only listen after DB is connected
    server.listen(PORT, () => {
      console.log(`Server running at http://localhost:${PORT}`);

      if (!process.env.JWT_SECRET) {
        console.error("FATAL ERROR: JWT_SECRET is not defined.");
      }

      console.log("Registered Routes:");
      if (app._router && app._router.stack) {
        app._router.stack.forEach((r: any) => {
          if (r.route && r.route.path) {
            console.log(`[ROUTE] ${r.route.path}`);
          } else if (r.name === 'router') {
            const routerPathRegex = r.regexp.toString().replace(/^\/\^\\/, '').replace(/\\\/\?\(\?=\\\/\|\$\)\/i$/, '');
            console.log(`[ROUTER] /${routerPathRegex} (${r.handle.name})`);
          }
        });
      } else {
        console.log("Router stack not available for logging.");
      }
    });

  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

startServer();

process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
  console.error(err.name, err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err: any) => {
  console.error('UNHANDLED REJECTION! 💥 Shutting down...');
  console.error(err.name, err.message, err.stack);
  server.close(() => {
    process.exit(1);
  });
});

export default app;


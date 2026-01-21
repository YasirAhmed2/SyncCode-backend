// import express from "express";
// import "dotenv/config";
// import mongoose from "mongoose";
// import cors from "cors";
// import cookieParser from "cookie-parser";
// import http from "http";
// import initSocket from "./socket.js";

// import authRouter from "./routes/auth.route.js";
// import userRouter from "./routes/user.route.js";
// import roomRouter from "./routes/room.route.js";
// import executeRouter from "./routes/execute.route.js";
// import { globalErrorHandler } from "./middlewares/error.middleware.js";
// import fs from "fs";

// const app = express();

// app.use((req, res, next) => {
//   console.log(`[DEBUG] ${req.method} ${req.url} | Origin: ${req.headers.origin}`);
//   next();
// });

// // Define allowed origins
// const allowedOrigins = [
//   "https://www.synccode.dev",
//   "https://synccode.dev",
//   "http://localhost:5173",
//   "http://localhost:3000",
//   "http://localhost:8080"
// ];

// // CORS Options
// const corsOptions = {
//   origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
//     // Allow requests with no origin (like mobile apps or curl requests)
//     if (!origin) return callback(null, true);

//     if (allowedOrigins.includes(origin)) {
//       return callback(null, true);
//     }

//     console.error(`[CORS] Blocked request from origin: ${origin}`);
//     callback(new Error("Not allowed by CORS"));
//   },
//   credentials: true,
//   methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
//   allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept"],
//   exposedHeaders: ["Set-Cookie"]
// };

// // Apply CORS middleware
// app.use(cors(corsOptions));



// app.use(express.json());
// app.use(express.urlencoded({ extended: true }));
// app.use(cookieParser());

// /* ---------- ROUTES ---------- */
// app.use("/auth", authRouter);
// app.use("/execute", executeRouter);
// app.use("/user", userRouter);
// app.use("/rooms", roomRouter);

// app.use(globalErrorHandler);

// app.get("/", (req, res) => {
//   res.json({ message: "Welcome to SyncCode Backend API" });
// });

// app.get("/health", (req, res) => {
//   res.status(200).send("OK");
// });

// /* ---------- SERVER ---------- */
// const server = http.createServer(app);

// /* ---------- SOCKET INIT ---------- */
// initSocket(server);

// /* ---------- START ---------- */
// const PORT = process.env.PORT;

// const startServer = async () => {
//   const PORT = process.env.PORT || 5000;

//   server.listen(PORT, () => {
//     console.log(`Server running on port ${PORT}`);
//   });

//   try {
//     if (!process.env.DATABASE_URL) {
//       throw new Error("DATABASE_URL is not defined");
//     }
//     await mongoose.connect(process.env.DATABASE_URL);
//     console.log("Database Connected Successfully");
//   } catch (error) {
//     console.error("Database connection failed:", error);
//   }
// };

// startServer();


// process.on('uncaughtException', (err) => {
//   console.error('UNCAUGHT EXCEPTION! 💥 Shutting down...');
//   console.error(err.name, err.message, err.stack);
//   try {
//     fs.writeFileSync('crash_uncaught.log', `Error: ${err.message}\nStack: ${err.stack}\n`);
//   } catch (e) {
//     console.error("Failed to write crash log", e);
//   }
//   process.exit(1);
// });

// process.on('unhandledRejection', (err: any) => {
//   console.error('UNHANDLED REJECTION! 💥 Shutting down...');
//   console.error(err.name, err.message, err.stack);
//   try {
//     fs.writeFileSync('crash.log', `Error: ${err.message}\nStack: ${err.stack}\n`);
//   } catch (e) {
//     console.error("Failed to write crash log", e);
//   }
//   server.close(() => {
//     process.exit(1);
//   });
// });

// export default app;



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
/* 🔍 DEBUG LOGGER */
/* -------------------------------------------------- */
app.use((req, res, next) => {
  console.log(`[${req.method}] ${req.url} | Origin: ${req.headers.origin}`);
  next();
});

/* -------------------------------------------------- */
/* 🌍 CORS CONFIG */
/* -------------------------------------------------- */
const allowedOrigins = [
  "https://www.synccode.dev",
  "https://synccode.dev",
  "http://localhost:5173",
  "http://localhost:3000",
  "http://localhost:8080"
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server / health checks
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.warn(`[CORS BLOCKED] Origin: ${origin}`);
    return callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept"
  ],
  exposedHeaders: ["Set-Cookie"]
};

/* 🔥 MUST COME BEFORE ROUTES */
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* -------------------------------------------------- */
/* 🧠 BODY & COOKIE PARSERS */
/* -------------------------------------------------- */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

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
app.get("/", (req, res) => {
  res.json({ message: "Welcome to SyncCode Backend API" });
});

app.get("/health", (req, res) => {
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
/* 🗄️ DB + SERVER START */
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
/* 💥 CRASH SAFETY */
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

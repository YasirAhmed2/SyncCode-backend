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

const app = express();

/* ---------- MIDDLEWARE ---------- */
app.use(cors({
  origin: ["https://www.synccode.dev", "https://synccode.dev", "http://localhost:8080"],
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

app.get("/", (req, res) => {
  res.json({ message: "Welcome to SyncCode Backend API" });
});

/* ---------- SERVER ---------- */
const server = http.createServer(app);

/* ---------- SOCKET INIT ---------- */
initSocket(server);

/* ---------- START ---------- */
const PORT = process.env.PORT || 5000;
server.listen(PORT, async () => {
  try {
    await mongoose.connect(process.env.DATABASE_URL);
    console.log("Database Connected Successfully");
  } catch (error) {
    console.log("DB Error:", error);
  }
  console.log(`Server running at http://localhost:${PORT}`);
});
export default app;


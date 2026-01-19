import express from "express";
import "dotenv/config";
import mongoose from "mongoose";
import cors from "cors";
import cookieParser from "cookie-parser";
// import http from "http";
import authRouter from "./routes/auth.route.js";
import userRouter from "./routes/user.route.js";
import roomRouter from "./routes/room.route.js";
import executeRouter from "./routes/execute.route.js";
// import  initSocket  from "./socket.js";
const app = express();
/* ---------- MIDDLEWARE ---------- */
app.use(cors({
    origin: "http://localhost:8080",
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
// /* ---------- SERVER ---------- */
// const server = http.createServer(app);
// /* ---------- SOCKET INIT ---------- */
// initSocket(server);
/* ---------- START ---------- */
app.listen(5000, async () => {
    try {
        await mongoose.connect(process.env.DATABASE_URL);
        console.log("Database Connected Successfully");
    }
    catch (error) {
        console.log("DB Error:", error);
    }
    console.log("Server running at http://localhost:5000");
});
export default app;

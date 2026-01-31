import { Router } from "express";
import { authenticate } from "@/middlewares/auth.middleware.js";
import { createRoom, joinRoom, getRoomDetails, saveRoomCode, loadRoomCode, getMyRooms } from "@/controllers/room.controller.js";

const roomRouter = Router();

roomRouter.post("/create", authenticate, createRoom);
roomRouter.get("/my-rooms", authenticate, getMyRooms);
roomRouter.post("/join/:roomId", authenticate, joinRoom);
roomRouter.get("/:roomId/participants", authenticate, getRoomDetails); // Adjusted to match roomService.getParticipants if that calls /:roomId/participants? 


roomRouter.get("/:roomId/participants", authenticate, getRoomDetails); // This seems to be what `getRoomDetails` was doing, or maybe it was doing general details. 

roomRouter.put("/:roomId/code/save", authenticate, saveRoomCode);
roomRouter.get("/:roomId/code", authenticate, loadRoomCode);

roomRouter.get("/:roomId", authenticate, getRoomDetails);
export default roomRouter;
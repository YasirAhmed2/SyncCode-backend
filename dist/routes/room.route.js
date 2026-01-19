import { Router } from "express";
import { authenticate } from "@/middlewares/auth.middleware.js";
import { createRoom, joinRoom, getRoomDetails, saveRoomCode, loadRoomCode, getMyRooms } from "@/controllers/room.controller.js";
const roomRouter = Router();
roomRouter.post("/create", authenticate, createRoom);
roomRouter.get("/my-rooms", authenticate, getMyRooms);
roomRouter.post("/join/:roomId", authenticate, joinRoom);
roomRouter.get("/:roomId/participants", authenticate, getRoomDetails); // Adjusted to match roomService.getParticipants if that calls /:roomId/participants? 
// Wait, roomService.getParticipants calls `/rooms/${roomId}/participants`. 
// But room.route.ts had `roomRouter.get("/:roomId", ... getRoomDetails)`. 
// Let's check roomService again to be exact.
// roomService.getParticipants -> api.get(`/rooms/${roomId}/participants`)
// roomService.loadCode -> api.get(`/rooms/${roomId}/code`)
// roomService.saveCode -> api.post(`/rooms/${roomId}/code/save`)
// roomService.joinRoom -> api.post(`/rooms/join/${roomId}`)
roomRouter.get("/:roomId/participants", authenticate, getRoomDetails); // This seems to be what `getRoomDetails` was doing, or maybe it was doing general details. 
// `getRoomDetails` implementation populates participants. 
// I will map `/:roomId/participants` to `getRoomDetails` as requested by frontend.
roomRouter.put("/:roomId/code/save", authenticate, saveRoomCode);
roomRouter.get("/:roomId/code", authenticate, loadRoomCode);
// If there is a generic get room details, generic `/:roomId` should be last.
// frontend doesn't seem to have a generic "get room info" other than join.
// But let's keep `/:roomId` if needed, but put it last.
roomRouter.get("/:roomId", authenticate, getRoomDetails);
export default roomRouter;

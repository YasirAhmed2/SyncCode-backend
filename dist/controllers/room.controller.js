import Room from "@/models/room.mongo.js";
import { generateRoomId } from "@/utils/roomId.utils.js";
export const createRoom = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const { language } = req.body;
        const room = await Room.create({
            roomId: generateRoomId(),
            createdBy: userId,
            participants: [userId],
            language: language || "javascript",
        });
        res.status(201).json({
            success: true,
            message: "Room created successfully",
            room: {
                roomId: room.roomId,
                createdBy: room.createdBy,
                language: room.language,
            },
        });
    }
    catch (error) {
        console.error("Create room error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
// export const joinRoom = async (req, res: Response) => {
//   try {
//     const userId = req.user?.userId;
//     const { roomId } = req.params;
// console.log("Room ID:", roomId);
//     if (!userId) {
//       return res.status(401).json({ message: "Unauthorized" });
//     }
//     const room = await Room.findOne({ roomId });
//     if (!room) {
//       return res.status(404).json({ message: "Room not found" });
//     }
//     // Prevent duplicate join
//     if (room.participants.includes(userId)) {
//       return res.status(400).json({ message: "User already joined room" });
//     }
//     room.participants.push(userId);
//     await room.save();
//     res.status(200).json({
//       success: true,
//       message: "Joined room successfully",
//       room: {
//         roomId: room.roomId,
//         participantsCount: room.participants.length,
//         language: room.language,
//       },
//     });
//     const messages = await Chat.find({ roomId })
//   .populate("sender", "name email")
//   .sort({ createdAt: 1 })
//   .limit(50);
// // @ts-ignore
// Socket.emit("chat-history", messages);
//   } catch (error) {
//     console.error("Join room error:", error);
//     res.status(500).json({ message: "Server error" });
//   }
// };
export const joinRoom = async (req, res) => {
    try {
        const userId = req.user?.userId; // Use consistent property
        const roomId = req.params.roomId;
        const room = await Room.findOne({
            roomId: roomId,
        }).populate("participants", "name email");
        if (!room) {
            return res.status(404).json({
                success: false,
                message: "Room not found",
            });
        }
        // Add user to participants if not already
        const isParticipant = room.participants.some((p) => p._id.toString() === userId.toString());
        if (!isParticipant) {
            room.participants.push(userId); // Mongoose handles ID casting
            await room.save();
            // Re-populate to get the new user's details
            await room.populate("participants", "name email");
        }
        res.status(200).json({
            success: true,
            room: {
                roomId: room.roomId,
                language: room.language,
                code: room.code,
                participants: room.participants,
            },
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Failed to join room",
        });
    }
};
export const getRoomDetails = async (req, res) => {
    try {
        const { roomId } = req.params;
        const room = await Room.findOne({ roomId })
            .populate("createdBy", "name email")
            .populate("participants", "name email");
        if (!room) {
            return res.status(404).json({
                success: false,
                message: "Room not found",
            });
        }
        return res.status(200).json({
            success: true,
            data: {
                roomId: room.roomId,
                createdBy: room.createdBy,
                participants: room.participants,
                totalParticipants: room.participants.length,
            },
        });
    }
    catch (error) {
        console.error("Get room details error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
export const saveRoomCode = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { code, language } = req.body;
        const userId = req.user?.userId;
        // ... (rest is unchanged)
        // Actually I should not replace the whole file if I can avoid it, but replace multiple functions is cleaner 
        // to ensure no scope issues. But let's stick to the instruction: replace chunks via replace_file_content 
        // or simply replace the specific functions.
        // I will use replace for joinRoom first.
        // Wait, I can only use replace_file_content for a single block.
        // I need to change joinRoom AND getMyRooms.
        // I will use multi_replace for this.
        // Cancelling this single replace and using multi_replace.
    }
    catch (error) {
        //...
    }
};
export const getRoomDetails = async (req, res) => {
    try {
        const { roomId } = req.params;
        const room = await Room.findOne({ roomId })
            .populate("createdBy", "name email")
            .populate("participants", "name email");
        if (!room) {
            return res.status(404).json({
                success: false,
                message: "Room not found",
            });
        }
        return res.status(200).json({
            success: true,
            data: {
                roomId: room.roomId,
                createdBy: room.createdBy,
                participants: room.participants,
                totalParticipants: room.participants.length,
            },
        });
    }
    catch (error) {
        console.error("Get room details error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
export const saveRoomCode = async (req, res) => {
    try {
        const { roomId } = req.params;
        const { code, language } = req.body;
        const userId = req.user?.userId;
        if (!code || !language) {
            return res.status(400).json({
                message: "Code and language are required",
            });
        }
        const room = await Room.findOne({ roomId });
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        // Only participants can save code
        if (!room.participants.includes(userId)) {
            return res.status(403).json({
                message: "You are not a participant of this room",
            });
        }
        room.code = code;
        room.language = language;
        await room.save();
        res.status(200).json({
            success: true,
            message: "Code saved successfully",
        });
    }
    catch (error) {
        console.error("Save code error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
export const loadRoomCode = async (req, res) => {
    try {
        const { roomId } = req.params;
        const userId = req.user?.userId;
        const room = await Room.findOne({ roomId }).select("code language participants");
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        // Only participants can view code
        if (!room.participants.includes(userId)) {
            return res.status(403).json({
                message: "You are not a participant of this room",
            });
        }
        res.status(200).json({
            success: true,
            data: {
                code: room.code,
                language: room.language,
            },
        });
    }
    catch (error) {
        console.error("Load code error:", error);
        res.status(500).json({ message: "Server error" });
    }
};
export const getMyRooms = async (req, res) => {
    try {
        const userId = req.user?.userId;
        console.log("Fetching rooms for userId:", userId);
        const rooms = await Room.find({
            $or: [
                { createdBy: userId },
                { participants: userId },
            ],
        })
            .sort({ updatedAt: -1 })
            .select("roomId language updatedAt");
        res.status(200).json({
            success: true,
            rooms,
        });
    }
    catch (error) {
        console.error(error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch rooms",
        });
    }
};

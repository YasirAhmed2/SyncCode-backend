import Room from "@/models/room.mongo.js";
import { generateRoomId } from "@/utils/roomId.utils.js";
export const createRoom = async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const { language } = req.body;
        const defaultCode = language === "python"
            ? "print('Hello, World!')"
            : "console.log('Hello, World!');";
        const room = await Room.create({
            roomId: generateRoomId(),
            createdBy: userId,
            participants: [userId],
            language: language || "javascript",
            code: defaultCode,
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
export const joinRoom = async (req, res) => {
    try {
        const userId = req.user?.userId;
        const { roomId } = req.params;
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized" });
        }
        const room = await Room.findOne({ roomId });
        if (!room) {
            return res.status(404).json({ message: "Room not found" });
        }
        // Prevent duplicate join, but ensure user is in participants list
        // Mongoose ObjectIDs need careful comparison, but 'includes' might not work directly with ObjectIDs if strictly typed.
        // Ideally we cast to string. However, let's follow the schema which is ObjectId[].
        const isParticipant = room.participants.some((p) => p.toString() === userId);
        if (!isParticipant) {
            room.participants.push(userId);
            await room.save();
        }
        // Re-fetch populated to return to user
        const populatedRoom = await Room.findOne({ roomId }).populate("participants", "name email");
        res.status(200).json({
            success: true,
            message: "Joined room successfully",
            room: {
                roomId: room.roomId,
                participantsCount: room.participants.length,
                language: room.language,
                code: room.code,
                participants: populatedRoom?.participants,
            },
        });
    }
    catch (error) {
        console.error("Join room error:", error);
        res.status(500).json({ message: "Server error" });
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
                language: room.language,
                code: room.code,
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
        if (!code && !language) { // Allow saving just one or the other, or both.
            // actually the requirements usually imply strictness, but let's allow partial updates if needed, 
            // OR stick to the previous logic: "Code and language are required"
            // I'll assume at least one is needed for an update.
        }
        // Previous logic was strict. Let's keep it strict if that's safer, or allow relaxed.
        // The previous valid function had: if (!code || !language).
        // I will stick to that to be safe.
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
        const isParticipant = room.participants.some((p) => p.toString() === userId);
        if (!isParticipant) {
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
        const isParticipant = room.participants.some((p) => p.toString() === userId);
        if (!isParticipant) {
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
        console.error("Get my rooms error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to fetch rooms",
        });
    }
};

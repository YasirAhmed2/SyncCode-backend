import { Server } from 'socket.io';
import Room from './models/room.mongo.js';
import { Server as HttpServer } from 'http';
import * as RecordingService from './services/recording.service.js';

// Store timeouts for debounced saving
const timeouts: Record<string, NodeJS.Timeout> = {};

// Track active users in each room
const activeUsers: Record<string, Map<string, { userId: string; userName: string; socketId: string; avatarColor: string }>> = {};

type ActivityStatus = 'active' | 'idle' | 'inactive';

type RoomActivityEntry = {
    lastActive: number;
    isTyping: boolean;
};

// In-memory engagement state; never persisted to MongoDB.
const roomActivity: Record<string, Record<string, RoomActivityEntry>> = {};
const roomActivityTimers: Record<string, NodeJS.Timeout> = {};

const ACTIVE_WINDOW_MS = 5000;
const IDLE_WINDOW_MS = 15000;
const ACTIVITY_EMIT_INTERVAL_MS = 2500;

type RoomChatMessage = {
    id: string;
    userId: string;
    userName: string;
    avatarColor: string;
    content: string;
    timestamp: string;
};

const roomChatHistory: Record<string, RoomChatMessage[]> = {};
const socketRoomMembership: Record<string, { roomId: string; userId: string; userName: string }> = {};

type RoomControlState = {
    teacherId: string;
    mode: 'broadcast' | 'practice';
    isLocked: boolean;
};

const roomControlState: Record<string, RoomControlState> = {};
const pendingCodeBroadcasts: Record<string, { code: string; changedBy: { userId: string; userName: string } }> = {};
const codeBroadcastTimers: Record<string, NodeJS.Timeout> = {};

const clearRoomState = (roomId: string) => {
    delete activeUsers[roomId];
    delete roomControlState[roomId];
    delete pendingCodeBroadcasts[roomId];
    delete roomActivity[roomId];

    if (codeBroadcastTimers[roomId]) {
        clearTimeout(codeBroadcastTimers[roomId]);
        delete codeBroadcastTimers[roomId];
    }

    if (roomActivityTimers[roomId]) {
        clearInterval(roomActivityTimers[roomId]);
        delete roomActivityTimers[roomId];
    }
};

const cleanupRoomIfEmpty = (roomId: string) => {
    if (activeUsers[roomId]?.size === 0) {
        clearRoomState(roomId);
    }
};

const getTeacherSocketId = (roomId: string) => {
    const teacherId = roomControlState[roomId]?.teacherId;
    if (!teacherId) {
        return null;
    }

    return activeUsers[roomId]?.get(teacherId)?.socketId || null;
};

const getUserActivityStatus = (entry: RoomActivityEntry): ActivityStatus => {
    const elapsed = Date.now() - entry.lastActive;

    if (entry.isTyping || elapsed < ACTIVE_WINDOW_MS) {
        return 'active';
    }

    if (elapsed < IDLE_WINDOW_MS) {
        return 'idle';
    }

    return 'inactive';
};

const ensureRoomActivityTicker = (io: Server, roomId: string) => {
    if (roomActivityTimers[roomId]) {
        return;
    }

    roomActivityTimers[roomId] = setInterval(() => {
        if (!roomActivity[roomId] || Object.keys(roomActivity[roomId]).length === 0) {
            clearInterval(roomActivityTimers[roomId]);
            delete roomActivityTimers[roomId];
            return;
        }

        const teacherSocketId = getTeacherSocketId(roomId);
        if (!teacherSocketId) {
            clearInterval(roomActivityTimers[roomId]);
            delete roomActivityTimers[roomId];
            return;
        }

        const users = Object.entries(roomActivity[roomId]).map(([userId, activity]) => ({
            userId,
            status: getUserActivityStatus(activity),
            lastActive: activity.lastActive,
        }));

        io.to(teacherSocketId).emit('activity-update', {
            roomId,
            users,
        });
    }, ACTIVITY_EMIT_INTERVAL_MS);
};

const syncRoomActivityForTeacher = (io: Server, roomId: string) => {
    const teacherSocketId = getTeacherSocketId(roomId);
    if (!teacherSocketId || !roomActivity[roomId]) {
        return;
    }

    const users = Object.entries(roomActivity[roomId]).map(([userId, activity]) => ({
        userId,
        status: getUserActivityStatus(activity),
        lastActive: activity.lastActive,
    }));

    io.to(teacherSocketId).emit('activity-update', {
        roomId,
        users,
    });
};

const setUserActivity = (io: Server, roomId: string, userId: string, patch: Partial<RoomActivityEntry>) => {
    if (!roomActivity[roomId]) {
        roomActivity[roomId] = {};
    }

    const current = roomActivity[roomId][userId] || { lastActive: Date.now(), isTyping: false };
    roomActivity[roomId][userId] = {
        lastActive: patch.lastActive ?? current.lastActive,
        isTyping: patch.isTyping ?? current.isTyping,
    };

    ensureRoomActivityTicker(io, roomId);
    syncRoomActivityForTeacher(io, roomId);
};

const removeUserActivity = (io: Server, roomId: string, userId: string) => {
    if (!roomActivity[roomId]) {
        return;
    }

    delete roomActivity[roomId][userId];

    if (Object.keys(roomActivity[roomId]).length === 0) {
        delete roomActivity[roomId];
        if (roomActivityTimers[roomId]) {
            clearInterval(roomActivityTimers[roomId]);
            delete roomActivityTimers[roomId];
        }
        return;
    }

    syncRoomActivityForTeacher(io, roomId);
};

const getOrLoadRoomControlState = async (roomId: string): Promise<RoomControlState | null> => {
    if (roomControlState[roomId]) {
        return roomControlState[roomId];
    }

    const room = await Room.findOne({ roomId }).select('teacherId mode isLocked');
    if (!room) {
        return null;
    }

    const state: RoomControlState = {
        teacherId: room.teacherId?.toString(),
        mode: room.mode,
        isLocked: room.isLocked,
    };
    roomControlState[roomId] = state;
    return state;
};

const queueCodeBroadcast = (
    io: Server,
    roomId: string,
    payload: { code: string; changedBy: { userId: string; userName: string } }
) => {
    pendingCodeBroadcasts[roomId] = payload;

    if (codeBroadcastTimers[roomId]) {
        return;
    }

    codeBroadcastTimers[roomId] = setTimeout(() => {
        const latest = pendingCodeBroadcasts[roomId];
        delete pendingCodeBroadcasts[roomId];
        delete codeBroadcastTimers[roomId];

        if (!latest) {
            return;
        }

        io.to(roomId).emit('code-update', {
            code: latest.code,
            changedBy: latest.changedBy,
            timestamp: new Date()
        });
    }, 35);
};

const getRoomForTeacherAction = async (roomId: string, userId: string) => {
    const room = await Room.findOne({ roomId }).select('teacherId participants mode isLocked');
    if (!room) return { room: null, allowed: false };

    const isParticipant = room.participants.some((participant: any) => participant.toString() === userId);
    const isTeacher = room.teacherId?.toString() === userId;
    return { room, allowed: isParticipant && isTeacher };
};

const initSocket = (server: HttpServer) => {
    const io = new Server(server, {
        cors: {
            // Allow both frontend ports and localhost
            origin: ["https://www.synccode.dev", "https://synccode.dev", "http://localhost:8080", "http://localhost:5173", "http://localhost:3000"],
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    io.on('connection', (socket) => {
        console.log('Socket connected:', socket.id);

        socket.on('join-room', async ({ roomId, userId, userName, avatarColor }) => {
            socket.join(roomId);
            socketRoomMembership[socket.id] = {
                roomId,
                userId,
                userName,
            };
            
            // Initialize room tracking if needed
            if (!activeUsers[roomId]) {
                activeUsers[roomId] = new Map();
            }

            // Add user to active users
            activeUsers[roomId].set(userId, {
                userId,
                userName,
                socketId: socket.id,
                avatarColor: avatarColor || '#00D9FF'
            });

            setUserActivity(io, roomId, userId, {
                lastActive: Date.now(),
                isTyping: false,
            });

            console.log(`User ${userName} (${userId}) joined room ${roomId}`);
            console.log(`Active users in ${roomId}:`, Array.from(activeUsers[roomId].values()));

            // Broadcast updated participant list to ALL users including the new user
            const participants = Array.from(activeUsers[roomId].values()).map(user => ({
                id: user.userId,
                name: user.userName,
                avatarColor: user.avatarColor,
                isOnline: true
            }));

            io.to(roomId).emit('participants-updated', { participants });
            io.to(roomId).emit('user-joined', { userId, userName, avatarColor });

            const room = await Room.findOne({ roomId }).select('teacherId mode isLocked');
            if (room) {
                roomControlState[roomId] = {
                    teacherId: room.teacherId?.toString(),
                    mode: room.mode,
                    isLocked: room.isLocked,
                };
                socket.emit('room-control-state', {
                    teacherId: room.teacherId,
                    mode: room.mode,
                    isLocked: room.isLocked,
                });
            }

            syncRoomActivityForTeacher(io, roomId);

            // Send latest chat history to the newly joined user.
            socket.emit('room-chat-history', { messages: roomChatHistory[roomId] || [] });

            // 🎬 Start recording when first user joins (fire-and-forget).
            void RecordingService.startRecording(roomId);
        });

        socket.on('user-activity', async ({ roomId, userId, source }) => {
            if (source !== 'local') return;
            const membership = socketRoomMembership[socket.id];
            if (!membership || membership.roomId !== roomId || membership.userId !== userId) {
                return;
            }
            const controlState = await getOrLoadRoomControlState(roomId);
            if (!controlState || controlState.mode !== 'practice') return;
            if (controlState.teacherId === userId) return;
            setUserActivity(io, roomId, userId, {
                lastActive: Date.now(),
            });
        });


        socket.on('user-typing', async ({ roomId, userId, source }) => {
            if (source !== 'local') return;
            const membership = socketRoomMembership[socket.id];
            if (!membership || membership.roomId !== roomId || membership.userId !== userId) {
                return;
            }
            const controlState = await getOrLoadRoomControlState(roomId);
            if (!controlState || controlState.mode !== 'practice') return;
            if (controlState.teacherId === userId) return;
            setUserActivity(io, roomId, userId, {
                lastActive: Date.now(),
                isTyping: true,
            });
        });



        socket.on('user-stop-typing', async ({ roomId, userId, source }) => {
            if (source !== 'local') return;
            const membership = socketRoomMembership[socket.id];
            if (!membership || membership.roomId !== roomId || membership.userId !== userId) {
                return;
            }
            const controlState = await getOrLoadRoomControlState(roomId);
            if (!controlState || controlState.mode !== 'practice') return;
            if (controlState.teacherId === userId) return;
            setUserActivity(io, roomId, userId, {
                isTyping: false,
            });
        });



        socket.on('leave-room', ({ roomId, userId }) => {
            socket.leave(roomId);
            delete socketRoomMembership[socket.id];
            
            // Remove user from active users
            if (activeUsers[roomId]) {
                activeUsers[roomId].delete(userId);
                removeUserActivity(io, roomId, userId);
                console.log(`User ${userId} left room ${roomId}`);

                // Broadcast updated participant list
                const participants = Array.from(activeUsers[roomId].values()).map(user => ({
                    id: user.userId,
                    name: user.userName,
                    avatarColor: user.avatarColor,
                    isOnline: true
                }));

                io.to(roomId).emit('participants-updated', { participants });
                io.to(roomId).emit('user-left', { userId });

                // 🎬 Stop recording when last user leaves and notify teacher.
                if (activeUsers[roomId].size === 0) {
                    void RecordingService.stopRecording(roomId).then(() => {
                        // Notify all clients (they may still be connected briefly)
                        io.to(roomId).emit('session-insights-ready', { roomId });
                    });
                }

                // Clean up empty rooms
                cleanupRoomIfEmpty(roomId);
            }
        });

        socket.on('code-change', async ({ roomId, code, language, userId, userName }) => {
            const membership = socketRoomMembership[socket.id];
            if (!membership || membership.roomId !== roomId) {
                return;
            }

            const controlState = await getOrLoadRoomControlState(roomId);
            if (!controlState) {
                return;
            }

            const isTeacher = controlState.teacherId === membership.userId;
            const blockStudentEdit = controlState.isLocked;

            if (!isTeacher && blockStudentEdit) {
                return;
            }

            // Coalesce bursty typing into lightweight room broadcasts.
            queueCodeBroadcast(io, roomId, {
                code,
                changedBy: { userId, userName },
            });

            // Debounce database save (2 seconds)
            if (timeouts[roomId]) {
                clearTimeout(timeouts[roomId]);
            }

            timeouts[roomId] = setTimeout(async () => {
                try {
                    await Room.findOneAndUpdate(
                        { roomId },
                        { code, language, updatedAt: new Date() }
                    );
                    console.log(`Auto-saved code for room ${roomId}`);
                    delete timeouts[roomId];
                } catch (err) {
                    console.error('Auto-save failed:', err);
                }
            }, 2000);

            // 🎬 Record code snapshot (fire-and-forget, throttled inside service).
            void RecordingService.addSnapshot(roomId, userId, code);
        });

        socket.on('language-change', async ({ roomId, language, userId, userName }) => {
            io.to(roomId).emit('language-update', {
                language,
                changedBy: { userId, userName }
            });

            try {
                await Room.findOneAndUpdate(
                    { roomId },
                    { language, updatedAt: new Date() }
                );
            } catch (err) {
                console.error('Language save failed:', err);
            }
        });

        socket.on('toggle-mode', async ({ roomId, mode }) => {
            if (!roomId || !mode || !['broadcast', 'practice'].includes(mode)) {
                return;
            }

            const membership = socketRoomMembership[socket.id];
            if (!membership || membership.roomId !== roomId) {
                return;
            }

            const { room, allowed } = await getRoomForTeacherAction(roomId, membership.userId);
            if (!room || !allowed) {
                return;
            }

            room.mode = mode;
            // Practice mode always unlocks editor for collaborative editing.
            if (mode === 'practice') {
                room.isLocked = false;
            }
            await room.save();

            roomControlState[roomId] = {
                teacherId: room.teacherId?.toString(),
                mode: room.mode,
                isLocked: room.isLocked,
            };

            io.to(roomId).emit('room-mode-updated', {
                mode: room.mode,
                teacherId: room.teacherId,
            });

            io.to(roomId).emit('room-lock-updated', {
                isLocked: room.isLocked,
                teacherId: room.teacherId,
            });
        });

        socket.on('lock-editor', async ({ roomId, isLocked }) => {
            if (!roomId || typeof isLocked !== 'boolean') {
                return;
            }

            const membership = socketRoomMembership[socket.id];
            if (!membership || membership.roomId !== roomId) {
                return;
            }

            const { room, allowed } = await getRoomForTeacherAction(roomId, membership.userId);
            if (!room || !allowed) {
                return;
            }

            room.isLocked = isLocked;
            // Locking students should always force broadcast mode.
            if (isLocked) {
                room.mode = 'broadcast';
            } else {
                // Unlocked means collaborative practice mode.
                room.mode = 'practice';
            }
            await room.save();

            roomControlState[roomId] = {
                teacherId: room.teacherId?.toString(),
                mode: room.mode,
                isLocked: room.isLocked,
            };

            io.to(roomId).emit('room-lock-updated', {
                isLocked: room.isLocked,
                teacherId: room.teacherId,
            });

            io.to(roomId).emit('room-mode-updated', {
                mode: room.mode,
                teacherId: room.teacherId,
            });
        });

        socket.on('remove-participant', async ({ roomId, targetUserId }) => {
            if (!roomId || !targetUserId) {
                return;
            }

            const membership = socketRoomMembership[socket.id];
            if (!membership || membership.roomId !== roomId) {
                return;
            }

            const { room, allowed } = await getRoomForTeacherAction(roomId, membership.userId);
            if (!room || !allowed) {
                return;
            }

            // Teacher cannot remove themselves.
            if (room.teacherId?.toString() === targetUserId) {
                return;
            }

            room.participants = room.participants.filter(
                (participant: any) => participant.toString() !== targetUserId
            );
            await room.save();

            const targetActiveUser = activeUsers[roomId]?.get(targetUserId);
            if (targetActiveUser) {
                const targetSocket = io.sockets.sockets.get(targetActiveUser.socketId);
                if (targetSocket) {
                    targetSocket.leave(roomId);
                    targetSocket.emit('removed-from-room', {
                        roomId,
                        removedBy: membership.userName,
                    });
                }
                activeUsers[roomId].delete(targetUserId);
            }

            removeUserActivity(io, roomId, targetUserId);

            const participants = Array.from(activeUsers[roomId]?.values() || []).map(user => ({
                id: user.userId,
                name: user.userName,
                avatarColor: user.avatarColor,
                isOnline: true
            }));

            io.to(roomId).emit('participants-updated', { participants });
            io.to(roomId).emit('participant-removed', {
                targetUserId,
                removedBy: membership.userName,
            });
        });

        socket.on('broadcast-code', async ({ roomId, code }) => {
            if (!roomId || typeof code !== 'string') {
                return;
            }

            const membership = socketRoomMembership[socket.id];
            if (!membership || membership.roomId !== roomId) {
                return;
            }

            const { room, allowed } = await getRoomForTeacherAction(roomId, membership.userId);
            if (!room || !allowed) {
                return;
            }

            await Room.findOneAndUpdate(
                { roomId },
                { code, updatedAt: new Date() }
            );

            io.to(roomId).emit('code-update', {
                code,
                changedBy: { userId: membership.userId, userName: membership.userName },
                timestamp: new Date(),
                isBroadcast: true,
            });
        });

        socket.on('cursor-change', ({ roomId, cursorData }) => {
            // cursorData: { userId, userName, lineNumber, column, color }
            // Broadcast to others (not the sender)
            socket.to(roomId).emit('cursor-update', cursorData);
        });

        socket.on('chat-message', ({ roomId, message, userId, userName, avatarColor }) => {
            const content = message?.content?.toString().trim();

            if (!roomId || !userId || !userName || !content) {
                return;
            }

            const outgoingMessage: RoomChatMessage = {
                id: message?.id || `msg_${Date.now()}_${socket.id.slice(-6)}`,
                userId,
                userName,
                avatarColor: avatarColor || '#00D9FF',
                content,
                timestamp: new Date().toISOString(),
            };

            if (!roomChatHistory[roomId]) {
                roomChatHistory[roomId] = [];
            }

            roomChatHistory[roomId].push(outgoingMessage);
            // Keep only recent messages in memory.
            if (roomChatHistory[roomId].length > 100) {
                roomChatHistory[roomId] = roomChatHistory[roomId].slice(-100);
            }

            io.to(roomId).emit('chat-message', outgoingMessage);
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected:', socket.id);
            delete socketRoomMembership[socket.id];
            
            // Clean up user from all rooms
            for (const roomId in activeUsers) {
                for (const [userId, user] of activeUsers[roomId].entries()) {
                    if (user.socketId === socket.id) {
                        activeUsers[roomId].delete(userId);
                        
                        // Broadcast updated participant list
                        const participants = Array.from(activeUsers[roomId].values()).map(u => ({
                            id: u.userId,
                            name: u.userName,
                            avatarColor: u.avatarColor,
                            isOnline: true
                        }));

                        io.to(roomId).emit('participants-updated', { participants });
                        io.to(roomId).emit('user-left', { userId });
                        removeUserActivity(io, roomId, userId);

                        // 🎬 Stop recording when last user disconnects.
                        if (activeUsers[roomId].size === 0) {
                            void RecordingService.stopRecording(roomId).then(() => {
                                io.to(roomId).emit('session-insights-ready', { roomId });
                            });
                        }

                        // Clean up empty rooms
                        cleanupRoomIfEmpty(roomId);
                    }
                }
            }
        });
    });

    console.log('Socket.IO attached');
    return io;
};

export default initSocket;
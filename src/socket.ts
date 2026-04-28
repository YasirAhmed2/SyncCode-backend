import { Server } from 'socket.io';
import Room from './models/room.mongo.js';
import { Server as HttpServer } from 'http';
import * as RecordingService from './services/recording.service.js';
import * as Y from 'yjs';
import { Awareness, applyAwarenessUpdate, encodeAwarenessUpdate } from 'y-protocols/awareness';

const AUTO_SAVE_INTERVAL_MS = 60_000;
const autoSaveTimers: Record<string, NodeJS.Timeout> = {};
const pendingAutoSaves: Record<string, { code: string; language: string; yjsState?: string }> = {};

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
const roomYDocs: Record<string, Y.Doc> = {};
const roomAwareness: Record<string, Awareness> = {};

const CODE_FIELD = 'code';

const normalizeBinary = (payload: unknown): Uint8Array => {
    if (!payload) return new Uint8Array();
    if (payload instanceof Uint8Array) return payload;
    if (payload instanceof ArrayBuffer) return new Uint8Array(payload);

    // Socket.IO on Node often delivers Buffers.
    if (Buffer.isBuffer(payload)) {
        return new Uint8Array(payload);
    }

    // May arrive as number[]
    if (Array.isArray(payload)) {
        return new Uint8Array(payload);
    }

    // May arrive as { type: 'Buffer', data: number[] }
    const maybe = payload as any;
    if (maybe?.type === 'Buffer' && Array.isArray(maybe?.data)) {
        return new Uint8Array(maybe.data);
    }

    // May arrive as { buffer: ArrayBuffer, byteOffset, byteLength }-ish
    if (maybe?.buffer instanceof ArrayBuffer) {
        try {
            return new Uint8Array(maybe.buffer, maybe.byteOffset ?? 0, maybe.byteLength ?? undefined);
        } catch {
            return new Uint8Array();
        }
    }

    return new Uint8Array();
};

const clearRoomState = (roomId: string) => {
    delete activeUsers[roomId];
    delete roomControlState[roomId];
    delete roomActivity[roomId];
    delete pendingAutoSaves[roomId];

    if (roomAwareness[roomId]) {
        roomAwareness[roomId].destroy();
        delete roomAwareness[roomId];
    }

    if (roomYDocs[roomId]) {
        roomYDocs[roomId].destroy();
        delete roomYDocs[roomId];
    }

    if (autoSaveTimers[roomId]) {
        clearTimeout(autoSaveTimers[roomId]);
        delete autoSaveTimers[roomId];
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
        // Teacher may not be connected yet (or room control state may load after join).
        // Keep the ticker alive so statuses are ready to emit as soon as the teacher appears.
        if (!teacherSocketId) {
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

const encodeUpdateToBase64 = (update: Uint8Array): string => Buffer.from(update).toString('base64');

const decodeBase64ToUpdate = (maybeBase64: unknown): Uint8Array => {
    if (typeof maybeBase64 !== 'string' || maybeBase64.length === 0) {
        return new Uint8Array();
    }
    try {
        return new Uint8Array(Buffer.from(maybeBase64, 'base64'));
    } catch {
        return new Uint8Array();
    }
};

const getOrLoadRoomYjs = async (roomId: string): Promise<{ ydoc: Y.Doc; awareness: Awareness; language: string }> => {
    if (roomYDocs[roomId] && roomAwareness[roomId]) {
        const room = await Room.findOne({ roomId }).select('language');
        return { ydoc: roomYDocs[roomId], awareness: roomAwareness[roomId], language: room?.language || 'javascript' };
    }

    const room = await Room.findOne({ roomId }).select('code language yjsState');
    const ydoc = new Y.Doc();
    const text = ydoc.getText(CODE_FIELD);
    const awareness = new Awareness(ydoc);

    if (room?.yjsState) {
        const update = decodeBase64ToUpdate(room.yjsState);
        if (update.length) {
            Y.applyUpdate(ydoc, update, 'db-init');
        }
    } else if (typeof room?.code === 'string' && room.code.length) {
        text.insert(0, room.code);
    }

    roomYDocs[roomId] = ydoc;
    roomAwareness[roomId] = awareness;

    return { ydoc, awareness, language: room?.language || 'javascript' };
};

const encodeRoomSnapshot = (roomId: string) => {
    const ydoc = roomYDocs[roomId];
    const awareness = roomAwareness[roomId];
    if (!ydoc || !awareness) {
        return { documentUpdate: new Uint8Array(), awarenessUpdate: new Uint8Array() };
    }

    const documentUpdate = Y.encodeStateAsUpdate(ydoc);
    const clientIds = Array.from(awareness.getStates().keys());
    const awarenessUpdate = clientIds.length ? encodeAwarenessUpdate(awareness, clientIds) : new Uint8Array();

    return { documentUpdate, awarenessUpdate };
};

const scheduleRoomAutoSave = (roomId: string) => {
    if (autoSaveTimers[roomId]) {
        return;
    }

    autoSaveTimers[roomId] = setTimeout(async () => {
        delete autoSaveTimers[roomId];

        const latest = pendingAutoSaves[roomId];
        if (!latest) {
            return;
        }

        delete pendingAutoSaves[roomId];

        try {
            await Room.findOneAndUpdate(
                { roomId },
                { code: latest.code, language: latest.language, yjsState: latest.yjsState, updatedAt: new Date() }
            );
            console.log(`Auto-saved code for room ${roomId} (60s interval)`);
        } catch (err) {
            console.error('Auto-save failed:', err);
            // Retry the latest payload on the next interval.
            pendingAutoSaves[roomId] = latest;
        }

        if (pendingAutoSaves[roomId]) {
            scheduleRoomAutoSave(roomId);
        }
    }, AUTO_SAVE_INTERVAL_MS);
};

const getRoomForTeacherAction = async (roomId: string, userId: string) => {
    const room = await Room.findOne({ roomId }).select('teacherId participants mode isLocked');
    if (!room) return { room: null, allowed: false };

    const isParticipant = room.participants.some((participant: any) => participant.toString() === userId);
    const isTeacher = room.teacherId?.toString() === userId;
    return { room, allowed: isParticipant && isTeacher };
};

/** Persist shared doc text when practice starts; clear when returning to broadcast (session report strips this prefix). */
const syncPracticeBaselineForRoom = async (io: Server, roomId: string, mode: 'broadcast' | 'practice') => {
    try {
        if (mode === 'broadcast') {
            await Room.findOneAndUpdate({ roomId }, { $set: { practiceCodeBaseline: null } });
            return;
        }
        await getOrLoadRoomYjs(roomId);
        const ydoc = roomYDocs[roomId];
        if (!ydoc) return;
        const baseline = ydoc.getText(CODE_FIELD).toString();
        await Room.findOneAndUpdate({ roomId }, { $set: { practiceCodeBaseline: baseline } });
        io.to(roomId).emit('practice-baseline', { roomId, baseline });
    } catch (err) {
        console.error('[socket] syncPracticeBaselineForRoom failed', roomId, err);
    }
};

const initSocket = (server: HttpServer) => {
    const allowedOrigins = new Set([
        'https://www.synccode.dev',
        'https://synccode.dev',
        'http://www.synccode.dev',
        'http://synccode.dev',
        'http://localhost:8080',
        'http://localhost:5173',
        'http://localhost:3000',
    ]);

    const allowedOriginPattern = /^https?:\/\/([a-z0-9-]+\.)?synccode\.dev$/i;

    const io = new Server(server, {
        cors: {
            origin: (origin, callback) => {
                if (!origin || allowedOrigins.has(origin) || allowedOriginPattern.test(origin)) {
                    callback(null, true);
                    return;
                }

                callback(new Error('Not allowed by CORS'));
            },
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

            const room = await Room.findOne({ roomId }).select('teacherId mode isLocked practiceCodeBaseline');
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
                if (room.mode === 'practice' && typeof room.practiceCodeBaseline === 'string') {
                    socket.emit('practice-baseline', { roomId, baseline: room.practiceCodeBaseline });
                }
            }

            syncRoomActivityForTeacher(io, roomId);
            ensureRoomActivityTicker(io, roomId);

            // Send latest chat history to the newly joined user.
            socket.emit('room-chat-history', { messages: roomChatHistory[roomId] || [] });

            // --- Yjs initial sync (CRDT snapshot + awareness) ---
            try {
                await getOrLoadRoomYjs(roomId);
                const snapshot = encodeRoomSnapshot(roomId);
                socket.emit('yjs-init', snapshot);
            } catch (err) {
                console.error('Failed to init Yjs for room', roomId, err);
            }

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

        socket.on('yjs-update', async ({ roomId, update }: { roomId: string; update: Uint8Array }) => {
            const membership = socketRoomMembership[socket.id];
            if (!membership || membership.roomId !== roomId) {
                return;
            }

            const controlState = await getOrLoadRoomControlState(roomId);
            if (!controlState) {
                return;
            }

            const isTeacher = controlState.teacherId === membership.userId;
            const blockStudentEdit = controlState.mode === 'broadcast';

            if (!isTeacher && blockStudentEdit) {
                // Reject and re-snapshot the current doc to keep clients converged.
                await getOrLoadRoomYjs(roomId);
                socket.emit('yjs-init', encodeRoomSnapshot(roomId));
                return;
            }

            const { ydoc, language } = await getOrLoadRoomYjs(roomId);
            const normalized = normalizeBinary(update);
            if (!normalized.length) return;

            Y.applyUpdate(ydoc, normalized, 'socket-remote');
            socket.to(roomId).emit('yjs-update', normalized);

            const plainCode = ydoc.getText(CODE_FIELD).toString();
            pendingAutoSaves[roomId] = {
                code: plainCode,
                language,
                yjsState: encodeUpdateToBase64(Y.encodeStateAsUpdate(ydoc)),
            };
            scheduleRoomAutoSave(roomId);

            const actorUserId = membership.userId;
            const actorUserName = membership.userName || 'Unknown';
            void RecordingService.addSnapshot(roomId, actorUserId, plainCode, actorUserName);
        });

        socket.on('practice-submission-update', async ({ roomId, code, language }) => {
            if (!roomId || typeof code !== 'string') {
                return;
            }

            const membership = socketRoomMembership[socket.id];
            if (!membership || membership.roomId !== roomId) {
                return;
            }

            const controlState = await getOrLoadRoomControlState(roomId);
            if (!controlState || controlState.mode !== 'practice') {
                return;
            }

            const isTeacher = controlState.teacherId === membership.userId;
            if (isTeacher) {
                return;
            }

            const normalizedLanguage: 'javascript' | 'python' = language === 'python' ? 'python' : 'javascript';

            void RecordingService.upsertPracticeSubmission({
                roomId,
                studentId: membership.userId,
                studentName: membership.userName || 'Unknown',
                code,
                language: normalizedLanguage,
            });
        });

        socket.on('yjs-awareness', async ({ roomId, update, clientId }: { roomId: string; update: Uint8Array; clientId?: number }) => {
            const membership = socketRoomMembership[socket.id];
            if (!membership || membership.roomId !== roomId) {
                return;
            }

            await getOrLoadRoomYjs(roomId);
            const awareness = roomAwareness[roomId];
            if (!awareness) return;

            const normalized = normalizeBinary(update);
            if (!normalized.length) return;

            applyAwarenessUpdate(awareness, normalized, clientId ?? 'socket-remote');
            socket.to(roomId).emit('yjs-awareness', normalized);
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
            // Keep lock state aligned with selected classroom mode.
            room.isLocked = mode === 'broadcast';
            await room.save();

            roomControlState[roomId] = {
                teacherId: room.teacherId?.toString(),
                mode: room.mode,
                isLocked: room.isLocked,
            };

            await syncPracticeBaselineForRoom(io, roomId, room.mode);

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

            await syncPracticeBaselineForRoom(io, roomId, room.mode);

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

            const { ydoc, language } = await getOrLoadRoomYjs(roomId);
            const text = ydoc.getText(CODE_FIELD);
            ydoc.transact(() => {
                text.delete(0, text.length);
                text.insert(0, code);
            }, 'teacher-broadcast');

            const update = Y.encodeStateAsUpdate(ydoc);
            io.to(roomId).emit('yjs-update', update);

            pendingAutoSaves[roomId] = {
                code,
                language,
                yjsState: encodeUpdateToBase64(update),
            };
            scheduleRoomAutoSave(roomId);
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
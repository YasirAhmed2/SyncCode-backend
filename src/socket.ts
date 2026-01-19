import { Server } from 'socket.io';
import Room from './models/room.mongo.js';
import { Server as HttpServer } from 'http';

// Store timeouts for debounced saving
const timeouts: Record<string, NodeJS.Timeout> = {};

const initSocket = (server: HttpServer) => {
    const io = new Server(server, {
        cors: {
            // Allow both frontend ports and localhost
            origin: ["https://www.synccode.dev", "https://synccode.dev", "http://localhost:8080"],
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });

    io.on('connection', (socket) => {
        console.log('Socket connected:', socket.id);

        socket.on('join-room', async ({ roomId, userId, userName }) => {
            socket.join(roomId);
            console.log(`Socket ${socket.id} (User: ${userName}) joined room ${roomId}`);

            // Notify others in the room
            socket.to(roomId).emit('user-joined', { userId, userName });
        });

        socket.on('leave-room', ({ roomId }) => {
            socket.leave(roomId);
            console.log(`Socket ${socket.id} left room ${roomId}`);
        });

        socket.on('code-change', async ({ roomId, code, language }) => {
            // Broadcast to others immediately
            socket.to(roomId).emit('code-update', code);

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
        });

        socket.on('language-change', async ({ roomId, language }) => {
            socket.to(roomId).emit('language-update', language);

            try {
                await Room.findOneAndUpdate(
                    { roomId },
                    { language, updatedAt: new Date() }
                );
            } catch (err) {
                console.error('Language save failed:', err);
            }
        });

        socket.on('cursor-change', ({ roomId, cursorData }) => {
            // cursorData: { userId, userName, lineNumber, column, color }
            socket.to(roomId).emit('cursor-update', cursorData);
        });

        socket.on('chat-message', ({ roomId, message }) => {
            socket.to(roomId).emit('chat-message', message);
        });

        socket.on('disconnect', () => {
            console.log('Socket disconnected:', socket.id);
        });
    });

    console.log('Socket.IO attached');
    return io;
};

export default initSocket;
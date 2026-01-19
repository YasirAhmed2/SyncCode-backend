// // import http from 'http';
// // import { Server } from 'socket.io';
// // import app from './index.js';
// // import Room from './models/room.mongo.js';
// // const server = http.createServer(app);
// // const io = new Server(server, {
// //   cors: {
// //     origin: 'http://localhost:8080',
// //     credentials: true,
// //   },
// // });
// // io.on('connection', (socket) => {
// //   console.log('Socket connected:', socket.id);
// //   socket.on('join-room', ({ roomId }) => {
// //     socket.join(roomId);
// //     console.log(`Socket joined room ${roomId}`);
// //   });
// //   socket.on('code-change', async ({ roomId, code }) => {
// //     // send update to all except sender
// //     socket.to(roomId).emit('code-update', code);
// //     // persist code in DB
// //     await Room.findOneAndUpdate(
// //       { roomId },
// //       { code, updatedAt: new Date() }
// //     );
// //   });
// //   socket.on('disconnect', () => {
// //     console.log('Socket disconnected:', socket.id);
// //   });
// // });
// // export { server, io };
import http from 'http';
import { Server } from 'socket.io';
import app from './index.js';
import Room from './models/room.mongo.js';
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: 'http://localhost:5173', // Vite default port
        methods: ['GET', 'POST'],
        credentials: true,
    },
});
// Store timeouts for debounced saving
const timeouts = {};
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
                await Room.findOneAndUpdate({ roomId }, { code, language, updatedAt: new Date() });
                console.log(`Auto-saved code for room ${roomId}`);
                delete timeouts[roomId];
            }
            catch (err) {
                console.error('Auto-save failed:', err);
            }
        }, 2000);
    });
    socket.on('language-change', async ({ roomId, language }) => {
        socket.to(roomId).emit('language-update', language);
        try {
            await Room.findOneAndUpdate({ roomId }, { language, updatedAt: new Date() });
        }
        catch (err) {
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
// START THE SERVER HERE (not in index.js)
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`✅ Socket.IO attached`);
});
export { server, io };

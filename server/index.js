import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const rooms = {};

io.on('connection', (socket) => {
  console.log(`[Server] Player connected: ${socket.id}`);

  socket.on('createRoom', ({ roomCode, playerName }) => {
    rooms[roomCode] = { players: [{ id: socket.id, name: playerName }] };
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode });
    console.log(`[Server] Room created: ${roomCode} by ${playerName}`);
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) { socket.emit('error', { message: 'Room not found. Check the code.' }); return; }
    if (room.players.length >= 2) { socket.emit('error', { message: 'Room is full.' }); return; }

    room.players.push({ id: socket.id, name: playerName });
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode });

    const host = room.players[0];
    io.to(host.id).emit('opponentJoined', { playerName });
    socket.emit('opponentJoined', { playerName: host.name });
    console.log(`[Server] ${playerName} joined room: ${roomCode}`);
  });

  socket.on('diceRoll', ({ roomCode, playerName, roll }) => {
    socket.to(roomCode).emit('opponentRoll', { roll, playerName });
    console.log(`[Server] ${playerName} rolled ${roll} in room ${roomCode}`);
  });

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        room.players.splice(idx, 1);
        io.to(code).emit('opponentDisconnected');
        if (room.players.length === 0) delete rooms[code];
        console.log(`[Server] Player left room: ${code}`);
        break;
      }
    }
  });
});

server.listen(3001, () => {
  console.log('[Server] Socket.io running on port 3001');
});
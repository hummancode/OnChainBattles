import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ─── Escrow Contract Setup ─────────────────────────────────────
const ESCROW_ADDRESS = "0xa145f82DC5b285B970BE71F48Cf5173E722cF515";
const ESCROW_ABI = [
  "function claimWinnings(bytes32 matchId, address winner) external",
  "function refundTie(bytes32 matchId) external",
  "function matches(bytes32) view returns (address playerA, address playerB, uint256 stake, uint8 status)",
];

const FUJI_RPC = "https://api.avax-test.network/ext/bc/C/rpc";
const provider = new ethers.JsonRpcProvider(FUJI_RPC);
const ownerWallet = new ethers.Wallet(process.env.FUJI_PRIVATE_KEY, provider);
const escrowContract = new ethers.Contract(ESCROW_ADDRESS, ESCROW_ABI, ownerWallet);

console.log(`[Server] Owner wallet: ${ownerWallet.address}`);

// ─── Helper: matchId from room code (must match frontend) ──────
function matchIdFromCode(roomCode) {
  const hex = Buffer.from(roomCode, 'utf8').toString('hex');
  const padded = hex.padStart(64, '0');
  return '0x' + padded;
}

// ─── Payout Logic ─────────────────────────────────────────────
async function payoutWinner(roomCode, winnerAddress) {
  const matchId = matchIdFromCode(roomCode);
  console.log(`[Escrow] Paying winner ${winnerAddress} for room ${roomCode}`);
  try {
    const tx = await escrowContract.claimWinnings(matchId, winnerAddress);
    await tx.wait();
    console.log(`[Escrow] Payout done! tx: ${tx.hash}`);
    return { success: true, txHash: tx.hash };
  } catch (err) {
    console.error(`[Escrow] Payout failed:`, err.message);
    return { success: false, error: err.message };
  }
}

async function refundTie(roomCode) {
  const matchId = matchIdFromCode(roomCode);
  console.log(`[Escrow] Refunding tie for room ${roomCode}`);
  try {
    const tx = await escrowContract.refundTie(matchId);
    await tx.wait();
    console.log(`[Escrow] Tie refund done! tx: ${tx.hash}`);
    return { success: true, txHash: tx.hash };
  } catch (err) {
    console.error(`[Escrow] Tie refund failed:`, err.message);
    return { success: false, error: err.message };
  }
}

// ─── Room State ───────────────────────────────────────────────
const rooms = {};

io.on('connection', (socket) => {

  // Game action relay — forward to opponent only
socket.on('game_action', ({ roomCode, action }) => {
    socket.to(roomCode).emit('opponent_action', action);
    console.log(`[Server] game_action relayed in ${roomCode}: ${action.type}`);
});
  console.log(`[Server] Player connected: ${socket.id}`);

  socket.on('createRoom', ({ roomCode, playerName }) => {
    rooms[roomCode] = {
      players: [{ id: socket.id, name: playerName, roll: null, wallet: null }],
      cryptoReady: { count: 0 }
    };
    socket.join(roomCode);
    socket.emit('roomCreated', { roomCode, playerIndex: 0 });

    console.log(`[Server] Room created: ${roomCode} by ${playerName}`);
  });

  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const room = rooms[roomCode];
    if (!room) { socket.emit('error', { message: 'Room not found. Check the code.' }); return; }
    if (room.players.length >= 2) { socket.emit('error', { message: 'Room is full.' }); return; }

    room.players.push({ id: socket.id, name: playerName, roll: null, wallet: null });
    socket.join(roomCode);
    socket.emit('roomJoined', { roomCode, playerIndex: 1 });
    const host = room.players[0];
    io.to(host.id).emit('opponentJoined', { playerName, playerIndex: 0 });
    socket.emit('opponentJoined', { playerName: host.name, playerIndex: 1 });

    // Broadcast shared shuffle seed to both players
    const seed = Math.floor(Math.random() * 999999);
    room.gameSeed = seed;
    io.to(roomCode).emit('game_seed', { seed });
    console.log(`[Server] ${playerName} joined room: ${roomCode}, seed: ${seed}`)
  });

  // Player registers their wallet address (for crypto payout)
  socket.on('registerWallet', ({ roomCode, walletAddress }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      player.wallet = walletAddress;
      console.log(`[Server] Wallet registered for ${player.name}: ${walletAddress}`);
    }
  });

  // Player signals their escrow deposit is confirmed on-chain
  socket.on('cryptoReady', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    room.cryptoReady.count = (room.cryptoReady.count || 0) + 1;
    console.log(`[Server] cryptoReady: ${room.cryptoReady.count}/2 in room ${roomCode}`);

    if (room.cryptoReady.count >= 2) {
      // Both players locked funds — enable rolling
      io.to(roomCode).emit('bothCryptoReady');
      console.log(`[Server] Both players crypto-ready in room ${roomCode}, enabling dice roll`);
    }
  });

  socket.on('diceRoll', ({ roomCode, playerName, roll }) => {
    const room = rooms[roomCode];
    if (!room) return;

    const player = room.players.find(p => p.id === socket.id);
    if (player) player.roll = roll;

    socket.to(roomCode).emit('opponentRoll', { roll, playerName });
    console.log(`[Server] ${playerName} rolled ${roll} in room ${roomCode}`);

    // Check if both players have rolled
    const [p1, p2] = room.players;
    if (p1 && p2 && p1.roll !== null && p2.roll !== null) {
      const isCrypto = p1.wallet && p2.wallet;
      console.log(`[Server] Both rolled in room ${roomCode}. p1:${p1.roll} p2:${p2.roll} crypto:${isCrypto}`);

      if (p1.roll === p2.roll) {
        // Tie — reset rolls for re-roll
        p1.roll = null;
        p2.roll = null;
        if (isCrypto) {
          // For crypto tie, refund and let them know
          // (In Phase 1, ties just re-roll in free mode; for crypto we could refund or re-roll)
          // For now: re-roll (don't touch escrow on tie, just reset)
          io.to(roomCode).emit('tieReroll');
        }
        // Free mode tie handled client-side already
      } else {
        const winner = p1.roll > p2.roll ? p1 : p2;
        const loser = p1.roll > p2.roll ? p2 : p1;

        if (isCrypto) {
          // Trigger on-chain payout
          payoutWinner(roomCode, winner.wallet).then(result => {
            io.to(roomCode).emit('cryptoMatchResult', {
              winnerName: winner.name,
              loserName: loser.name,
              winnerRoll: winner.roll,
              loserRoll: loser.roll,
              txHash: result.txHash,
              success: result.success,
              error: result.error
            });
          });
        }
        // Free mode result handled client-side
      }

      // Reset for next match
      p1.roll = null;
      p2.roll = null;
      room.cryptoReady.count = 0;
    }
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
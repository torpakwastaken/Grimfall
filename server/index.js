/**
 * Grimfall Relay Server - Production Ready
 * 
 * Simple WebSocket relay for 2-player co-op.
 * No database, no auth, just message forwarding.
 */

const { WebSocketServer, WebSocket } = require('ws');
const http = require('http');

const PORT = process.env.PORT || 8080;

// Active rooms: Map<roomCode, Room>
const rooms = new Map();

// Socket to room: Map<WebSocket, roomCode>
const socketRooms = new Map();

// Create HTTP server for health checks
const server = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      rooms: rooms.size,
      uptime: Math.floor(process.uptime())
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

console.log(`[Server] Starting on port ${PORT}...`);

wss.on('connection', (socket) => {
  console.log('[Server] New connection');
  
  socket.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      handleMessage(socket, msg);
    } catch (e) {
      send(socket, { type: 'error', message: 'Invalid JSON' });
    }
  });
  
  socket.on('close', () => handleDisconnect(socket));
  socket.on('error', () => handleDisconnect(socket));
});

function handleMessage(socket, msg) {
  switch (msg.type) {
    case 'create_room':
      createRoom(socket);
      break;
    case 'join_room':
      joinRoom(socket, msg.roomCode);
      break;
    case 'ping':
      send(socket, { type: 'pong', time: Date.now() });
      break;
    default:
      // Relay all other messages to partner
      relayToPartner(socket, msg);
  }
}

function createRoom(socket) {
  // Clean up existing room
  const existing = socketRooms.get(socket);
  if (existing) leaveRoom(socket, existing);
  
  // Generate unique 6-char code
  let code;
  do {
    code = generateCode();
  } while (rooms.has(code));
  
  rooms.set(code, {
    code,
    host: socket,
    guest: null,
    createdAt: Date.now()
  });
  
  socketRooms.set(socket, code);
  console.log(`[Server] Room created: ${code}`);
  send(socket, { type: 'room_created', roomCode: code });
}

function joinRoom(socket, roomCode) {
  const code = (roomCode || '').toUpperCase();
  const room = rooms.get(code);
  
  if (!room) {
    send(socket, { type: 'error', message: 'Room not found' });
    return;
  }
  
  if (room.guest) {
    send(socket, { type: 'error', message: 'Room is full' });
    return;
  }
  
  // Clean up existing
  const existing = socketRooms.get(socket);
  if (existing) leaveRoom(socket, existing);
  
  room.guest = socket;
  socketRooms.set(socket, code);
  
  console.log(`[Server] Player joined: ${code}`);
  
  // Tell guest they joined
  send(socket, {
    type: 'room_joined',
    roomInfo: {
      roomCode: code,
      hostId: 'host',
      guestId: 'guest',
      hostReady: false,
      guestReady: false
    }
  });
  
  // Tell host someone joined
  send(room.host, { type: 'player_joined', playerId: 'guest' });
}

function relayToPartner(socket, msg) {
  const code = socketRooms.get(socket);
  if (!code) return;
  
  const room = rooms.get(code);
  if (!room) return;
  
  const partner = socket === room.host ? room.guest : room.host;
  if (partner && partner.readyState === WebSocket.OPEN) {
    send(partner, msg);
  }
}

function handleDisconnect(socket) {
  const code = socketRooms.get(socket);
  if (code) leaveRoom(socket, code);
  console.log('[Server] Connection closed');
}

function leaveRoom(socket, code) {
  const room = rooms.get(code);
  if (!room) return;
  
  socketRooms.delete(socket);
  
  if (socket === room.host) {
    // Host left - close room
    if (room.guest && room.guest.readyState === WebSocket.OPEN) {
      send(room.guest, { type: 'player_left', playerId: 'host' });
      socketRooms.delete(room.guest);
    }
    rooms.delete(code);
    console.log(`[Server] Room closed: ${code}`);
  } else if (socket === room.guest) {
    // Guest left
    room.guest = null;
    send(room.host, { type: 'player_left', playerId: 'guest' });
    console.log(`[Server] Guest left: ${code}`);
  }
}

function send(socket, msg) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(msg));
  }
}

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// Clean stale rooms every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    // Remove empty rooms older than 30 minutes
    if (!room.guest && now - room.createdAt > 30 * 60 * 1000) {
      if (room.host.readyState === WebSocket.OPEN) {
        send(room.host, { type: 'error', message: 'Room expired' });
        room.host.close();
      }
      rooms.delete(code);
      console.log(`[Server] Room expired: ${code}`);
    }
  }
}, 10 * 60 * 1000);

// Start
server.listen(PORT, () => {
  console.log(`[Server] Running on port ${PORT}`);
});

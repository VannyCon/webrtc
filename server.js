const express = require('express');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Create express app
const app = express();

// Add CORS headers for Vercel deployment
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/create-room', (req, res) => {
  const roomId = uuidv4();
  res.redirect(`/room/${roomId}`);
});

app.get('/room/:roomId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'room.html'));
});

// API endpoint for health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Server is running' });
});

// Store active room members - this won't persist on Vercel, but helps during development
const activeRooms = {};

// API endpoint for presence (helps with peer discovery)
app.get('/api/presence', (req, res) => {
  const { room, userId, peerId } = req.query;
  
  if (!room || !userId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  
  // Store the user in the room
  if (!activeRooms[room]) {
    activeRooms[room] = {};
  }
  
  // Check if user is already in the room with a different userId (possible duplicate)
  const existingIds = Object.keys(activeRooms[room]);
  for (const id of existingIds) {
    // Compare the peerId (which contains roomId-userId) instead of just userId
    // to detect duplicates from the same device
    if (id !== userId && activeRooms[room][id]?.peerId?.includes(userId)) {
      console.log(`Detected duplicate user: ${userId} and ${id}`);
      // Remove the older entry
      delete activeRooms[room][id];
    }
  }
  
  // Update or add the user with timestamp
  activeRooms[room][userId] = {
    peerId,
    timestamp: Date.now()
  };
  
  // Clean up stale users (older than 30 seconds)
  Object.keys(activeRooms[room]).forEach(id => {
    if (Date.now() - activeRooms[room][id].timestamp > 30000) {
      delete activeRooms[room][id];
    }
  });
  
  // Return active users in the room
  const activeUsers = Object.keys(activeRooms[room]).filter(id => id !== userId);
  
  res.json({
    room,
    activeUsers,
    peerIds: activeUsers.map(id => activeRooms[room][id].peerId).filter(Boolean)
  });
});

// API endpoint to get all users in a room
app.get('/api/room/:roomId/users', (req, res) => {
  const { roomId } = req.params;
  
  if (!activeRooms[roomId]) {
    return res.json({ users: [] });
  }
  
  // Clean up stale users first
  Object.keys(activeRooms[roomId]).forEach(id => {
    if (Date.now() - activeRooms[roomId][id].timestamp > 30000) {
      delete activeRooms[roomId][id];
    }
  });
  
  const users = Object.keys(activeRooms[roomId]).map(id => ({
    id,
    peerId: activeRooms[roomId][id].peerId,
    lastSeen: activeRooms[roomId][id].timestamp
  }));
  
  res.json({ users });
});

// For local development
if (process.env.NODE_ENV !== 'production') {
  const http = require('http');
  const { Server } = require('socket.io');
  
  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  
  // WebRTC signaling
  io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);
  
    socket.on('join-room', (roomId, userId) => {
      socket.join(roomId);
      // Notify other users in the room that a new user has joined
      socket.to(roomId).emit('user-connected', userId);
  
      // Handle disconnect
      socket.on('disconnect', () => {
        socket.to(roomId).emit('user-disconnected', userId);
      });
      
      // Relay ICE candidates
      socket.on('ice-candidate', (iceCandidate, targetUserId) => {
        socket.to(roomId).emit('ice-candidate', iceCandidate, userId);
      });
      
      // Relay session descriptions
      socket.on('offer', (offer, targetUserId) => {
        socket.to(roomId).emit('offer', offer, userId);
      });
      
      socket.on('answer', (answer, targetUserId) => {
        socket.to(roomId).emit('answer', answer, userId);
      });
    });
  });
  
  // Start server
  const PORT = process.env.PORT || 3000;
  server.listen(PORT, () => {
    console.log(`Local development server running on port ${PORT}`);
  });
} else {
  console.log('Running in production mode');
}

// Export for Vercel serverless deployment
module.exports = app; 
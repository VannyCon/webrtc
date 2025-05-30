const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
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
  console.log(`Server running on port ${PORT}`);
});

// Export for Vercel serverless deployment
module.exports = app; 
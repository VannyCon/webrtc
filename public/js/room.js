// Get the room ID from the URL
const roomId = window.location.pathname.split('/').pop();
const videoGrid = document.getElementById('videoGrid');
const localVideo = document.getElementById('localVideo');
const roomIdDisplay = document.getElementById('roomIdDisplay');
const toggleVideoBtn = document.getElementById('toggleVideo');
const toggleAudioBtn = document.getElementById('toggleAudio');
const shareScreenBtn = document.getElementById('shareScreen');
const leaveRoomBtn = document.getElementById('leaveRoom');
const copyRoomIdBtn = document.getElementById('copyRoomId');

// Display room ID
roomIdDisplay.textContent = roomId;

// Copy room ID to clipboard
copyRoomIdBtn.addEventListener('click', () => {
  navigator.clipboard.writeText(window.location.href).then(() => {
    alert('Room URL copied to clipboard! Share this with others to invite them.');
  }).catch(err => {
    console.error('Could not copy room URL: ', err);
  });
});

// Generate a random user ID
const userId = Math.random().toString(36).substring(2, 15);

// Store peer connections and streams
const peers = {};
let localStream = null;
let screenStream = null;
let isScreenSharing = false;
let myPeer = null;

// ICE servers configuration (STUN and TURN servers)
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // You should add TURN servers for production use
    // { urls: 'turn:your-turn-server.com', username: 'username', credential: 'credential' },
  ]
};

// Check if we're in production (Vercel) or development
const isProduction = window.location.hostname !== 'localhost' && 
                    !window.location.hostname.includes('127.0.0.1');

// Access the user's camera and microphone
async function setupLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    
    // Display local video
    localVideo.srcObject = localStream;
    
    // Setup connections based on environment
    if (isProduction) {
      setupPeerJSConnection();
    } else {
      setupSocketIOConnection();
    }
    
    // Setup controls
    setupControls();
    
  } catch (error) {
    console.error('Error accessing media devices:', error);
    alert('Could not access camera or microphone. Please check permissions.');
  }
}

// Setup PeerJS connection for production (Vercel)
function setupPeerJSConnection() {
  // Load PeerJS script if not already loaded
  if (!window.Peer) {
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/peerjs@1.4.7/dist/peerjs.min.js';
    script.onload = () => initializePeerJS();
    document.head.appendChild(script);
  } else {
    initializePeerJS();
  }
}

// Initialize PeerJS
function initializePeerJS() {
  // Create a new Peer with our userId and use the official PeerJS cloud server
  myPeer = new Peer(userId, {
    // Using the official PeerJS cloud server
    // No need to specify host, port, or path - it uses the default cloud server
    debug: 3,
    config: iceServers
  });
  
  myPeer.on('open', (id) => {
    console.log('My peer ID is: ' + id);
    
    // Join the room
    joinRoom();
  });
  
  // Handle incoming calls
  myPeer.on('call', (call) => {
    console.log('Receiving call from:', call.peer);
    
    // Answer the call with our stream
    call.answer(localStream);
    
    // Create a video element for the caller
    const video = createVideoElement(call.peer);
    
    // When we receive their stream
    call.on('stream', (remoteStream) => {
      video.srcObject = remoteStream;
    });
    
    // When they leave
    call.on('close', () => {
      const videoElement = document.getElementById(`video-${call.peer}`);
      if (videoElement) {
        videoElement.parentElement.remove();
      }
    });
    
    // Store the call
    peers[call.peer] = call;
  });
  
  myPeer.on('error', (err) => {
    console.error('PeerJS error:', err);
    alert('Connection error. Please try refreshing the page.');
  });
}

// Join room with PeerJS
function joinRoom() {
  // Since we can't rely on an external signaling server, we'll use a simpler approach
  // The first person to join creates the room, others connect when they join
  console.log(`Joined room: ${roomId} with peer ID: ${userId}`);
  
  // We'll use localStorage to store room members (only works for same browser)
  // For production, you would need a simple API endpoint to store room-peer mappings
  
  try {
    // Get existing room members
    let roomMembers = JSON.parse(localStorage.getItem(`room-${roomId}`)) || [];
    
    // Connect to each existing member
    roomMembers.forEach(existingUserId => {
      if (existingUserId !== userId) {
        console.log(`Connecting to existing user: ${existingUserId}`);
        connectToUser(existingUserId);
      }
    });
    
    // Add ourselves to the room
    if (!roomMembers.includes(userId)) {
      roomMembers.push(userId);
      localStorage.setItem(`room-${roomId}`, JSON.stringify(roomMembers));
    }
    
    // Clean up on window unload
    window.addEventListener('beforeunload', () => {
      const updatedMembers = JSON.parse(localStorage.getItem(`room-${roomId}`)) || [];
      const filteredMembers = updatedMembers.filter(id => id !== userId);
      localStorage.setItem(`room-${roomId}`, JSON.stringify(filteredMembers));
    });
    
  } catch (error) {
    console.error("Error with room management:", error);
    // Fallback - just announce our presence
  }
}

// Connect to a specific user with PeerJS
function connectToUser(userId) {
  console.log('Calling:', userId);
  const call = myPeer.call(userId, localStream);
  
  const video = createVideoElement(userId);
  
  call.on('stream', (remoteStream) => {
    video.srcObject = remoteStream;
  });
  
  call.on('close', () => {
    const videoElement = document.getElementById(`video-${userId}`);
    if (videoElement) {
      videoElement.parentElement.remove();
    }
  });
  
  peers[userId] = call;
}

// Setup Socket.IO connection for local development
function setupSocketIOConnection() {
  // Connect to socket.io server
  const socket = io('/');
  
  // Join the room after getting media
  socket.emit('join-room', roomId, userId);
  
  // Listen for other users connecting
  socket.on('user-connected', (newUserId) => {
    console.log('User connected via Socket.IO:', newUserId);
    handleUserConnected(newUserId, socket);
  });
  
  // Listen for users disconnecting
  socket.on('user-disconnected', handleUserDisconnected);
  
  // Listen for ICE candidates
  socket.on('ice-candidate', (iceCandidate, fromUserId) => {
    handleIceCandidate(iceCandidate, fromUserId, socket);
  });
  
  // Listen for offers and answers
  socket.on('offer', (offer, fromUserId) => {
    handleOffer(offer, fromUserId, socket);
  });
  
  socket.on('answer', (answer, fromUserId) => {
    handleAnswer(answer, fromUserId);
  });
}

// Handle a new user connecting via Socket.IO
function handleUserConnected(newUserId, socket) {
  // Create a new peer connection
  const peerConnection = new RTCPeerConnection(iceServers);
  peers[newUserId] = { peerConnection };
  
  // Add local tracks to the peer connection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });
  
  // Set up ICE candidate handling
  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('ice-candidate', event.candidate, newUserId);
    }
  };
  
  // Handle remote tracks
  peerConnection.ontrack = (event) => {
    const remoteVideo = createVideoElement(newUserId);
    remoteVideo.srcObject = event.streams[0];
  };
  
  // Create and send an offer
  peerConnection.createOffer()
    .then(offer => peerConnection.setLocalDescription(offer))
    .then(() => {
      socket.emit('offer', peerConnection.localDescription, newUserId);
    })
    .catch(error => console.error('Error creating offer:', error));
}

// Handle a user disconnecting
function handleUserDisconnected(userId) {
  console.log('User disconnected:', userId);
  
  if (isProduction) {
    // In production with PeerJS
    if (peers[userId]) {
      peers[userId].close();
      delete peers[userId];
    }
  } else {
    // In development with Socket.IO
    if (peers[userId] && peers[userId].peerConnection) {
      peers[userId].peerConnection.close();
      delete peers[userId];
    }
  }
  
  // Remove the video element
  const videoElement = document.getElementById(`video-${userId}`);
  if (videoElement) {
    videoElement.parentElement.remove();
  }
}

// Handle ICE candidates
function handleIceCandidate(iceCandidate, fromUserId, socket) {
  console.log('Received ICE candidate from:', fromUserId);
  
  const peerConnection = peers[fromUserId]?.peerConnection;
  if (peerConnection) {
    peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate))
      .catch(error => console.error('Error adding ICE candidate:', error));
  }
}

// Handle offers
function handleOffer(offer, fromUserId, socket) {
  console.log('Received offer from:', fromUserId);
  
  // Create a new peer connection if it doesn't exist
  if (!peers[fromUserId]) {
    const peerConnection = new RTCPeerConnection(iceServers);
    peers[fromUserId] = { peerConnection };
    
    // Add local tracks to the peer connection
    localStream.getTracks().forEach(track => {
      peerConnection.addTrack(track, localStream);
    });
    
    // Set up ICE candidate handling
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit('ice-candidate', event.candidate, fromUserId);
      }
    };
    
    // Handle remote tracks
    peerConnection.ontrack = (event) => {
      const remoteVideo = createVideoElement(fromUserId);
      remoteVideo.srcObject = event.streams[0];
    };
    
    // Set remote description and create answer
    peerConnection.setRemoteDescription(new RTCSessionDescription(offer))
      .then(() => peerConnection.createAnswer())
      .then(answer => peerConnection.setLocalDescription(answer))
      .then(() => {
        socket.emit('answer', peerConnection.localDescription, fromUserId);
      })
      .catch(error => console.error('Error creating answer:', error));
  }
}

// Handle answers
function handleAnswer(answer, fromUserId) {
  console.log('Received answer from:', fromUserId);
  
  const peerConnection = peers[fromUserId]?.peerConnection;
  if (peerConnection) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(answer))
      .catch(error => console.error('Error setting remote description:', error));
  }
}

// Create a video element for remote users
function createVideoElement(userId) {
  // Check if a video element already exists for this user
  const existingVideo = document.getElementById(`video-${userId}`);
  if (existingVideo) {
    return existingVideo;
  }
  
  // Create new video container
  const videoContainer = document.createElement('div');
  videoContainer.className = 'video-container';
  
  // Create video element
  const videoElement = document.createElement('video');
  videoElement.id = `video-${userId}`;
  videoElement.autoplay = true;
  videoElement.playsInline = true;
  
  // Create user name label
  const userName = document.createElement('div');
  userName.className = 'user-name';
  userName.textContent = `User ${userId.substring(0, 5)}`;
  
  // Add elements to container
  videoContainer.appendChild(videoElement);
  videoContainer.appendChild(userName);
  
  // Add to grid
  videoGrid.appendChild(videoContainer);
  
  return videoElement;
}

// Setup control buttons
function setupControls() {
  // Toggle video
  toggleVideoBtn.addEventListener('click', () => {
    const videoTrack = localStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled;
      toggleVideoBtn.querySelector('.on').classList.toggle('hidden');
      toggleVideoBtn.querySelector('.off').classList.toggle('hidden');
    }
  });
  
  // Toggle audio
  toggleAudioBtn.addEventListener('click', () => {
    const audioTrack = localStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled;
      toggleAudioBtn.querySelector('.on').classList.toggle('hidden');
      toggleAudioBtn.querySelector('.off').classList.toggle('hidden');
    }
  });
  
  // Share screen
  shareScreenBtn.addEventListener('click', async () => {
    if (!isScreenSharing) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true
        });
        
        // Replace video track with screen track
        const videoTrack = screenStream.getVideoTracks()[0];
        
        if (isProduction) {
          // Replace tracks in PeerJS calls
          for (const userId in peers) {
            peers[userId].peerConnection.getSenders().forEach(sender => {
              if (sender.track.kind === 'video') {
                sender.replaceTrack(videoTrack);
              }
            });
          }
        } else {
          // Replace track in all peer connections
          for (const userId in peers) {
            const senders = peers[userId].peerConnection.getSenders();
            const sender = senders.find(s => s.track.kind === 'video');
            if (sender) {
              sender.replaceTrack(videoTrack);
            }
          }
        }
        
        // Replace local video
        const localVideoTrack = localStream.getVideoTracks()[0];
        localStream.removeTrack(localVideoTrack);
        localStream.addTrack(videoTrack);
        localVideo.srcObject = localStream;
        
        // Handle screen sharing ended
        videoTrack.onended = () => {
          stopScreenSharing();
        };
        
        isScreenSharing = true;
        shareScreenBtn.textContent = 'Stop Sharing';
        
      } catch (error) {
        console.error('Error sharing screen:', error);
      }
    } else {
      stopScreenSharing();
    }
  });
  
  // Leave room
  leaveRoomBtn.addEventListener('click', () => {
    // Stop all tracks
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
    }
    
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
    }
    
    // Close all connections
    if (isProduction && myPeer) {
      myPeer.destroy();
    } else {
      // Close all peer connections
      for (const userId in peers) {
        if (peers[userId].peerConnection) {
          peers[userId].peerConnection.close();
        }
      }
    }
    
    // Redirect to home page
    window.location.href = '/';
  });
}

// Stop screen sharing
function stopScreenSharing() {
  if (isScreenSharing && screenStream) {
    // Stop screen tracks
    screenStream.getTracks().forEach(track => track.stop());
    
    // Get new video track from camera
    navigator.mediaDevices.getUserMedia({ video: true })
      .then(stream => {
        const videoTrack = stream.getVideoTracks()[0];
        
        if (isProduction) {
          // Replace tracks in PeerJS calls
          for (const userId in peers) {
            peers[userId].peerConnection.getSenders().forEach(sender => {
              if (sender.track.kind === 'video') {
                sender.replaceTrack(videoTrack);
              }
            });
          }
        } else {
          // Replace track in all peer connections
          for (const userId in peers) {
            const senders = peers[userId].peerConnection.getSenders();
            const sender = senders.find(s => s.track.kind === 'video');
            if (sender) {
              sender.replaceTrack(videoTrack);
            }
          }
        }
        
        // Replace local video
        const screenTrack = localStream.getVideoTracks()[0];
        localStream.removeTrack(screenTrack);
        localStream.addTrack(videoTrack);
        localVideo.srcObject = localStream;
      })
      .catch(error => console.error('Error accessing camera after screen sharing:', error));
    
    isScreenSharing = false;
    shareScreenBtn.textContent = 'Share Screen';
  }
}

// Start the application
setupLocalStream(); 
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
  navigator.clipboard.writeText(roomId).then(() => {
    alert('Room ID copied to clipboard');
  }).catch(err => {
    console.error('Could not copy room ID: ', err);
  });
});

// Generate a random user ID
const userId = Math.random().toString(36).substring(2, 15);

// Connect to socket.io server
const socket = io('/');

// Store peer connections and streams
const peers = {};
let localStream = null;
let screenStream = null;
let isScreenSharing = false;

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

// Access the user's camera and microphone
async function setupLocalStream() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      video: true,
      audio: true
    });
    
    // Display local video
    localVideo.srcObject = localStream;
    
    // Join the room after getting media
    socket.emit('join-room', roomId, userId);
    
    // Listen for other users connecting
    socket.on('user-connected', handleUserConnected);
    
    // Listen for users disconnecting
    socket.on('user-disconnected', handleUserDisconnected);
    
    // Listen for ICE candidates
    socket.on('ice-candidate', handleIceCandidate);
    
    // Listen for offers and answers
    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    
    // Setup controls
    setupControls();
    
  } catch (error) {
    console.error('Error accessing media devices:', error);
    alert('Could not access camera or microphone. Please check permissions.');
  }
}

// Handle a new user connecting
function handleUserConnected(newUserId) {
  console.log('User connected:', newUserId);
  
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
  
  // Close the peer connection
  if (peers[userId]) {
    peers[userId].peerConnection.close();
    delete peers[userId];
  }
  
  // Remove the video element
  const videoElement = document.getElementById(`video-${userId}`);
  if (videoElement) {
    videoElement.parentElement.remove();
  }
}

// Handle ICE candidates
function handleIceCandidate(iceCandidate, fromUserId) {
  console.log('Received ICE candidate from:', fromUserId);
  
  const peerConnection = peers[fromUserId]?.peerConnection;
  if (peerConnection) {
    peerConnection.addIceCandidate(new RTCIceCandidate(iceCandidate))
      .catch(error => console.error('Error adding ICE candidate:', error));
  }
}

// Handle offers
function handleOffer(offer, fromUserId) {
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
        
        // Replace track in all peer connections
        for (const userId in peers) {
          const senders = peers[userId].peerConnection.getSenders();
          const sender = senders.find(s => s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
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
    
    // Close all peer connections
    for (const userId in peers) {
      peers[userId].peerConnection.close();
    }
    
    // Disconnect socket
    socket.disconnect();
    
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
        
        // Replace track in all peer connections
        for (const userId in peers) {
          const senders = peers[userId].peerConnection.getSenders();
          const sender = senders.find(s => s.track.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
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
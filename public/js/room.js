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
  copyRoomLinkToClipboard();
});

// Room link display and copy button
document.addEventListener('DOMContentLoaded', function() {
  // Display room link in the instructions
  const roomLinkDisplay = document.getElementById('roomLinkDisplay');
  if (roomLinkDisplay) {
    roomLinkDisplay.textContent = window.location.href;
  }
  
  // Add click handler for the second copy button
  const copyRoomLinkBtn = document.getElementById('copyRoomLink');
  if (copyRoomLinkBtn) {
    copyRoomLinkBtn.addEventListener('click', () => {
      copyRoomLinkToClipboard();
    });
  }
});

// Function to copy room link to clipboard
function copyRoomLinkToClipboard() {
  navigator.clipboard.writeText(window.location.href).then(() => {
    alert('Room link copied to clipboard! Share this with others to invite them.');
    if (window.debugLog) {
      window.debugLog('Room link copied to clipboard');
    }
  }).catch(err => {
    console.error('Could not copy room URL: ', err);
    if (window.debugLog) {
      window.debugLog(`Error copying room link: ${err.message}`);
    }
    
    // Fallback for browsers that don't support clipboard API
    const textArea = document.createElement('textarea');
    textArea.value = window.location.href;
    document.body.appendChild(textArea);
    textArea.select();
    
    try {
      document.execCommand('copy');
      alert('Room link copied to clipboard! Share this with others to invite them.');
    } catch (e) {
      alert('Cannot copy room link automatically. Please copy this link manually: ' + window.location.href);
    }
    
    document.body.removeChild(textArea);
  });
}

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
    // Free TURN server for development
    { 
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
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
    script.src = 'https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js';
    script.onload = () => initializePeerJS();
    document.head.appendChild(script);
  } else {
    initializePeerJS();
  }
}

// Initialize PeerJS
function initializePeerJS() {
  // Create a unique room-specific ID to avoid collisions
  const peerUserId = `${roomId}-${userId}`;
  
  // Clear any existing connections
  window.pendingConnections = {};
  
  // Update connection status if available
  if (window.updateConnectionStatus) {
    window.updateConnectionStatus('Connecting to signaling server...', false);
  }
  
  if (window.debugLog) {
    window.debugLog(`Initializing PeerJS with ID: ${peerUserId}`);
  }
  
  // Create a new Peer with room-specific userId
  myPeer = new Peer(peerUserId, {
    // Using the official PeerJS cloud server
    debug: 1,
    config: iceServers
  });
  
  myPeer.on('open', (id) => {
    console.log('Connected to PeerJS server with ID:', id);
    
    // Update connection status
    if (window.updateConnectionStatus) {
      window.updateConnectionStatus('Connected to signaling server', false);
    }
    
    if (window.debugLog) {
      window.debugLog(`PeerJS connection established with ID: ${id}`);
    }
    
    // Join the room
    joinRoom();
  });
  
  // Handle incoming calls
  myPeer.on('call', (call) => {
    // Extract the caller's user ID
    const callerPeerId = call.peer.split('-')[1]; // Extract the userId part
    
    console.log('Receiving call from:', callerPeerId);
    
    // Check if we already have a connection to this peer
    if (peers[callerPeerId]) {
      console.log(`Already connected to ${callerPeerId}, ignoring duplicate call`);
      // Still answer the call to avoid hanging
      call.answer(localStream);
      return;
    }
    
    if (window.debugLog) {
      window.debugLog(`Receiving call from: ${callerPeerId}`);
    }
    
    // Update connection status
    if (window.updateConnectionStatus) {
      window.updateConnectionStatus('Incoming call, connecting...', false);
    }
    
    // Answer the call with our stream
    call.answer(localStream);
    
    // Create a video element for the caller
    const video = createVideoElement(callerPeerId);
    
    // When we receive their stream
    call.on('stream', (remoteStream) => {
      console.log('Received remote stream');
      video.srcObject = remoteStream;
      
      if (window.debugLog) {
        window.debugLog(`Received stream from: ${callerPeerId}`);
      }
      
      // Update connection status
      if (window.updateConnectionStatus) {
        window.updateConnectionStatus('Call connected', false);
        // Hide the status after 2 seconds
        setTimeout(() => {
          document.getElementById('connectionStatus').style.display = 'none';
        }, 2000);
      }
      
      // Update the peer count
      if (window.updatePeersCount) {
        window.updatePeersCount(Object.keys(peers).length + 1); // +1 because we're adding this peer
      }
    });
    
    // When they leave
    call.on('close', () => {
      video.parentElement.remove();
      delete peers[callerPeerId];
      
      if (window.debugLog) {
        window.debugLog(`Call with ${callerPeerId} closed`);
      }
      
      // Update the peer count
      if (window.updatePeersCount) {
        window.updatePeersCount(Object.keys(peers).length);
      }
    });
    
    // Store the call
    peers[callerPeerId] = call;
  });
  
  myPeer.on('error', (err) => {
    console.error('PeerJS error:', err);
    
    if (window.debugLog) {
      window.debugLog(`PeerJS error: ${err.type} - ${err.message || ''}`);
    }
    
    // Update connection status
    if (window.updateConnectionStatus) {
      window.updateConnectionStatus('Connection error: ' + err.type, true);
      document.getElementById('connectionStatus').style.display = 'block';
    }
    
    // Try to reconnect
    setTimeout(() => {
      console.log('Attempting to reconnect...');
      if (myPeer.destroyed) {
        initializePeerJS();
      }
    }, 5000);
  });
  
  // Debug connection status
  myPeer.on('disconnected', () => {
    console.log('Disconnected from PeerJS server, attempting to reconnect...');
    
    if (window.debugLog) {
      window.debugLog('Disconnected from PeerJS server, attempting to reconnect...');
    }
    
    // Update connection status
    if (window.updateConnectionStatus) {
      window.updateConnectionStatus('Disconnected, reconnecting...', true);
      document.getElementById('connectionStatus').style.display = 'block';
    }
    
    myPeer.reconnect();
  });
  
  myPeer.on('close', () => {
    console.log('PeerJS connection closed');
    
    if (window.debugLog) {
      window.debugLog('PeerJS connection closed');
    }
    
    // Update connection status
    if (window.updateConnectionStatus) {
      window.updateConnectionStatus('Connection closed', true);
      document.getElementById('connectionStatus').style.display = 'block';
    }
  });
}

// Join room with PeerJS
function joinRoom() {
  console.log(`Joined room: ${roomId} with peer ID: ${userId}`);
  
  if (window.debugLog) {
    window.debugLog(`Joined room: ${roomId} with user ID: ${userId}`);
  }
  
  if (window.updateConnectionStatus) {
    window.updateConnectionStatus('Waiting for peers to join...', false);
  }
  
  // Broadcast our presence via server storage
  broadcastPresence();
  
  // Update peer count (just us at first)
  if (window.updatePeersCount) {
    window.updatePeersCount(1);
  }
  
  // For PeerJS, we'll use localStorage for peer discovery
  try {
    // Get existing room members
    let roomPeers = JSON.parse(localStorage.getItem(`room-${roomId}`)) || [];
    console.log('Existing peers in room:', roomPeers);
    
    if (window.debugLog) {
      window.debugLog(`Found ${roomPeers.length} existing peers in room`);
    }
    
    // Remove any stale peers (older than 1 hour)
    const now = Date.now();
    roomPeers = roomPeers.filter(peer => (now - peer.timestamp) < 3600000);
    
    // Connect to each existing member
    roomPeers.forEach(peer => {
      if (peer.id !== userId) {
        console.log(`Attempting to connect to existing user: ${peer.id}`);
        if (window.debugLog) {
          window.debugLog(`Attempting to connect to existing user: ${peer.id}`);
        }
        connectToUser(peer.id);
      }
    });
    
    // Add ourselves to the room with timestamp
    const myInfo = {
      id: userId,
      timestamp: Date.now(),
      fullPeerId: myPeer.id
    };
    
    // Remove our old entry if it exists
    roomPeers = roomPeers.filter(peer => peer.id !== userId);
    
    // Add our new entry
    roomPeers.push(myInfo);
    localStorage.setItem(`room-${roomId}`, JSON.stringify(roomPeers));
    
    if (window.debugLog) {
      window.debugLog(`Added self to room, now ${roomPeers.length} peers`);
    }
    
    // Setup "new peer" event listener for cross-tab discovery
    window.addEventListener('storage', function(e) {
      if (e.key === `room-${roomId}`) {
        try {
          const newPeers = JSON.parse(e.newValue) || [];
          if (window.debugLog) {
            window.debugLog(`Storage event: room-${roomId} changed, now ${newPeers.length} peers`);
          }
          
          // Check for new peers
          newPeers.forEach(peer => {
            if (peer.id !== userId && 
                !peers[peer.id] && 
                !window.pendingConnections?.[peer.id]) {
              if (window.debugLog) {
                window.debugLog(`Found new peer from storage event: ${peer.id}`);
              }
              connectToUser(peer.id);
            }
          });
        } catch (err) {
          console.error('Error processing storage event:', err);
        }
      }
    });
    
    // Update peers list periodically
    const peerUpdateInterval = setInterval(() => {
      try {
        if (!myPeer || myPeer.destroyed) {
          clearInterval(peerUpdateInterval);
          return;
        }
        
        let currentPeers = JSON.parse(localStorage.getItem(`room-${roomId}`)) || [];
        
        // Update our timestamp
        currentPeers = currentPeers.filter(peer => peer.id !== userId);
        currentPeers.push({
          id: userId,
          timestamp: Date.now(),
          fullPeerId: myPeer.id
        });
        localStorage.setItem(`room-${roomId}`, JSON.stringify(currentPeers));
        
        // Remove stale peers (older than 30 seconds)
        const oldPeers = [...currentPeers]; // Make a copy
        currentPeers = currentPeers.filter(peer => (Date.now() - peer.timestamp) < 30000);
        
        // If we removed any stale peers, update storage
        if (oldPeers.length !== currentPeers.length) {
          localStorage.setItem(`room-${roomId}`, JSON.stringify(currentPeers));
          if (window.debugLog) {
            window.debugLog(`Removed ${oldPeers.length - currentPeers.length} stale peers`);
          }
        }
        
        // Check for new peers to connect to
        currentPeers.forEach(peer => {
          if (peer.id !== userId && 
              !peers[peer.id] && 
              !window.pendingConnections?.[peer.id]) {
            console.log(`Found new peer: ${peer.id}`);
            if (window.debugLog) {
              window.debugLog(`Found new peer: ${peer.id}`);
            }
            connectToUser(peer.id);
          }
        });
        
        // Update the peer count
        if (window.updatePeersCount) {
          window.updatePeersCount(Object.keys(peers).length + 1); // +1 for ourselves
        }
        
        // For debugging, update the connection status
        if (window.updateConnectionStatus && Object.keys(peers).length === 0) {
          const statusText = document.getElementById('statusText');
          if (statusText && statusText.textContent.includes('Connected')) {
            document.getElementById('connectionStatus').style.display = 'block';
            window.updateConnectionStatus(`Waiting for peers to join (Room: ${roomId})...`, false);
          }
        }
        
        // Also broadcast our presence occasionally via the server
        if (Math.random() < 0.2) { // 20% chance to broadcast each interval
          broadcastPresence();
        }
        
        // Check server for new peers occasionally
        if (Math.random() < 0.3) { // 30% chance each interval
          fetch(`/api/room/${roomId}/users`)
            .then(response => response.json())
            .then(data => {
              if (data.users && data.users.length > 0) {
                if (window.debugLog) {
                  window.debugLog(`Server reports ${data.users.length} users in room`);
                }
                
                // Check for peers we're not connected to
                data.users.forEach(user => {
                  if (user.id !== userId && 
                      !peers[user.id] && 
                      !window.pendingConnections?.[user.id] && 
                      user.peerId) {
                    if (window.debugLog) {
                      window.debugLog(`Found new peer from server: ${user.id}`);
                    }
                    connectToUser(user.id);
                  }
                });
              }
            })
            .catch(err => {
              // It's okay if this fails on Vercel
              console.log('Error checking room users (expected on Vercel):', err);
            });
        }
        
      } catch (e) {
        console.error('Error updating peer list:', e);
        if (window.debugLog) {
          window.debugLog(`Error updating peer list: ${e.message}`);
        }
      }
    }, 5000);
    
    // Clean up on window unload
    window.addEventListener('beforeunload', () => {
      clearInterval(peerUpdateInterval);
      let currentPeers = JSON.parse(localStorage.getItem(`room-${roomId}`)) || [];
      currentPeers = currentPeers.filter(peer => peer.id !== userId);
      localStorage.setItem(`room-${roomId}`, JSON.stringify(currentPeers));
    });
    
  } catch (error) {
    console.error("Error with room management:", error);
    if (window.debugLog) {
      window.debugLog(`Error with room management: ${error.message}`);
    }
  }
}

// Broadcast our presence via server to help with discovery
function broadcastPresence() {
  try {
    // Use a simple GET request that servers can log
    const presenceUrl = `/api/presence?room=${roomId}&userId=${userId}&peerId=${myPeer.id}&t=${Date.now()}`;
    fetch(presenceUrl)
      .then(response => {
        if (window.debugLog && response.ok) {
          window.debugLog('Broadcast presence successfully');
        }
      })
      .catch(err => {
        // It's okay if this fails, it's just an additional discovery mechanism
        console.log('Presence broadcast failed (this is normal on Vercel):', err);
      });
  } catch (e) {
    // Ignore errors, this is just a helper
    console.log('Error broadcasting presence (expected):', e);
  }
}

// Connect to a specific user with PeerJS
function connectToUser(peerId) {
  // Prevent connecting to ourselves
  if (peerId === userId) {
    return;
  }
  
  // Check if we already have a connection to this peer
  if (peers[peerId]) {
    console.log(`Already connected to ${peerId}`);
    return;
  }
  
  // Add a pending flag to prevent duplicate connection attempts
  if (window.pendingConnections && window.pendingConnections[peerId]) {
    console.log(`Connection to ${peerId} already in progress`);
    return;
  }
  
  // Mark this connection as pending
  if (!window.pendingConnections) window.pendingConnections = {};
  window.pendingConnections[peerId] = true;
  
  console.log(`Calling peer: ${peerId} from ${userId}`);
  
  try {
    // The full peer ID includes the roomId
    const fullPeerId = `${roomId}-${peerId}`;
    
    // Update status
    if (window.updateConnectionStatus) {
      window.updateConnectionStatus(`Connecting to peer: ${peerId.substring(0, 5)}...`, false);
      document.getElementById('connectionStatus').style.display = 'block';
    }
    
    // Make the call
    const call = myPeer.call(fullPeerId, localStream);
    
    if (!call) {
      console.error(`Failed to create call to ${fullPeerId}`);
      if (window.updateConnectionStatus) {
        window.updateConnectionStatus(`Failed to call peer: ${peerId.substring(0, 5)}`, true);
      }
      delete window.pendingConnections[peerId];
      return;
    }
    
    // Set a timeout to clear the pending flag if connection fails
    const connectionTimeout = setTimeout(() => {
      if (window.pendingConnections[peerId]) {
        delete window.pendingConnections[peerId];
        if (window.debugLog) {
          window.debugLog(`Connection to ${peerId} timed out`);
        }
      }
    }, 15000); // 15 seconds timeout
    
    // Create video element
    const video = createVideoElement(peerId);
    
    // Handle the stream when it arrives
    call.on('stream', (remoteStream) => {
      console.log(`Received stream from ${peerId}`);
      clearTimeout(connectionTimeout);
      delete window.pendingConnections[peerId];
      
      if (video.srcObject !== remoteStream) {
        video.srcObject = remoteStream;
        
        // Update connection status
        if (window.updateConnectionStatus) {
          window.updateConnectionStatus(`Connected to ${peerId.substring(0, 5)}`, false);
          // Hide the status after 2 seconds
          setTimeout(() => {
            document.getElementById('connectionStatus').style.display = 'none';
          }, 2000);
        }
      }
    });
    
    // Handle call ending
    call.on('close', () => {
      console.log(`Call with ${peerId} closed`);
      clearTimeout(connectionTimeout);
      delete window.pendingConnections[peerId];
      video.parentElement.remove();
      delete peers[peerId];
      
      // Update connection status
      if (window.updateConnectionStatus && Object.keys(peers).length === 0) {
        window.updateConnectionStatus('Call ended, waiting for peers...', false);
        document.getElementById('connectionStatus').style.display = 'block';
      }
    });
    
    // Handle errors
    call.on('error', (err) => {
      console.error(`Call error with ${peerId}:`, err);
      clearTimeout(connectionTimeout);
      delete window.pendingConnections[peerId];
      
      if (window.updateConnectionStatus) {
        window.updateConnectionStatus(`Call error with ${peerId.substring(0, 5)}: ${err}`, true);
        document.getElementById('connectionStatus').style.display = 'block';
      }
      delete peers[peerId];
    });
    
    // Store the call reference
    peers[peerId] = call;
  } catch (e) {
    console.error(`Error connecting to peer ${peerId}:`, e);
    delete window.pendingConnections[peerId];
    
    if (window.updateConnectionStatus) {
      window.updateConnectionStatus(`Error connecting to ${peerId.substring(0, 5)}: ${e.message}`, true);
      document.getElementById('connectionStatus').style.display = 'block';
    }
  }
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
            if (peers[userId].peerConnection) {
              peers[userId].peerConnection.getSenders().forEach(sender => {
                if (sender.track.kind === 'video') {
                  sender.replaceTrack(videoTrack);
                }
              });
            } else if (typeof peers[userId].replaceTrack === 'function') {
              // For PeerJS direct calls
              const senders = peers[userId].peerConnection?.getSenders();
              if (senders) {
                const sender = senders.find(s => s.track.kind === 'video');
                if (sender) {
                  sender.replaceTrack(videoTrack);
                }
              }
            }
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
        } else if (typeof peers[userId].close === 'function') {
          peers[userId].close();
        }
      }
    }
    
    // Remove from room peers list
    try {
      let roomPeers = JSON.parse(localStorage.getItem(`room-${roomId}`)) || [];
      roomPeers = roomPeers.filter(peer => peer.id !== userId);
      localStorage.setItem(`room-${roomId}`, JSON.stringify(roomPeers));
    } catch (e) {
      console.error('Error removing from room list:', e);
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
            if (peers[userId].peerConnection) {
              peers[userId].peerConnection.getSenders().forEach(sender => {
                if (sender.track.kind === 'video') {
                  sender.replaceTrack(videoTrack);
                }
              });
            } else if (typeof peers[userId].replaceTrack === 'function') {
              // For PeerJS direct calls
              const senders = peers[userId].peerConnection?.getSenders();
              if (senders) {
                const sender = senders.find(s => s.track.kind === 'video');
                if (sender) {
                  sender.replaceTrack(videoTrack);
                }
              }
            }
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
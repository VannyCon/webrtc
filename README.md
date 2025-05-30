# WebRTC Video Chat Application

A simple video chat application built with WebRTC, Socket.io, and Express.js that allows users to create or join video chat rooms and make video calls from anywhere in the world.

## Features

- Create or join video chat rooms
- Real-time video and audio communication
- Screen sharing
- Mute audio/disable video
- Copy room ID to invite others
- Responsive design for desktop and mobile devices

## Prerequisites

- Node.js (version 14 or higher)
- npm (comes with Node.js)

## Installation

1. Clone this repository or download the files
2. Install dependencies:

```bash
npm install
```

## Running Locally

To start the development server:

```bash
npm run dev
```

This will start the server on http://localhost:3000

## How to Use

1. Open the application in your browser
2. Either create a new room or join an existing one by entering a Room ID
3. Allow browser access to your camera and microphone when prompted
4. Share your Room ID with others to invite them to join
5. Use the control buttons to toggle video/audio, share your screen, or leave the room

## Deployment

### Deploy to Heroku

1. Create a Heroku account if you don't have one
2. Install the Heroku CLI
3. Login to Heroku:

```bash
heroku login
```

4. Create a new Heroku app:

```bash
heroku create your-app-name
```

5. Deploy your application:

```bash
git init
git add .
git commit -m "Initial commit"
git push heroku master
```

### Deploy to other platforms

The application can be deployed to any platform that supports Node.js applications like:

- Vercel
- Netlify
- AWS Elastic Beanstalk
- Digital Ocean
- Railway

## TURN Server Configuration

For production use, you should add TURN servers to handle connections when direct peer-to-peer connections are not possible due to NAT or firewalls. 

Update the `iceServers` configuration in `public/js/room.js` with your TURN server credentials:

```javascript
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'turn:your-turn-server.com', username: 'username', credential: 'credential' },
  ]
};
```

You can use services like [Twilio's TURN service](https://www.twilio.com/stun-turn) or [Coturn](https://github.com/coturn/coturn) (self-hosted). 
#!/bin/bash

# Install Vercel CLI if not already installed
if ! command -v vercel &> /dev/null
then
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

# Build and deploy to Vercel
echo "Deploying to Vercel..."
vercel --prod

echo "Deployment complete!"
echo "Note: For WebRTC to work properly in production, make sure to:"
echo "1. Use secure HTTPS connections"
echo "2. Configure TURN servers in public/js/room.js"
echo "3. Check browser console for any connection errors" 
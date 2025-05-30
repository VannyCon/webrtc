@echo off
echo Installing Vercel CLI...
call npm install -g vercel

echo Deploying to Vercel...
call vercel --prod

echo Deployment complete!
echo Note: For WebRTC to work properly in production, make sure to:
echo 1. Use secure HTTPS connections
echo 2. Configure TURN servers in public/js/room.js
echo 3. Check browser console for any connection errors

pause 
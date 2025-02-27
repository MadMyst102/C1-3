#!/bin/bash

echo "Starting Cashier Management System..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Node.js is not installed! Please install Node.js from https://nodejs.org/"
    exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "Installing client dependencies..."
    npm install
fi

if [ ! -d "server/node_modules" ]; then
    echo "Installing server dependencies..."
    cd server
    npm install
    cd ..
fi

# Initialize database
cd server
npm run init-db
cd ..

# Start both servers
echo "Starting servers..."
gnome-terminal --title="WebSocket Server" -- bash -c "cd server && npm run dev; exec bash" 2>/dev/null || \
xterm -T "WebSocket Server" -e "cd server && npm run dev" 2>/dev/null || \
osascript -e 'tell app "Terminal" to do script "cd '$PWD'/server && npm run dev"' 2>/dev/null || \
(cd server && npm run dev &)

sleep 5

gnome-terminal --title="React Server" -- bash -c "npm run dev; exec bash" 2>/dev/null || \
xterm -T "React Server" -e "npm run dev" 2>/dev/null || \
osascript -e 'tell app "Terminal" to do script "cd '$PWD' && npm run dev"' 2>/dev/null || \
(npm run dev &)

echo
echo "Application is starting..."
echo "You can access it at http://localhost:5173"
echo
echo "Press Ctrl+C to close all servers..."

# Wait for user interrupt
trap 'kill $(jobs -p)' INT
wait

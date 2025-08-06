#!/bin/bash

echo "🚀 Starting Claire Development Environment"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Start server in background
echo -e "${BLUE}Starting server on port 3001...${NC}"
cd server && bun run dev &
SERVER_PID=$!

# Wait a bit for server to start
sleep 2

# Start client
echo -e "${GREEN}Starting client on port 8085...${NC}"
cd ../client && bunx expo start --port 8085 &
CLIENT_PID=$!

echo ""
echo -e "${GREEN}✅ Development environment started!${NC}"
echo ""
echo "📱 Client: http://localhost:8085"
echo "🖥️  Server: http://localhost:3001"
echo ""
echo "Press Ctrl+C to stop both services"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Stopping services..."
    kill $SERVER_PID 2>/dev/null
    kill $CLIENT_PID 2>/dev/null
    exit
}

# Trap Ctrl+C
trap cleanup INT

# Wait for both processes
wait
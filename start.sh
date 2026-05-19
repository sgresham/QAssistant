#!/bin/bash

echo -e "\e[36m🚀 Starting AI Assistant Platform...\e[0m"

# Install root dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing root dependencies..."
    npm install
fi

# Install backend dependencies
if [ ! -d "backend/node_modules" ]; then
    echo "Installing backend dependencies..."
    cd backend && npm install && cd ..
fi

# Install frontend dependencies
if [ ! -d "frontend/node_modules" ]; then
    echo "Installing frontend dependencies..."
    cd frontend && npm install && cd ..
fi

# Start concurrently
npx concurrently "npm run backend:dev" "npm run frontend" --kill-others --prefix-colors "bgBlue.bold,bgGreen.bold"

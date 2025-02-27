#!/bin/bash

# Script to rebuild Docker container with improved error handling
echo "Starting Docker rebuild process..."
echo "This script will rebuild the Docker container with improved network resilience."

# Ensure Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "Error: Docker is not running or not installed. Please start Docker and try again."
  exit 1
fi
 
# Kill any running Docker builds
echo "Stopping any running Docker builds..."
pkill -f "docker-compose build" 2>/dev/null || true
sleep 2

# Clean up any previous builds
echo "Cleaning up previous Docker containers and images..."
docker-compose down --remove-orphans 2>/dev/null
docker system prune -f --filter "label=com.docker.compose.project=cline_agent" 2>/dev/null

# Build the Docker container with verbose output
echo "Building Docker container with updated configuration..."
docker-compose build --no-cache --progress=plain

# Check if build was successful
if [ $? -eq 0 ]; then
  echo "Docker build completed successfully!"
  echo "You can now start the container with: docker-compose up"
else
  echo "Docker build failed. Please check the error messages above."
  echo "If you continue to experience network issues, consider the following:"
  echo "1. Check your internet connection"
  echo "2. Try using a VPN if your network blocks certain connections"
  echo "3. Modify the Dockerfile to use mirrors closer to your location"
  echo "4. Increase the number of retry attempts in the Dockerfile"
fi

# Make the script executable
chmod +x "$0"

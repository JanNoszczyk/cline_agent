#!/bin/bash

# Improved script to rebuild Docker container while preserving existing resources when possible
# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}Starting Docker rebuild process...${NC}"
echo -e "${BLUE}This script will attempt to rebuild the Docker container while preserving existing resources.${NC}"

# Ensure Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}Error: Docker is not running or not installed. Please start Docker and try again.${NC}"
  exit 1
fi

# Check if container is running
CONTAINER_RUNNING=$(docker ps -q -f "name=cline_agent-cline-server")
if [ -n "$CONTAINER_RUNNING" ]; then
  echo -e "${YELLOW}Container is currently running. Stopping container gracefully...${NC}"
  docker-compose stop
  if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to stop container gracefully. Attempting to continue...${NC}"
  fi
else
  echo -e "${GREEN}No running container found. Proceeding with rebuild.${NC}"
fi

# Check if image exists
IMAGE_EXISTS=$(docker images -q cline_agent-cline-server)
if [ -n "$IMAGE_EXISTS" ]; then
  echo -e "${GREEN}Existing image found. Will attempt to reuse layers during build.${NC}"
else
  echo -e "${YELLOW}No existing image found. Will build from scratch.${NC}"
fi

# Build the Docker container with cache enabled (to reuse layers)
echo -e "${YELLOW}Building Docker container...${NC}"
echo -e "${YELLOW}This will preserve and reuse existing layers when possible.${NC}"
docker-compose build --progress=plain

# Check if build was successful
if [ $? -eq 0 ]; then
  echo -e "${GREEN}Docker build completed successfully!${NC}"
  echo -e "${GREEN}You can now start the container with: docker-compose up -d${NC}"
  
  # Ask if user wants to start the container
  read -p "Do you want to start the container now? (y/n) " -n 1 -r
  echo
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Starting container...${NC}"
    docker-compose up -d
    if [ $? -eq 0 ]; then
      echo -e "${GREEN}Container started successfully!${NC}"
      echo -e "${GREEN}You can access the code-server instance at http://localhost:8080${NC}"
      echo -e "${GREEN}The API server is available at http://localhost:3000${NC}"
    else
      echo -e "${RED}Failed to start container. Please check the error messages above.${NC}"
    fi
  fi
else
  echo -e "${RED}Docker build failed. Please check the error messages above.${NC}"
  echo -e "${YELLOW}If you continue to experience issues, consider the following:${NC}"
  echo -e "${YELLOW}1. Check your internet connection${NC}"
  echo -e "${YELLOW}2. Try using a VPN if your network blocks certain connections${NC}"
  echo -e "${YELLOW}3. Modify the Dockerfile to use mirrors closer to your location${NC}"
  echo -e "${YELLOW}4. Increase the number of retry attempts in the Dockerfile${NC}"
  echo -e "${YELLOW}5. If you need a complete rebuild, use: docker-compose build --no-cache${NC}"
fi

# Make the script executable
chmod +x "$0"

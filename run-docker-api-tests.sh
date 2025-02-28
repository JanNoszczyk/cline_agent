#!/bin/bash

# Colors for console output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3000"
API_KEY="test-api-key"

# Print header
echo -e "${CYAN}=== Docker API Server Endpoint Tests ===${NC}"
echo -e "${YELLOW}This script will test all API endpoints against the Docker API server.${NC}"

# Check if Docker is running
echo -e "\n${BLUE}Checking if Docker is running...${NC}"
if ! docker ps > /dev/null 2>&1; then
  echo -e "${RED}Docker is not running. Please start Docker and try again.${NC}"
  exit 1
fi
echo -e "${GREEN}Docker is running.${NC}"

# Check if the Docker container is running
echo -e "\n${BLUE}Checking if the Cline Docker container is running...${NC}"
if ! docker ps | grep cline-server > /dev/null; then
  echo -e "${YELLOW}Cline Docker container is not running. Starting it now...${NC}"
  
  # Check if run-docker.sh exists
  if [ -f "./run-docker.sh" ]; then
    echo -e "${YELLOW}Running ./run-docker.sh to start the container...${NC}"
    ./run-docker.sh --run
  else
    echo -e "${RED}Could not find run-docker.sh. Please start the Docker container manually.${NC}"
    exit 1
  fi
  
  # Wait for container to start
  echo -e "${YELLOW}Waiting for container to start...${NC}"
  sleep 10
  
  # Check again if container is running
  if ! docker ps | grep cline-server > /dev/null; then
    echo -e "${RED}Failed to start Cline Docker container. Please check Docker logs.${NC}"
    exit 1
  fi
fi
echo -e "${GREEN}Cline Docker container is running.${NC}"

# Check if the API server is accessible
echo -e "\n${BLUE}Checking if the API server is accessible...${NC}"
if ! curl -s -o /dev/null -w "%{http_code}" "${API_URL}/api/state" | grep -q "200"; then
  echo -e "${RED}API server is not accessible. Please check if it's running correctly.${NC}"
  echo -e "${YELLOW}You can check the Docker logs with: docker-compose logs${NC}"
  exit 1
fi
echo -e "${GREEN}API server is accessible.${NC}"

# Check if node-fetch is installed
echo -e "\n${BLUE}Checking if required npm packages are installed...${NC}"
if ! npm list node-fetch > /dev/null 2>&1; then
  echo -e "${YELLOW}node-fetch is not installed. Installing it now...${NC}"
  npm install node-fetch
fi
echo -e "${GREEN}Required npm packages are installed.${NC}"

# Run the tests
echo -e "\n${BLUE}Running Docker API tests...${NC}"
API_URL="${API_URL}" API_KEY="${API_KEY}" FRONTEND_URL="http://localhost:3002" node test-docker-api.js

# Check if the tests were successful
if [ $? -ne 0 ]; then
  echo -e "\n${RED}Tests failed. Please check the errors above.${NC}"
  exit 1
fi

echo -e "\n${GREEN}All tests completed.${NC}"

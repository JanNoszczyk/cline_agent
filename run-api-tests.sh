#!/bin/bash

# Script to run the API tests for the Docker server and frontend integration (now using cline-frontend-private)

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3000"
API_KEY="test-api-key"
FRONTEND_URL="http://localhost:3002"

# Check if the Docker container is running
echo -e "${YELLOW}Checking if the Docker container is running...${NC}"
if ! docker ps | grep -q cline-server; then
  echo -e "${RED}Docker container is not running. Please start it with:${NC}"
  echo -e "${BLUE}./run-docker.sh --run${NC}"
  exit 1
fi

# Check if the API server is accessible
echo -e "${YELLOW}Checking if the API server is accessible...${NC}"
if ! curl -s -o /dev/null -w "%{http_code}" ${API_URL}/api/state -H "X-API-Key: ${API_KEY}" | grep -q "200"; then
  echo -e "${RED}API server is not accessible. Please check if it's running correctly.${NC}"
  exit 1
fi

# Check if the frontend is running
echo -e "${YELLOW}Checking if the frontend is running...${NC}"
if ! curl -s -o /dev/null -w "%{http_code}" ${FRONTEND_URL} | grep -q "200"; then
  echo -e "${YELLOW}Frontend is not running. Starting it now...${NC}"
  
  # Check if we're in the right directory
  if [ ! -d "../cline-frontend-private" ]; then
    echo -e "${RED}cline-frontend-private directory not found. Please run this script from the project root.${NC}"
    exit 1
  fi
  
  # Start the frontend in the background
  echo -e "${BLUE}Starting the frontend...${NC}"
  cd ../cline-frontend-private
  npm run dev &
  FRONTEND_PID=$!
  cd ..
  
  # Wait for the frontend to start
  echo -e "${YELLOW}Waiting for the frontend to start...${NC}"
  for i in {1..30}; do
    if curl -s -o /dev/null -w "%{http_code}" ${FRONTEND_URL} | grep -q "200"; then
      echo -e "${GREEN}Frontend started successfully!${NC}"
      break
    fi
    
    if [ $i -eq 30 ]; then
      echo -e "${RED}Frontend failed to start within the timeout period.${NC}"
      if [ ! -z "$FRONTEND_PID" ]; then
        kill $FRONTEND_PID
      fi
      exit 1
    fi
    
    echo -n "."
    sleep 1
  done
  echo ""
else
  echo -e "${GREEN}Frontend is already running.${NC}"
fi

# Check if node-fetch is installed
echo -e "${YELLOW}Checking if required npm packages are installed...${NC}"
if ! npm list node-fetch | grep -q "node-fetch"; then
  echo -e "${YELLOW}Installing node-fetch...${NC}"
  npm install node-fetch
fi

# Check if puppeteer is installed
if ! npm list puppeteer | grep -q "puppeteer"; then
  echo -e "${YELLOW}Installing puppeteer...${NC}"
  npm install puppeteer
fi

# Run the Docker API tests
echo -e "\n${CYAN}=== Running Docker API Tests ===${NC}"
echo -e "${YELLOW}Running test-docker-api.js...${NC}"
API_URL=${API_URL} API_KEY=${API_KEY} FRONTEND_URL=${FRONTEND_URL} node test-docker-api.js

# Run the frontend integration tests
echo -e "\n${CYAN}=== Running Frontend Integration Tests ===${NC}"
echo -e "${YELLOW}Running test-frontend-api.js...${NC}"
API_URL=${API_URL} API_KEY=${API_KEY} FRONTEND_URL=${FRONTEND_URL} node test-frontend-api.js

# Run the API endpoint tests
echo -e "\n${CYAN}=== Running API Endpoint Tests ===${NC}"
echo -e "${YELLOW}Running test-api-endpoints.js...${NC}"
API_URL=${API_URL} API_KEY=${API_KEY} FRONTEND_URL=${FRONTEND_URL} node test-api-endpoints.js

# Clean up
if [ ! -z "$FRONTEND_PID" ]; then
  echo -e "\n${YELLOW}Stopping the frontend...${NC}"
  kill $FRONTEND_PID
  echo -e "${GREEN}Frontend stopped.${NC}"
fi

echo -e "\n${GREEN}All tests completed!${NC}"

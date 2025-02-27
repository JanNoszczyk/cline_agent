#!/bin/bash

# Script to run the end-to-end deployment tests for Cline Agent API Integration

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${MAGENTA}=== Cline Agent API Integration End-to-End Deployment Tests ===${NC}"
echo -e "${BLUE}This script will test the complete deployment of both the Docker API server and frontend (now moved to cline-frontend-private).${NC}"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Error: Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker is running
if ! docker info &> /dev/null; then
    echo -e "${RED}Error: Docker is not running. Please start Docker and try again.${NC}"
    exit 1
fi

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed. Please install npm first.${NC}"
    exit 1
fi

# Check if required npm packages are installed
echo -e "${YELLOW}Checking if required npm packages are installed...${NC}"

# Check if node-fetch is installed
if ! npm list node-fetch | grep -q "node-fetch"; then
    echo -e "${YELLOW}Installing node-fetch...${NC}"
    npm install node-fetch
fi

# Check if puppeteer is installed
if ! npm list puppeteer | grep -q "puppeteer"; then
    echo -e "${YELLOW}Installing puppeteer...${NC}"
    npm install puppeteer
fi

# Make the test script executable
chmod +x test-e2e-deployment.js

# Run the end-to-end deployment test
echo -e "${CYAN}Running end-to-end deployment tests...${NC}"
echo -e "${YELLOW}This will:${NC}"
echo -e "${YELLOW}1. Build and run the Docker container with the API server${NC}"
echo -e "${YELLOW}2. Start the frontend${NC}"
echo -e "${YELLOW}3. Test the connection between the frontend and the API server${NC}"
echo -e "${YELLOW}4. Verify all endpoints are working as expected${NC}"
echo -e "${YELLOW}5. Clean up resources after testing${NC}"
echo ""
echo -e "${YELLOW}Press Ctrl+C at any time to stop the tests and clean up resources.${NC}"
echo ""

# Ask for confirmation
read -p "Do you want to proceed with the tests? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${RED}Tests aborted.${NC}"
    exit 1
fi

# Run the test script
node test-e2e-deployment.js

# Check the exit code
if [ $? -eq 0 ]; then
    echo -e "${GREEN}End-to-end deployment tests completed successfully!${NC}"
else
    echo -e "${RED}End-to-end deployment tests failed. Please check the error messages above.${NC}"
    exit 1
fi

# Make the script executable
chmod +x "$0"

#!/bin/bash

# Script to run the end-to-end chess game creation tests for Cline Agent API Integration

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

echo -e "${MAGENTA}=== Cline Agent API Integration End-to-End Chess Game Creation Tests ===${NC}"
echo -e "${BLUE}This script will test the complete flow of creating a chess game using the Cline agent API.${NC}"

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

# Make the test script executable
chmod +x test-e2e-chess.js

# Run the end-to-end chess game creation test
echo -e "${CYAN}Running end-to-end chess game creation tests...${NC}"
echo -e "${YELLOW}This will:${NC}"
echo -e "${YELLOW}1. Build and run the Docker container with the API server${NC}"
echo -e "${YELLOW}2. Test the API server's chess game creation capabilities${NC}"
echo -e "${YELLOW}3. Use the Anthropic API as a fallback if needed${NC}"
echo -e "${YELLOW}4. Generate and verify a chess game script${NC}"
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

# Check if the Docker container is already running
if docker ps | grep -q "cline_agent-cline-server-1"; then
    echo -e "${GREEN}Docker container is already running. Using existing container.${NC}"
else
    echo -e "${YELLOW}Docker container is not running. Starting it now...${NC}"
    ./run-docker.sh --build --run
    
    # Wait a bit for the container to start
    echo -e "${YELLOW}Waiting for the container to start...${NC}"
    sleep 10
fi

# Run the test script
node test-e2e-chess.js

# Store the exit code
exit_code=$?

# Check if the chess game script was generated
if [ -f "e2e_chess_game.sh" ]; then
    echo -e "${GREEN}Chess game script was generated successfully.${NC}"
    echo -e "${CYAN}You can run the chess game with: ./e2e_chess_game.sh${NC}"
    
    # Ask if the user wants to run the chess game
    echo -e "${YELLOW}Do you want to run the chess game now? (y/n)${NC}"
    read -r run_game
    if [[ "$run_game" =~ ^[Yy]$ ]]; then
        echo -e "${CYAN}Running chess game...${NC}"
        ./e2e_chess_game.sh
    fi
else
    echo -e "${YELLOW}Chess game script was not found. It may have been cleaned up or not generated.${NC}"
    echo -e "${YELLOW}You can create a chess game directly using: ./create-chess-game.sh${NC}"
fi

# Check the exit code
if [ $exit_code -eq 0 ]; then
    echo -e "${GREEN}End-to-end chess game creation tests completed successfully!${NC}"
else
    echo -e "${RED}End-to-end chess game creation tests failed. Please check the error messages above.${NC}"
    exit 1
fi

# Make the script executable
chmod +x "$0"

#!/bin/bash

# Script to create a chess game using the Anthropic API
# This script is a wrapper around create-chess-game.js

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${BLUE}=== Chess Game Creation Script ===${NC}"
echo -e "${CYAN}This script will create a chess game using the Anthropic API${NC}"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed. Please install Node.js first.${NC}"
    exit 1
fi

# Check if the create-chess-game.js script exists
if [ ! -f "create-chess-game.js" ]; then
    echo -e "${RED}Error: create-chess-game.js not found. Please make sure it exists in the current directory.${NC}"
    exit 1
fi

# Ask for output file name
echo -e "${YELLOW}Enter the output file name (default: chess_game.sh):${NC}"
read -r output_file
output_file=${output_file:-chess_game.sh}

# Run the Node.js script
echo -e "${YELLOW}Creating chess game script...${NC}"
OUTPUT_FILE="$output_file" node create-chess-game.js

# Check if the script was created successfully
if [ -f "$output_file" ]; then
    echo -e "${GREEN}Chess game script created successfully!${NC}"
    echo -e "${CYAN}You can run it with: ./$output_file${NC}"
    
    # Ask if the user wants to run the script
    echo -e "${YELLOW}Do you want to run the chess game now? (y/n)${NC}"
    read -r run_game
    if [[ "$run_game" =~ ^[Yy]$ ]]; then
        echo -e "${CYAN}Running chess game...${NC}"
        ./"$output_file"
    fi
else
    echo -e "${RED}Failed to create chess game script.${NC}"
    exit 1
fi

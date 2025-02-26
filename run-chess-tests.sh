#!/bin/bash

# Script to run all chess-related tests and the chess game

# ANSI color codes for better readability
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
RESET='\033[0m'

# Function to print section headers
print_header() {
    echo -e "\n${BLUE}=== $1 ===${RESET}\n"
}

# Function to print info messages
print_info() {
    echo -e "${CYAN}i $1${RESET}"
}

# Function to print success messages
print_success() {
    echo -e "${GREEN}✓ $1${RESET}"
}

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}! $1${RESET}"
}

# Check if the Docker container is running
check_docker() {
    print_header "Checking Docker Container"
    
    print_info "Checking if the Docker container is running..."
    
    if docker ps | grep -q "cline-agent"; then
        print_success "Docker container is running."
    else
        print_warning "Docker container is not running. Starting it now..."
        
        if [ -f "./run-docker.sh" ]; then
            print_info "Running ./run-docker.sh --build --run"
            ./run-docker.sh --build --run
        else
            print_warning "run-docker.sh not found. Please start the Docker container manually."
            print_info "You can use: docker-compose up -d"
        fi
    fi
}

# Main function
main() {
    print_header "Cline Agent Chess Tests Runner"
    
    print_info "This script will run all chess-related tests and the chess game."
    print_info "Make sure the Docker container with the Cline agent is running."
    print_info "The Anthropic API key is stored in memory-bank/api_keys.md."
    
    # Check if the Docker container is running
    check_docker
    
    # Run the API test
    print_header "Running API Test"
    print_info "Running ./test-chess-api.sh"
    ./test-chess-api.sh
    
    # Run the Cline chess test
    print_header "Running Cline Chess Test"
    print_info "Running ./test-cline-chess.sh"
    ./test-cline-chess.sh
    
    # Run the chess game
    print_header "Running Chess Game"
    print_info "You can now run the chess game with: ./chess_game.sh"
    print_info "Or run the generated chess games with:"
    print_info "  - ./anthropic_chess_game.sh (if generated by test-chess-api.sh)"
    print_info "  - ./cline_chess_game.sh (if generated by test-cline-chess.sh)"
    
    print_header "Test Runner Complete"
    print_info "For more information, see README-chess-tests.md"
}

# Run the main function
main

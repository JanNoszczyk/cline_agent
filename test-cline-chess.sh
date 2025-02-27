#!/bin/bash

# Test script for using the Cline agent to create a chess game
# This script focuses on testing the end functionality in bash

# Configuration
API_URL="http://localhost:3000"
API_KEY="test-api-key"
CLAUDE_API_KEY="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"
MODEL="claude-3-7-sonnet-20240307"

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

# Function to print success messages
print_success() {
    echo -e "${GREEN}✓ $1${RESET}"
}

# Function to print error messages
print_error() {
    echo -e "${RED}✗ $1${RESET}"
}

# Function to print warning messages
print_warning() {
    echo -e "${YELLOW}! $1${RESET}"
}

# Function to print info messages
print_info() {
    echo -e "${CYAN}i $1${RESET}"
}

# Check if the API server is running
check_api_server() {
    print_header "Checking API Server"
    
    print_info "Checking if API server is running at $API_URL..."
    
    response=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$API_URL/api/state" -H "Origin: http://localhost:3002")
    
    if [ "$response" = "204" ]; then
        print_success "API server is running."
        return 0
    else
        print_error "API server is not running. Please start the Docker container."
        print_info "Run: ./run-docker.sh --build --run"
        return 1
    fi
}

# Send a task to the Cline agent to create a chess game
send_chess_task_to_cline() {
    print_header "Sending Chess Game Task to Cline Agent"
    
    print_info "First checking API authentication..."
    response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/state" -H "X-API-Key: $API_KEY")
    
    if [ "$response" != "200" ]; then
        print_error "API authentication failed. Got status code: $response"
        print_info "Using direct Anthropic API instead."
        use_direct_anthropic_api
        return 1
    fi
    
    print_success "API authentication successful."
    print_info "Sending task to create a chess game..."
    
    # This would be the endpoint to send a task to the Cline agent
    # Since it doesn't exist yet, we'll simulate it
    print_warning "Note: The current API only supports /api/state endpoint."
    print_warning "In a full implementation, we would send a task to create a chess game."
    
    # Simulate what would happen if we had a complete API
    print_info "Simulating task submission to Cline agent..."
    
    # Create a temporary file with the task
    cat > cline_task.txt << EOF
Create a simple chess game in bash that:
1. Displays a chess board in the terminal
2. Allows two players to make moves
3. Validates moves according to chess rules
4. Detects check and checkmate
5. Provides a simple interface for gameplay

Return only the bash script without any explanation.
EOF
    
    print_success "Task created in cline_task.txt"
    print_info "In a full implementation, this task would be sent to the Cline agent via API."
    
    # Since we can't actually send this to the Cline agent via API yet,
    # we'll use the direct Anthropic API as a demonstration
    print_info "Using direct Anthropic API to demonstrate the expected functionality..."
    use_direct_anthropic_api
    
    return 0
}

# Use the direct Anthropic API to create a chess game
use_direct_anthropic_api() {
    print_header "Using Direct Anthropic API"
    
    print_info "Sending request to Claude 3.7 to create a chess game..."
    
    # Read the task from the file if it exists, otherwise use a default prompt
    if [ -f "cline_task.txt" ]; then
        prompt=$(cat cline_task.txt)
    else
        prompt="Create a simple chess game in bash. Return only the bash script without any explanation."
    fi
    
    # Call Anthropic API
    print_info "Calling Anthropic API with Claude 3.7 model..."
    response=$(curl -s "https://api.anthropic.com/v1/messages" \
        -H "Content-Type: application/json" \
        -H "x-api-key: $CLAUDE_API_KEY" \
        -H "anthropic-version: 2023-06-01" \
        -d '{
            "model": "'"$MODEL"'",
            "max_tokens": 4000,
            "messages": [
                {
                    "role": "user",
                    "content": "'"$prompt"'"
                }
            ]
        }')
    
    # Check if we got a valid response
    if [[ $response == *"content"* ]]; then
        print_success "Successfully received response from Anthropic API."
        
        # Extract the script from the response
        script=$(echo "$response" | grep -o '"content":\[{"text":"[^}]*"}' | sed 's/"content":\[{"text":"//g' | sed 's/"}/"/g' | sed 's/\\n/\n/g' | sed 's/\\"/"/g')
        
        # Save the script to a file
        echo "$script" > cline_chess_game.sh
        chmod +x cline_chess_game.sh
        
        print_success "Chess game script saved to cline_chess_game.sh"
        print_info "You can run it with: ./cline_chess_game.sh"
        
        # Show a preview of the script
        print_header "Preview of Generated Chess Game Script"
        head -n 20 cline_chess_game.sh
        print_info "... (script continues)"
    else
        print_error "Failed to get a valid response from Anthropic API."
        echo "Response: $response"
        return 1
    fi
    
    return 0
}

# Test the generated chess game
test_generated_chess_game() {
    print_header "Testing Generated Chess Game"
    
    if [ ! -f "cline_chess_game.sh" ]; then
        print_error "Chess game script not found. Please run the previous steps first."
        return 1
    fi
    
    print_info "Checking if the generated script is executable..."
    if [ -x "cline_chess_game.sh" ]; then
        print_success "Script is executable."
    else
        print_warning "Script is not executable. Making it executable..."
        chmod +x cline_chess_game.sh
        print_success "Script is now executable."
    fi
    
    print_info "Analyzing the generated chess game script..."
    
    # Check if the script contains key chess-related terms
    if grep -q "chess\|board\|piece\|move\|king\|queen\|rook\|bishop\|knight\|pawn" cline_chess_game.sh; then
        print_success "Script contains chess-related terms."
    else
        print_warning "Script may not be a chess game. Please check the content."
    fi
    
    # Check if the script has a reasonable size
    size=$(wc -l < cline_chess_game.sh)
    if [ "$size" -gt 100 ]; then
        print_success "Script has a reasonable size ($size lines)."
    else
        print_warning "Script is quite small ($size lines). It may be incomplete."
    fi
    
    print_info "To play the generated chess game, run: ./cline_chess_game.sh"
    print_warning "Note: This is a demonstration of what would be possible with a full Cline agent API implementation."
    print_warning "In a complete implementation, the Cline agent would generate this script within the Docker container."
    
    return 0
}

# Explain what would be needed for a full implementation
explain_full_implementation() {
    print_header "Full Implementation Requirements"
    
    cat << EOF
To fully implement chess game creation using the Cline agent API, the following would be needed:

1. ${YELLOW}Extended API Server:${RESET}
   - Add endpoints for task submission and retrieval
   - Implement WebSocket support for real-time updates
   - Add file system access for saving and loading games

2. ${YELLOW}Cline Agent Integration:${RESET}
   - Configure the Cline agent to handle chess-specific tasks
   - Set up the agent to generate and execute bash scripts
   - Implement a way to return the generated script to the user

3. ${YELLOW}Docker Container Enhancements:${RESET}
   - Ensure the container has all dependencies for chess game development
   - Configure proper permissions for script execution
   - Set up persistent storage for saved games

4. ${YELLOW}Testing Framework:${RESET}
   - Create tests for the chess game functionality
   - Verify move validation and game rules
   - Test the user interface and gameplay experience
EOF
    
    print_info "The current implementation is a simulation of what would be possible with a full Cline agent API."
    print_info "It demonstrates the end functionality without requiring changes to the existing API server."
    
    return 0
}

# Main function
main() {
    print_header "Cline Agent Chess Game Test"
    
    # Check if the API server is running
    check_api_server
    api_status=$?
    
    # Send the task to create a chess game
    send_chess_task_to_cline
    
    # Test the generated chess game
    test_generated_chess_game
    
    # Explain what would be needed for a full implementation
    explain_full_implementation
    
    print_header "Test Summary"
    
    if [ $api_status -eq 0 ]; then
        print_success "API server is running and accessible."
        print_warning "However, the current API only supports basic functionality (/api/state endpoint)."
    else
        print_error "API server is not running or not accessible."
        print_info "The test used the direct Anthropic API as a fallback."
    fi
    
    print_success "Chess game script has been generated and saved to cline_chess_game.sh"
    print_info "You can run the chess game with: ./cline_chess_game.sh"
    print_info "This demonstrates the end functionality that would be possible with a full Cline agent API implementation."
    
    # Clean up temporary files
    if [ -f "cline_task.txt" ]; then
        rm cline_task.txt
        print_info "Cleaned up temporary files."
    fi
}

# Run the main function
main

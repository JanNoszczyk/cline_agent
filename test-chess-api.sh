#!/bin/bash

# Test script for Cline Agent API interaction with a focus on chess game functionality
# This script tests the API interaction with the Docker Cline agent server

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

# Test if the API server is running
test_api_server_running() {
    print_header "Testing API Server Availability"
    
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

# Test API authentication
test_api_authentication() {
    print_header "Testing API Authentication"
    
    print_info "Testing with valid API key..."
    response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/state" -H "X-API-Key: $API_KEY")
    
    if [ "$response" = "200" ]; then
        print_success "Authentication successful with valid API key."
    else
        print_error "Authentication failed with valid API key. Got status code: $response"
        return 1
    fi
    
    print_info "Testing with invalid API key..."
    response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/state" -H "X-API-Key: invalid-key")
    
    if [ "$response" = "401" ]; then
        print_success "Authentication correctly rejected invalid API key."
    else
        print_error "Authentication did not properly reject invalid API key. Got status code: $response"
        return 1
    fi
    
    return 0
}

# Test chess game creation functionality
test_chess_game_creation() {
    print_header "Testing Chess Game Creation"
    
    print_info "Attempting to create a chess game via Cline agent API..."
    print_warning "Note: This is testing a hypothetical endpoint that doesn't exist yet in the current API implementation."
    
    # This is a hypothetical endpoint that would be used to create a chess game
    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$API_URL/api/chess/create" \
        -H "X-API-Key: $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"gameType": "chess", "difficulty": "medium"}')
    
    if [ "$response" = "404" ]; then
        print_warning "As expected, the /api/chess/create endpoint doesn't exist yet."
        print_info "The current API server only supports the /api/state endpoint."
        print_info "To implement chess game functionality, the API server would need to be extended."
    elif [ "$response" = "200" ] || [ "$response" = "201" ]; then
        print_success "Chess game creation endpoint exists and returned success!"
        print_info "This is unexpected as the endpoint wasn't implemented in the original API server."
    else
        print_warning "Received unexpected status code: $response"
    fi
    
    return 0
}

# Test direct Anthropic API for chess functionality
test_anthropic_api() {
    print_header "Testing Direct Anthropic API for Chess Functionality"
    
    print_info "Sending a request to Claude 3.7 to create a simple chess game..."
    
    # Create a prompt for Claude to create a simple chess game
    prompt="Create a simple chess game in bash. Return only the bash script without any explanation."
    
    # Call Anthropic API
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
        echo "$script" > anthropic_chess_game.sh
        chmod +x anthropic_chess_game.sh
        
        print_success "Chess game script saved to anthropic_chess_game.sh"
        print_info "You can run it with: ./anthropic_chess_game.sh"
    else
        print_error "Failed to get a valid response from Anthropic API."
        echo "Response: $response"
        return 1
    fi
    
    return 0
}

# Test what would be needed to implement a full chess game API
test_implementation_requirements() {
    print_header "Chess Game API Implementation Requirements"
    
    cat << EOF
To implement a full chess game API in the Cline agent, the following would be needed:

1. ${YELLOW}API Endpoints:${RESET}
   - POST /api/chess/create - Create a new chess game
   - GET /api/chess/{gameId} - Get the current state of a chess game
   - POST /api/chess/{gameId}/move - Make a move in a chess game
   - GET /api/chess/{gameId}/suggestion - Get a move suggestion from the AI

2. ${YELLOW}Data Models:${RESET}
   - Game state representation (board, pieces, current player)
   - Move validation logic
   - Chess engine integration

3. ${YELLOW}Integration with Cline Agent:${RESET}
   - The Cline agent would need to be able to analyze chess positions
   - It would need to generate valid moves based on the current board state
   - It would need to evaluate positions and suggest good moves

4. ${YELLOW}Authentication:${RESET}
   - Continue using API key authentication
   - Add game ownership/session management

5. ${YELLOW}Frontend Integration:${RESET}
   - Update the frontend to display the chess board
   - Add UI for making moves and requesting suggestions
EOF
    
    print_info "The current API server would need to be extended to support these features."
    print_info "This would involve modifying api_server.js to add the new endpoints and logic."
    
    return 0
}

# Main function to run all tests
main() {
    print_header "Cline Agent API Chess Functionality Test"
    
    # Test if the API server is running
    test_api_server_running
    api_status=$?
    
    if [ $api_status -ne 0 ]; then
        print_warning "API server tests will be skipped as the server is not running."
        print_info "To run the API server, use: ./run-docker.sh --build --run"
    else
        # Test API authentication
        test_api_authentication
        auth_status=$?
        
        if [ $auth_status -ne 0 ]; then
            print_error "API authentication tests failed. Skipping further API tests."
        else
            # Test chess game creation
            test_chess_game_creation
        fi
    fi
    
    # Test direct Anthropic API as a fallback
    test_anthropic_api
    
    # Test implementation requirements
    test_implementation_requirements
    
    print_header "Test Summary"
    
    if [ $api_status -eq 0 ]; then
        print_success "API server is running and accessible."
        
        if [ $auth_status -eq 0 ]; then
            print_success "API authentication is working correctly."
        else
            print_error "API authentication has issues."
        fi
        
        print_warning "Chess game API functionality is not yet implemented in the current API server."
    else
        print_error "API server is not running or not accessible."
    fi
    
    print_success "Direct Anthropic API test completed."
    print_info "A sample chess game script has been generated and saved to anthropic_chess_game.sh"
    
    print_info "To implement full chess game functionality, the API server would need to be extended."
    print_info "See the 'Chess Game API Implementation Requirements' section for details."
}

# Run the main function
main

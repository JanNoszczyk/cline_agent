#!/bin/bash

# Simple Bash Chess Game using Cline Agent API
# This script creates a simple chess game that uses the Cline agent to suggest moves

# Configuration
API_URL="http://localhost:3000"
API_KEY="test-api-key"
CLAUDE_API_KEY="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"
MODEL="claude-3-7-sonnet-20240307"

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
WHITE='\033[1;37m'
BLACK='\033[0;30m'
BG_WHITE='\033[47m'
BG_BLACK='\033[40m'
RESET='\033[0m'

# Initialize the chess board
initialize_board() {
    # Create an 8x8 array to represent the chess board
    # Empty squares are represented by " "
    # White pieces: ♙(pawn), ♖(rook), ♘(knight), ♗(bishop), ♕(queen), ♔(king)
    # Black pieces: ♟(pawn), ♜(rook), ♞(knight), ♝(bishop), ♛(queen), ♚(king)
    
    # Initialize empty board
    for ((i=0; i<8; i++)); do
        for ((j=0; j<8; j++)); do
            board[$i,$j]=" "
        done
    done
    
    # Set up white pieces
    board[7,0]="♖"; board[7,1]="♘"; board[7,2]="♗"; board[7,3]="♕"
    board[7,4]="♔"; board[7,5]="♗"; board[7,6]="♘"; board[7,7]="♖"
    for ((j=0; j<8; j++)); do
        board[6,$j]="♙"
    done
    
    # Set up black pieces
    board[0,0]="♜"; board[0,1]="♞"; board[0,2]="♝"; board[0,3]="♛"
    board[0,4]="♚"; board[0,5]="♝"; board[0,6]="♞"; board[0,7]="♜"
    for ((j=0; j<8; j++)); do
        board[1,$j]="♟"
    done
}

# Display the chess board
display_board() {
    clear
    echo -e "${YELLOW}   a b c d e f g h ${RESET}"
    echo -e "${YELLOW}  +-+-+-+-+-+-+-+-+${RESET}"
    
    for ((i=0; i<8; i++)); do
        echo -n -e "${YELLOW}$((8-i)) |${RESET}"
        for ((j=0; j<8; j++)); do
            # Determine background color (alternating white and black)
            if (( (i+j) % 2 == 0 )); then
                bg=$BG_WHITE
                fg=$BLACK
            else
                bg=$BG_BLACK
                fg=$WHITE
            fi
            
            # Print the piece with appropriate colors
            echo -n -e "${bg}${fg}${board[$i,$j]}${RESET}"
            echo -n -e "${YELLOW}|${RESET}"
        done
        echo -e "${YELLOW} $((8-i))${RESET}"
        echo -e "${YELLOW}  +-+-+-+-+-+-+-+-+${RESET}"
    done
    
    echo -e "${YELLOW}   a b c d e f g h ${RESET}"
    echo ""
}

# Convert algebraic notation (e.g., "e4") to array indices
convert_notation() {
    local notation=$1
    local col=$(($(printf "%d" "'${notation:0:1}") - 97))
    local row=$((8 - ${notation:1:1}))
    echo "$row $col"
}

# Make a move on the board
make_move() {
    local from=$1
    local to=$2
    
    # Convert algebraic notation to array indices
    read from_row from_col <<< $(convert_notation "$from")
    read to_row to_col <<< $(convert_notation "$to")
    
    # Move the piece
    board[$to_row,$to_col]=${board[$from_row,$from_col]}
    board[$from_row,$from_col]=" "
}

# Check if the API server is running
check_api_server() {
    echo "Checking API server at $API_URL..."
    
    response=$(curl -s -o /dev/null -w "%{http_code}" -X OPTIONS "$API_URL/api/state" -H "Origin: http://localhost:3002")
    
    if [ "$response" = "204" ]; then
        echo -e "${GREEN}API server is running.${RESET}"
        return 0
    else
        echo -e "${RED}API server is not running. Please start the Docker container.${RESET}"
        echo "Run: ./run-docker.sh --build --run"
        return 1
    fi
}

# Get a move suggestion from the Cline agent
get_move_suggestion() {
    local board_state=$1
    local current_player=$2
    
    echo "Asking Cline agent for a move suggestion..."
    
    # First check if the API server is available
    response=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$API_URL/api/state" -H "X-API-Key: $API_KEY")
    
    if [ "$response" != "200" ]; then
        echo -e "${RED}Cannot connect to Cline agent API. Using direct Anthropic API instead.${RESET}"
        
        # Use Anthropic API directly as a fallback
        prompt="You are a chess assistant. Given the current board state below, suggest a good move for $current_player.
        
Board state:
$board_state

Please respond with just the move in algebraic notation (e.g., 'e2e4')."

        # Call Anthropic API
        response=$(curl -s "https://api.anthropic.com/v1/messages" \
            -H "Content-Type: application/json" \
            -H "x-api-key: $CLAUDE_API_KEY" \
            -H "anthropic-version: 2023-06-01" \
            -d '{
                "model": "'"$MODEL"'",
                "max_tokens": 100,
                "messages": [
                    {
                        "role": "user",
                        "content": "'"$prompt"'"
                    }
                ]
            }')
        
        # Extract the suggested move from the response
        suggested_move=$(echo "$response" | grep -o '"content":\[{"text":"[^"]*"' | sed 's/"content":\[{"text":"//g' | sed 's/"//g' | tr -d '\n' | grep -o '[a-h][1-8][a-h][1-8]')
        
        if [ -z "$suggested_move" ]; then
            echo -e "${RED}Failed to get a move suggestion.${RESET}"
            return 1
        else
            echo -e "${GREEN}Suggested move: ${suggested_move:0:2} to ${suggested_move:2:2}${RESET}"
            return 0
        fi
    else
        echo -e "${GREEN}Connected to Cline agent API.${RESET}"
        echo -e "${YELLOW}Note: This is a mock implementation as the current API only supports /api/state endpoint.${RESET}"
        echo -e "${YELLOW}In a full implementation, we would send the board state to the Cline agent.${RESET}"
        
        # Mock response - in a real implementation, we would send the board state to the Cline agent
        # and get a proper response
        sleep 2
        suggested_moves=("e2e4" "d2d4" "g1f3" "c2c4" "e7e5" "d7d5" "c7c5" "g8f6")
        suggested_move=${suggested_moves[$RANDOM % ${#suggested_moves[@]}]}
        
        echo -e "${GREEN}Suggested move: ${suggested_move:0:2} to ${suggested_move:2:2}${RESET}"
        return 0
    fi
}

# Convert board to string representation for API
board_to_string() {
    local result=""
    for ((i=0; i<8; i++)); do
        for ((j=0; j<8; j++)); do
            result+="${board[$i,$j]} "
        done
        result+="\n"
    done
    echo "$result"
}

# Main game loop
main() {
    echo -e "${BLUE}=== Simple Bash Chess Game using Cline Agent ===${RESET}"
    echo "This game uses the Cline agent to suggest moves."
    echo ""
    
    # Check if the API server is running
    check_api_server
    api_status=$?
    
    if [ $api_status -ne 0 ]; then
        echo -e "${YELLOW}Continuing without API server. Will use direct Anthropic API for move suggestions.${RESET}"
    fi
    
    # Initialize the board
    initialize_board
    
    # Game state
    current_player="White"
    turn=1
    
    while true; do
        # Display the board
        display_board
        
        echo -e "${BLUE}Turn $turn: $current_player's move${RESET}"
        
        if [ "$current_player" = "White" ]; then
            # Human player's turn
            echo "Enter your move (e.g., e2e4) or 'q' to quit:"
            read move
            
            if [ "$move" = "q" ]; then
                echo "Thanks for playing!"
                break
            fi
            
            if [ ${#move} -ne 4 ]; then
                echo -e "${RED}Invalid move format. Please use algebraic notation (e.g., e2e4).${RESET}"
                read -p "Press Enter to continue..."
                continue
            fi
            
            # Make the move
            from=${move:0:2}
            to=${move:2:2}
            make_move "$from" "$to"
            
            # Switch player
            current_player="Black"
        else
            # AI player's turn
            echo "Cline agent is thinking..."
            
            # Get board state as string
            board_state=$(board_to_string)
            
            # Get move suggestion from Cline agent
            get_move_suggestion "$board_state" "$current_player"
            
            echo "Press Enter to make the suggested move, or type an alternative move:"
            read move
            
            if [ -z "$move" ]; then
                # Use suggested move
                move=$suggested_move
            fi
            
            if [ "$move" = "q" ]; then
                echo "Thanks for playing!"
                break
            fi
            
            # Make the move
            from=${move:0:2}
            to=${move:2:2}
            make_move "$from" "$to"
            
            # Switch player
            current_player="White"
            ((turn++))
        fi
    done
}

# Start the game
main

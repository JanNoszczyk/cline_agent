#!/bin/bash

# Script to disable Husky hooks temporarily for Docker development

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}Temporarily disabling Husky hooks for Docker development...${NC}"

# Set HUSKY environment variable to 0 to disable hooks
export HUSKY=0

# Function to display help
show_help() {
    echo -e "${BLUE}Usage: $0 [git command]${NC}"
    echo -e "${BLUE}Examples:${NC}"
    echo -e "  ${GREEN}$0 commit -m \"Your commit message\"${NC}    Run git commit with Husky disabled"
    echo -e "  ${GREEN}$0 add .${NC}                               Run git add with Husky disabled"
    echo -e "  ${GREEN}$0 push${NC}                                Run git push with Husky disabled"
}

# Check if a git command was provided
if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

# Run the git command with Husky disabled
echo -e "${YELLOW}Running: git $@${NC}"
git "$@"

echo -e "${GREEN}Command completed. Husky hooks will be re-enabled for future git commands.${NC}"

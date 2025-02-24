#!/bin/bash

# Script to permanently disable Husky hooks for Docker development

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${YELLOW}This script will permanently disable Husky hooks for this repository.${NC}"
echo -e "${YELLOW}This is useful for Docker development where linting checks are not needed.${NC}"
echo -e "${RED}Warning: This will modify the git configuration for this repository only.${NC}"
echo -e "${RED}It will not affect other repositories or your global git configuration.${NC}"

# Ask for confirmation
read -p "Do you want to continue? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Operation cancelled.${NC}"
    exit 0
fi

# Disable Husky by setting core.hooksPath to an empty directory
echo -e "${YELLOW}Disabling Husky hooks...${NC}"
git config core.hooksPath /dev/null

# Verify that Husky is disabled
if [ "$(git config core.hooksPath)" == "/dev/null" ]; then
    echo -e "${GREEN}Husky hooks have been successfully disabled for this repository.${NC}"
    echo -e "${GREEN}You can now commit changes without linting checks.${NC}"
else
    echo -e "${RED}Failed to disable Husky hooks.${NC}"
    exit 1
fi

echo -e "${BLUE}To re-enable Husky hooks, run:${NC}"
echo -e "${GREEN}git config --unset core.hooksPath${NC}"

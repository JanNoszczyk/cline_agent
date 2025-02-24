#!/bin/bash

# Test script to verify that the Cline API server is working correctly

# Set the API key (should match the one used in docker-compose.yml)
API_KEY=${CLINE_API_KEY:-"your-api-key"}

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
NC='\033[0m' # No Color

# Function to check if a command succeeded
check_result() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Success${NC}"
  else
    echo -e "${RED}✗ Failed${NC}"
    exit 1
  fi
}

echo -e "${YELLOW}=== Cline API Server Test ===${NC}"

# Check if the container is running
echo -e "\n${YELLOW}Checking if the container is running...${NC}"
docker-compose ps | grep "cline-server" | grep "Up"
check_result

# Check if the API server is running
echo -e "\n${YELLOW}Testing API server connection...${NC}"
STATUS_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/state -H "X-API-Key: $API_KEY")
if [ "$STATUS_CODE" -eq 200 ]; then
  echo -e "${GREEN}✓ API server is running (Status code: $STATUS_CODE)${NC}"
else
  echo -e "${RED}✗ API server returned status code: $STATUS_CODE${NC}"
  echo "Failed to connect to API server. Make sure the container is running and the API server is exposed on port 3000."
  exit 1
fi

# Get the current state
echo -e "\n${YELLOW}Getting current state...${NC}"
STATE=$(curl -s http://localhost:3000/api/state -H "X-API-Key: $API_KEY")
if [ -n "$STATE" ]; then
  echo -e "${GREEN}✓ Successfully retrieved state${NC}"
  echo "$STATE" | grep -v "null" | head -n 20 # Show first 20 non-null lines
else
  echo -e "${RED}✗ Failed to retrieve state${NC}"
  exit 1
fi

# Check if the extension is installed
echo -e "\n${YELLOW}Checking if the Cline extension is installed...${NC}"
EXTENSIONS=$(docker-compose exec -T cline-server code-server --list-extensions)
if echo "$EXTENSIONS" | grep -q "saoudrizwan.claude-dev"; then
  echo -e "${GREEN}✓ Cline extension is installed${NC}"
else
  echo -e "${RED}✗ Cline extension is not installed${NC}"
  echo "Available extensions:"
  echo "$EXTENSIONS"
  exit 1
fi

# Check if the API key is set
echo -e "\n${YELLOW}Checking if the API key is set...${NC}"
API_KEY_ENV=$(docker-compose exec -T cline-server printenv | grep CLINE_API_KEY)
if [ -n "$API_KEY_ENV" ]; then
  echo -e "${GREEN}✓ API key is set${NC}"
else
  echo -e "${RED}✗ API key is not set${NC}"
  exit 1
fi

# Check if the settings.json file is properly configured
echo -e "\n${YELLOW}Checking if the settings.json file is properly configured...${NC}"
SETTINGS=$(docker-compose exec -T cline-server cat /home/coder/.local/share/code-server/User/settings.json 2>/dev/null)
if [ -n "$SETTINGS" ]; then
  echo -e "${GREEN}✓ settings.json file exists${NC}"
  echo "$SETTINGS"
else
  echo -e "${RED}✗ settings.json file does not exist or is empty${NC}"
  exit 1
fi

echo -e "\n${GREEN}=== API server test completed successfully! ===${NC}"

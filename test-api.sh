#!/bin/bash

# Test script to verify that the Cline API server is working correctly

# Set the API key (should match the one used in docker-compose.yml)
API_KEY=${CLINE_API_KEY:-"your-api-key"}

# Set the API server URL
API_URL="http://localhost:3000"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
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

# Function to make API requests
make_request() {
  local method=$1
  local endpoint=$2
  local data=$3
  local expected_status=$4

  echo -e "\n${BLUE}Making ${method} request to ${endpoint}${NC}"
  
  if [ -z "$data" ]; then
    response=$(curl -s -X ${method} -H "X-API-Key: ${API_KEY}" -H "Content-Type: application/json" -w "\n%{http_code}" ${API_URL}${endpoint})
  else
    response=$(curl -s -X ${method} -H "X-API-Key: ${API_KEY}" -H "Content-Type: application/json" -d "${data}" -w "\n%{http_code}" ${API_URL}${endpoint})
  fi
  
  status_code=$(echo "$response" | tail -n1)
  response_body=$(echo "$response" | sed '$d')
  
  echo -e "Status code: ${status_code}"
  echo -e "Response: ${response_body}"
  
  if [ "$status_code" -eq "$expected_status" ]; then
    echo -e "${GREEN}✓ Status code matches expected ${expected_status}${NC}"
  else
    echo -e "${RED}✗ Status code ${status_code} does not match expected ${expected_status}${NC}"
    exit 1
  fi
  
  echo "$response_body"
}

echo -e "${YELLOW}=== Cline API Server Test ===${NC}"

# Check if the container is running
echo -e "\n${YELLOW}Checking if the container is running...${NC}"
docker-compose ps -q cline-server > /dev/null 2>&1
check_result

# Test API server connection
echo -e "\n${YELLOW}Testing API server connection...${NC}"
curl -s -o /dev/null -w "%{http_code}" ${API_URL}/api/state -H "X-API-Key: ${API_KEY}" | grep -q "200"
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ API server is running${NC}"
else
  echo -e "${RED}✗ API server is not running or not accessible${NC}"
  exit 1
fi

# Test authentication
echo -e "\n${YELLOW}Testing authentication...${NC}"
# Test with invalid API key
response=$(curl -s -X GET -H "X-API-Key: invalid-key" -w "\n%{http_code}" ${API_URL}/api/state)
status_code=$(echo "$response" | tail -n1)
if [ "$status_code" -eq "401" ]; then
  echo -e "${GREEN}✓ Authentication check passed (rejected invalid key)${NC}"
else
  echo -e "${RED}✗ Authentication check failed (accepted invalid key)${NC}"
  exit 1
fi

# Test with valid API key
response=$(curl -s -X GET -H "X-API-Key: ${API_KEY}" -w "\n%{http_code}" ${API_URL}/api/state)
status_code=$(echo "$response" | tail -n1)
if [ "$status_code" -eq "200" ]; then
  echo -e "${GREEN}✓ Authentication check passed (accepted valid key)${NC}"
else
  echo -e "${RED}✗ Authentication check failed (rejected valid key)${NC}"
  exit 1
fi

# Test task management endpoints
echo -e "\n${YELLOW}Testing task management endpoints...${NC}"

# Create a new task
echo -e "\n${BLUE}Creating a new task...${NC}"
task_response=$(make_request "POST" "/api/tasks" '{"task":"Test task from API","images":[]}' 201)
task_id=$(echo $task_response | grep -o '"taskId":"[^"]*' | sed 's/"taskId":"//')

if [ -z "$task_id" ]; then
  echo -e "${RED}✗ Failed to extract task ID from response${NC}"
  exit 1
else
  echo -e "${GREEN}✓ Created task with ID: ${task_id}${NC}"
fi

# Get task history
echo -e "\n${BLUE}Getting task history...${NC}"
make_request "GET" "/api/tasks" "" 200

# Get specific task
echo -e "\n${BLUE}Getting specific task...${NC}"
make_request "GET" "/api/tasks/${task_id}" "" 200

# Export task
echo -e "\n${BLUE}Exporting task...${NC}"
make_request "GET" "/api/tasks/${task_id}/export" "" 200

# Cancel task
echo -e "\n${BLUE}Cancelling task...${NC}"
make_request "POST" "/api/tasks/${task_id}/cancel" "" 200

# Test webview management endpoints
echo -e "\n${YELLOW}Testing webview management endpoints...${NC}"

# Get state
echo -e "\n${BLUE}Getting state...${NC}"
make_request "GET" "/api/state" "" 200

# Post message to webview
echo -e "\n${BLUE}Posting message to webview...${NC}"
make_request "POST" "/api/webview/message" '{"type":"update","content":"Test message"}' 200

# Test settings management endpoints
echo -e "\n${YELLOW}Testing settings management endpoints...${NC}"

# Update API configuration
echo -e "\n${BLUE}Updating API configuration...${NC}"
make_request "PUT" "/api/settings/api" '{"model":"claude-3-opus-20240229"}' 200

# Update custom instructions
echo -e "\n${BLUE}Updating custom instructions...${NC}"
make_request "PUT" "/api/settings/customInstructions" '{"instructions":"Test instructions"}' 200

# Update auto approval settings
echo -e "\n${BLUE}Updating auto approval settings...${NC}"
make_request "PUT" "/api/settings/autoApproval" '{"autoApproveAll":false}' 200

# Update browser settings
echo -e "\n${BLUE}Updating browser settings...${NC}"
make_request "PUT" "/api/settings/browser" '{"headless":true}' 200

# Update chat settings
echo -e "\n${BLUE}Updating chat settings...${NC}"
make_request "PUT" "/api/settings/chat" '{"mode":"act"}' 200

# Toggle plan/act mode
echo -e "\n${BLUE}Toggling plan/act mode...${NC}"
make_request "PUT" "/api/settings/chat/mode" '{"mode":"plan"}' 200

# Test authentication endpoints
echo -e "\n${YELLOW}Testing authentication endpoints...${NC}"

# Set auth token
echo -e "\n${BLUE}Setting auth token...${NC}"
make_request "POST" "/api/auth/token" '{"token":"test-token-123"}' 200

# Set user info
echo -e "\n${BLUE}Setting user info...${NC}"
make_request "POST" "/api/auth/user" '{"displayName":"Test User","email":"test@example.com","photoURL":"https://example.com/photo.jpg"}' 200

# Sign out
echo -e "\n${BLUE}Signing out...${NC}"
make_request "POST" "/api/auth/signout" "" 200

# Test MCP management endpoints
echo -e "\n${YELLOW}Testing MCP management endpoints...${NC}"

# Get marketplace catalog
echo -e "\n${BLUE}Getting marketplace catalog...${NC}"
make_request "GET" "/api/mcp/marketplace" "" 200

# Test miscellaneous endpoints
echo -e "\n${YELLOW}Testing miscellaneous endpoints...${NC}"

# Subscribe email
echo -e "\n${BLUE}Subscribing email...${NC}"
make_request "POST" "/api/subscribe" '{"email":"test@example.com"}' 200

# Delete the task we created
echo -e "\n${BLUE}Deleting task...${NC}"
make_request "DELETE" "/api/tasks/${task_id}" "" 200

echo -e "\n${GREEN}=== API server test completed successfully! ===${NC}"

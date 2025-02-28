# Docker API Testing

This document describes the testing approach for the Docker API server.

## Overview

The Docker API server provides a RESTful API for interacting with the Cline extension running in a Docker container. The API is used by the frontend to communicate with the Cline extension.

## Docker API Tests

Docker API tests are implemented in the `test-docker-api.js` script. This script tests all endpoints of the Docker API server in a running Docker container, making actual HTTP requests to the API endpoints.

### Test Structure

The Docker API tests verify:

1. **Basic Connectivity and Authentication**
   - API server is running
   - CORS is properly configured
   - Authentication with valid API key
   - Unsupported endpoint

2. **Task Management Endpoints**
   - POST /api/tasks (Create a new task)
   - GET /api/tasks (Get all tasks)
   - GET /api/tasks/:taskId (Get a specific task)
   - POST /api/tasks/:taskId/resume (Resume a task)
   - POST /api/tasks/:taskId/cancel (Cancel a task)
   - DELETE /api/tasks/:taskId (Delete a task)
   - GET /api/tasks/:taskId/export (Export a task)
   - POST /api/tasks/:taskId/response (Send response to Cline)

3. **Webview Management Endpoints**
   - GET /api/state (Get current state)
   - POST /api/webview/message (Post message to webview)

4. **Settings Management Endpoints**
   - PUT /api/settings/api (Update API configuration)
   - PUT /api/settings/customInstructions (Update custom instructions)
   - PUT /api/settings/autoApproval (Update auto-approval settings)
   - PUT /api/settings/browser (Update browser settings)
   - PUT /api/settings/chat (Update chat settings)
   - PUT /api/settings/chat/mode (Toggle plan/act mode)

5. **Authentication Endpoints**
   - POST /api/auth/token (Set authentication token)
   - POST /api/auth/user (Set user information)
   - POST /api/auth/signout (Sign out)

6. **MCP Management Endpoints**
   - GET /api/mcp/marketplace (Get MCP marketplace catalog)
   - POST /api/mcp/download (Download MCP)
   - PUT /api/mcp/servers/:serverName/toggle (Toggle MCP server)
   - PUT /api/mcp/servers/:serverName/tools/:toolName/toggleAutoApprove (Toggle MCP tool auto-approve)
   - POST /api/mcp/servers/:serverName/restart (Restart MCP server)
   - DELETE /api/mcp/servers/:serverName (Delete MCP server)

7. **Miscellaneous Endpoints**
   - POST /api/subscribe (Subscribe with email)

### Running Docker API Tests

To run the Docker API tests:

1. Start the Docker container:
   ```bash
   export CLINE_API_KEY="your-api-key"
   ./run-docker.sh --build --run
   ```

2. Run the tests:
   ```bash
   ./run-docker-api-tests.sh
   ```

### Test Output

The test script provides detailed output with color-coded results:

- **Green**: Passed tests
- **Red**: Failed tests
- **Yellow**: Informational messages
- **Blue**: Test names
- **Cyan**: Section headers

At the end of each test suite, a summary is displayed showing the total number of tests, passed tests, and failed tests.

## Adding New Tests

To add new Docker API tests:

1. Open the `test-docker-api.js` file
2. Add a new test object to the `tests` array
3. Define the test name and test function
4. Use the `makeRequest` function to make HTTP requests to the API
5. Use the `assert` function to verify the response

Example:
```javascript
{
  name: "Test new endpoint",
  test: async () => {
    const response = await makeRequest("/api/new-endpoint", "POST", {
      param: "value"
    });
    assert(response.status === 200, `Expected status 200, got ${response.status}`);
    assert(response.data && response.data.success === true, "Response should indicate success");
  }
}
```

## Troubleshooting

If Docker API tests are failing:

1. Check that the Docker container is running:
   ```bash
   docker-compose ps
   ```

2. Check the container logs:
   ```bash
   docker-compose logs cline-server
   ```

3. Verify that the API server is exposed on port 3000:
   ```bash
   curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/state -H "X-API-Key: your-api-key"
   ```

4. Check if node-fetch is installed:
   ```bash
   npm list node-fetch
   ```

5. If node-fetch is not installed, install it:
   ```bash
   npm install node-fetch
   ```

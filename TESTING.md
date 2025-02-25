# Cline API Testing

This document describes the testing approach for the Cline API server.

## Overview

The Cline API server provides a RESTful API for interacting with the Cline extension. The API is used by the Cline extension's webview and can also be used by external applications.

Testing the API is done at two levels:
1. **Unit Tests**: Testing individual API endpoints in isolation
2. **End-to-End Tests**: Testing the API server as a whole in a running environment

## Unit Tests

Unit tests for the API are located in `src/api/api.test.ts`. These tests use Mocha as the test framework, with Sinon for mocking and the built-in Node.js Assert module for assertions.

### Test Structure

The unit tests are organized by API category:

- **Authentication**: Tests for API key validation
- **Task Management**: Tests for creating, retrieving, updating, and deleting tasks
- **Interaction with Cline**: Tests for sending responses to Cline
- **Webview Management**: Tests for getting state and posting messages to the webview
- **Settings Management**: Tests for updating various settings
- **Authentication**: Tests for authentication-related endpoints
- **MCP Management**: Tests for MCP-related endpoints
- **Miscellaneous**: Tests for other endpoints
- **Error Handling**: Tests for error conditions

### Running Unit Tests

To run the unit tests:

```bash
npm test
```

This will run all tests, including the API tests.

### Mocking Approach

The unit tests use Sinon to mock the following components:

- **vscode.ExtensionContext**: Mocked to provide a controlled environment for testing
- **ClineProvider**: Mocked to isolate the API server from the rest of the extension

This allows testing the API server in isolation without requiring a running VSCode instance.

## End-to-End Tests

End-to-end tests for the API are implemented in the `test-api.sh` script. This script tests the API server in a running Docker container, making actual HTTP requests to the API endpoints.

### Test Structure

The end-to-end tests follow a workflow that exercises all API endpoints:

1. **Setup**: Checks if the Docker container is running and the API server is accessible
2. **Authentication**: Tests API key validation
3. **Task Management**: Creates a task, retrieves task history, gets a specific task, exports a task, and cancels a task
4. **Webview Management**: Gets state and posts a message to the webview
5. **Settings Management**: Updates various settings
6. **Authentication**: Tests authentication-related endpoints
7. **MCP Management**: Tests MCP-related endpoints
8. **Miscellaneous**: Tests other endpoints
9. **Cleanup**: Deletes the task created during testing

### Running End-to-End Tests

To run the end-to-end tests:

1. Start the Docker container:
   ```bash
   export CLINE_API_KEY="your-api-key"
   ./run-docker.sh --build --run
   ```

2. Run the tests:
   ```bash
   ./test-api.sh
   ```

Alternatively, you can use the `--test` flag with `run-docker.sh`:
```bash
./run-docker.sh --test
```

### Test Output

The test script provides detailed output for each test, including:
- The HTTP request being made
- The status code received
- The response body
- Whether the test passed or failed

## Adding New Tests

### Adding Unit Tests

To add new unit tests:

1. Identify the API category for your test
2. Add a new test case to the appropriate describe block in `src/api/api.test.ts`
3. Mock any necessary dependencies using Sinon
4. Make assertions using the Assert module

Example:
```typescript
it("should handle a new endpoint", async function() {
  // Setup mocks
  mockProvider.someMethod.resolves({ result: "success" });
  
  // Make request
  const response = await makeRequest('POST', '/api/new-endpoint', {
    'X-API-Key': 'test-api-key'
  }, { param: "value" });
  
  // Assert results
  assert.strictEqual(response.status, 200);
  assert.ok(mockProvider.someMethod.calledWith({ param: "value" }));
});
```

### Adding End-to-End Tests

To add new end-to-end tests:

1. Identify where in the workflow your test should be added
2. Use the `make_request` function to make an HTTP request to the API endpoint
3. Check the status code and response body

Example:
```bash
# Test new endpoint
echo -e "\n${BLUE}Testing new endpoint...${NC}"
make_request "POST" "/api/new-endpoint" '{"param":"value"}' 200
```

## Troubleshooting

### Unit Tests

If unit tests are failing:

1. Check that all dependencies are installed:
   ```bash
   npm install
   ```

2. Check for TypeScript errors:
   ```bash
   npm run check-types
   ```

3. Run tests with more verbose output:
   ```bash
   npm test -- --verbose
   ```

### End-to-End Tests

If end-to-end tests are failing:

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

4. Run the test script with more verbose output:
   ```bash
   bash -x ./test-api.sh
   ```

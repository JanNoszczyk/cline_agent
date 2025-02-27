# Docker API Server Testing Guide

This guide explains how to test the Docker API server integration with the frontend (now moved to cline-frontend-private).

## Overview

The testing suite consists of three main components:

1. **test-docker-api.js**: Tests the Docker API server directly
2. **test-frontend-api.js**: Tests the frontend integration with the Docker API server
3. **run-api-tests.sh**: A shell script that runs both tests and handles prerequisites

## Prerequisites

- Docker and Docker Compose installed
- Node.js v20+ installed
- The Docker container with the Cline API server running
- The frontend (cline-frontend-private) running (or the script will start it for you)

## Running the Tests

The easiest way to run all tests is to use the provided shell script:

```bash
./run-api-tests.sh
```

This script will:
1. Check if the Docker container is running
2. Verify the API server is accessible
3. Check if the frontend is running (and start it if not)
4. Install required npm packages (node-fetch and puppeteer)
5. Run the Docker API tests
6. Run the frontend integration tests
7. Clean up any processes it started

## Manual Testing

If you prefer to run the tests manually, you can do so with the following commands:

### Testing the Docker API Server

```bash
# Make sure the Docker container is running
docker ps | grep cline-server

# Install node-fetch if not already installed
npm install node-fetch

# Run the Docker API tests
API_URL=http://localhost:3000 API_KEY=test-api-key node test-docker-api.js
```

### Testing the Frontend Integration

```bash
# Make sure the frontend is running
cd ../cline-frontend-private
npm run dev

# In another terminal, install required packages
npm install node-fetch puppeteer

# Run the frontend tests
API_URL=http://localhost:3000 API_KEY=test-api-key FRONTEND_URL=http://localhost:3002 node test-frontend-api.js
```

## Test Details

### Docker API Tests

The Docker API tests verify:

1. API server is running
2. CORS is properly configured
3. Authentication works with valid API key
4. Authentication fails with invalid API key
5. Authentication fails with missing API key
6. Unsupported HTTP methods return 405
7. Unsupported endpoints return 404

### Frontend Integration Tests

The frontend integration tests verify:

1. Frontend loads successfully
2. Frontend connects to the Docker API server
3. Frontend handles API responses correctly
4. Frontend handles mock responses for unsupported endpoints

## Understanding the Results

The test scripts provide detailed output with color-coded results:

- **Green**: Passed tests
- **Red**: Failed tests
- **Yellow**: Informational messages
- **Blue**: Test names
- **Cyan**: Section headers

At the end of each test suite, a summary is displayed showing the total number of tests, passed tests, and failed tests.

## Troubleshooting

### Docker Container Not Running

If the Docker container is not running, start it with:

```bash
./run-docker.sh --run
```

### API Server Not Accessible

If the API server is not accessible, check the Docker logs:

```bash
docker-compose logs
```

### Frontend Not Starting

If the frontend fails to start, check for errors in the cline-frontend-private directory:

```bash
cd ../cline-frontend-private
npm run dev
```

### Package Installation Issues

If you encounter issues with package installation, try installing them manually:

```bash
npm install node-fetch puppeteer
```

## API Server Limitations

The Docker API server currently only supports the `/api/state` endpoint. The frontend has been modified to handle this limitation by:

1. Using mock responses for unsupported endpoints
2. Updating the ExtensionStateContext to handle the simplified API response

This approach allows the frontend to function correctly even with the limited API functionality.

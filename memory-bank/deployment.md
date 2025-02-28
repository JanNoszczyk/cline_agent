# Deployment Guide

This guide documents how to run the Docker container with the Cline API server, deploy the frontend, and connect them together.

## Prerequisites

- Docker and Docker Compose installed
- Git repository cloned

## Running the Docker Container and API Server

### 1. Using the run-docker.sh Script (PREFERRED METHOD)

The repository includes a convenient script that handles building and running the Docker container with the API server:

```bash
# Build and run the Docker container (uses existing image if available)
./run-docker.sh --build --run

# Force build and run the Docker container (always rebuilds)
./run-docker.sh --force-build --run

# Show container logs
./run-docker.sh --logs

# Stop the container
./run-docker.sh --stop

# Restart the container
./run-docker.sh --restart

# Test the API server
./run-docker.sh --test
```

**IMPORTANT: Always use the shell script to run the API server**
- The API server runs automatically inside the Docker container
- The shell script ensures proper configuration and environment setup
- The shell script handles image reuse and caching automatically
- Never run the API server directly with node

### 2. Using Docker Compose Directly (NOT RECOMMENDED FOR NORMAL USE)

You can also use Docker Compose commands directly, but this is not recommended for normal use:

```bash
# Build the Docker container
docker-compose build

# Run the Docker container in the background
docker-compose up -d

# View container logs
docker-compose logs -f

# Stop the container
docker-compose down
```

## Container Services

The Docker container runs two main services:

1. **code-server (VSCode)**: Accessible at http://localhost:8080
   - Web-based VSCode instance with the Cline extension installed
   - No authentication required (configured with `--auth none`)
   - The Cline extension is pre-configured with the API key

2. **API Server**: Accessible at http://localhost:3000
   - JavaScript HTTP server that provides an API for the Cline extension
   - Runs as part of the VSCode server in the same container
   - Started automatically by the entrypoint.sh script before code-server
   - Requires API key authentication via the `X-API-Key` header
   - Default API key is `test-api-key` (configured in docker-compose.yml)
   - Currently only supports the `/api/state` endpoint

## Testing the API Server

You can test the API server using the included test-api.sh script:

```bash
./test-api.sh
```

This script performs a series of tests to verify that the API server is working correctly:
- Checks if the container is running
- Tests API server connection
- Verifies authentication with valid and invalid API keys
- Tests various API endpoints

### Manual Testing

You can also test the API server manually using curl:

```bash
# Test with valid API key
curl -X GET -H "X-API-Key: test-api-key" http://localhost:3000/api/state

# Test with invalid API key
curl -X GET -H "X-API-Key: invalid-key" http://localhost:3000/api/state
```

A successful response with a valid API key looks like:
```json
{"status": "ok"}
```

An unauthorized response with an invalid API key looks like:
```json
{"message": "Unauthorized: Invalid or missing API key."}
```

## Running the Frontend

The frontend (now moved to cline-frontend-private) is a React application that connects to the Docker API server. Here's how to run it:

### Prerequisites

- Node.js v20+ installed
- Docker container with API server running

### Steps to Run the Frontend

1. Navigate to the cline-frontend-private directory:
   ```bash
   cd ../cline-frontend-private
   ```

2. Install dependencies (if not already installed):
   ```bash
   npm install
   ```

3. Configure the frontend to connect to the Docker API server by updating the `.env` file:
   ```
   VITE_API_URL=http://localhost:3000
   VITE_API_KEY=test-api-key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Access the frontend in your browser:
   - The frontend will be available at http://localhost:3002 (or another port if 3002 is in use)
   - You should see the chat interface with a welcome message

### Verifying the Connection

To verify that the frontend is connected to the Docker API server:

1. Check the browser console for the message "Successfully connected to Docker API server"
2. Try typing a message in the chat interface to test the UI responsiveness

## Accessing the Web Interfaces

- **code-server (VSCode)**: Accessible at http://localhost:8080
  - This provides a full VSCode experience in the browser with the Cline extension pre-installed and configured

- **Frontend (cline-frontend-private)**: Accessible at http://localhost:3002 (or another port if 3002 is in use)
  - This provides a web-based chat interface that connects to the Docker API server

## Environment Variables

The Docker container uses the following environment variables:

- `CLINE_API_KEY`: API key for authentication (default: `test-api-key`)

You can modify these variables in the docker-compose.yml file or set them in your environment before running the container.

## Connecting the Frontend to the Docker API Server

The frontend needs to be configured to connect to the Docker API server. Here's the process:

1. **Update Environment Variables**:
   - Edit the `.env` file in the cline-frontend-private directory:
     ```
     VITE_API_URL=http://localhost:3000
     VITE_API_KEY=test-api-key
     ```
   - The `VITE_API_URL` should point to the Docker API server
   - The `VITE_API_KEY` should match the API key configured in docker-compose.yml

2. **Handle Limited API Functionality**:
   - The Docker API server currently only supports the `/api/state` endpoint
   - The frontend has been modified to handle this limitation by:
     - Using mock responses for unsupported endpoints
     - Updating the ExtensionStateContext to work with the limited API response

3. **Testing the Connection**:
   - Start both the Docker container and the frontend
   - Open the frontend in a browser
   - Check the console logs for "Successfully connected to Docker API server"
   - Verify the UI is responsive and working correctly

## Troubleshooting

### Docker Build Issues

If you encounter network connectivity issues during the Docker build process, refer to the DOCKER_NETWORK_TROUBLESHOOTING.md file for solutions.

Common issues include:
- Network connectivity problems during package downloads
- Long build times
- Failures when installing Node.js

The Dockerfile includes retry logic and alternative mirrors to improve build reliability, but you may need to adjust these settings based on your network environment.

### API Server Issues

If the API server is not responding:

1. Check if the container is running:
   ```bash
   docker ps
   ```

2. Check the container logs:
   ```bash
   docker-compose logs
   ```

3. Verify that the API server is listening on port 3000:
   ```bash
   docker exec -it cline_agent-cline-server-1 ps aux | grep api_server
   ```

4. Ensure the API key matches the one configured in docker-compose.yml

### Frontend Issues

If the frontend is not connecting to the Docker API server:

1. Verify the Docker API server is running and accessible:
   ```bash
   curl -X GET -H "X-API-Key: test-api-key" http://localhost:3000/api/state
   ```

2. Check the `.env` file in the cline-frontend-private directory:
   - Ensure `VITE_API_URL` is set to `http://localhost:3000`
   - Ensure `VITE_API_KEY` matches the API key in docker-compose.yml

3. Check the browser console for error messages

4. Restart the frontend development server:
   ```bash
   cd ../cline-frontend-private
   npm run dev
   ```

## Complete Deployment Process

Here's the complete process to deploy both the Docker API server and the frontend:

1. **Start the Docker Container**:
   ```bash
   ./run-docker.sh --build --run
   ```
   or
   ```bash
   docker-compose up -d
   ```

2. **Verify the API Server**:
   ```bash
   curl -X GET -H "X-API-Key: test-api-key" http://localhost:3000/api/state
   ```
   Expected response: `{"status":"ok"}`

3. **Start the Frontend**:
   ```bash
   cd ../cline-frontend-private
   npm install  # Only needed first time or when dependencies change
   npm run dev
   ```

4. **Access the Interfaces**:
   - Docker API Server: http://localhost:3000/api/state (requires API key)
   - code-server (VSCode): http://localhost:8080
   - Frontend (cline-frontend-private): http://localhost:3002 (or another port if 3002 is in use)

## Stopping and Restarting the System

### Stopping the System

1. **Stop the Frontend**:
   If running in a terminal, press `Ctrl+C` to stop the development server.
   
   Alternatively, you can kill all frontend instances with:
   ```bash
   pkill -f "npm run dev"
   ```

2. **Stop the Docker Container**:
   ```bash
   ./run-docker.sh --stop
   ```
   or
   ```bash
   docker-compose down
   ```

### Restarting the System

1. **Restart the Docker Container**:
   ```bash
   ./run-docker.sh --restart
   ```
   This will:
   - Check if the container is already running
   - Try to connect to the API server if the container is running
   - Restart the container if it's running but not responding
   - Start a new container if none is running

2. **Restart the Frontend**:
   ```bash
   cd ../cline-frontend-private
   npm run dev
   ```

## Rebuilding the Docker Container

The repository includes two scripts for rebuilding the Docker container, with a strong emphasis on reusing existing resources whenever possible:

1. **rebuild-docker-improved.sh** (Recommended Optimized Rebuild):
   - Intelligently preserves existing images and containers
   - Reuses Docker layers to significantly speed up the build process
   - Gracefully stops running containers before rebuilding
   - Preserves cached dependencies and build artifacts
   - Provides an option to start the container after rebuilding
   - **This should be your default choice for rebuilding**

2. **rebuild-docker.sh** (Complete Rebuild - Use Only When Necessary):
   - Stops any running Docker builds
   - Removes previous containers and images
   - Builds the Docker container from scratch with `--no-cache`
   - Use this only when you need a complete rebuild or when troubleshooting persistent issues

To use the recommended optimized rebuild script:
```bash
./rebuild-docker-improved.sh
```

### Docker Caching Mechanisms

The Dockerfile implements several caching strategies to optimize build times:

1. **NPM Dependency Caching**:
   - Uses Docker's mount cache for npm dependencies
   - Preserves node_modules between builds
   - Significantly reduces time spent downloading packages

2. **APT Package Caching**:
   - Caches apt packages to avoid repeated downloads
   - Uses alternative Debian mirrors for better connectivity
   - Implements retry logic for resilient package installation

3. **Multi-stage Builds**:
   - Separates build stages to optimize layer caching
   - Only rebuilds stages that have changed
   - Minimizes the final image size

These caching mechanisms work together with the rebuild scripts to ensure the fastest possible build times while maintaining reliability.

## Production Deployment Considerations

For production deployments, consider the following:

1. **Security**:
   - Change the default API key to a strong, unique value
   - Enable authentication for code-server
   - Use HTTPS for all connections
   - Implement proper network security (firewalls, VPNs, etc.)

2. **Persistence**:
   - Configure persistent storage for user workspaces
   - Implement backup and recovery procedures

3. **Scaling**:
   - Use container orchestration (Kubernetes, Docker Swarm) for multi-user deployments
   - Implement load balancing for high-traffic scenarios

4. **Monitoring**:
   - Set up logging and monitoring
   - Implement health checks and automatic recovery

5. **Frontend Deployment**:
   - Build the frontend for production:
     ```bash
     cd ../cline-frontend-private
     npm run build
     ```
   - Serve the built files using a web server like Nginx or Apache
   - Configure the production environment variables for the API server connection

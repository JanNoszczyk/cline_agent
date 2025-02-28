# Deployment Guide

This guide documents how to run the Docker container with the Cline API server.

## Prerequisites

- Docker and Docker Compose installed
- Git repository cloned

## Running the Docker Container and API Server

### Using the run-docker.sh Script

The repository includes a convenient script that handles building and running the Docker container with the API server:

```bash
# Build and run the Docker container
./run-docker.sh --build --run

# Show container logs
./run-docker.sh --logs

# Stop the container
./run-docker.sh --stop

# Test the API server
./run-docker.sh --test
```

### Using Docker Compose Directly

You can also use Docker Compose commands directly:

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

## Testing the API Server

You can test the API server using curl:

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

## Environment Variables

The Docker container uses the following environment variables:

- `CLINE_API_KEY`: API key for authentication (default: `test-api-key`)

You can modify these variables in the docker-compose.yml file or set them in your environment before running the container.

## Troubleshooting

### Docker Build Issues

If you encounter network connectivity issues during the Docker build process:

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

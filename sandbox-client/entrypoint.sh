#!/bin/bash
set -e

# This is the entrypoint script for the sandbox container

# Define PIDs globally for cleanup
VSCODE_SERVER_PID=""
GO_CLIENT_PID=""
# ACTIVATION_KEEPER_PID="" # Activation keeper is disabled

# Function to handle cleanup on exit
cleanup() {
    echo "Shutting down services..."
    if [ -n "$VSCODE_SERVER_PID" ]; then
        echo "Stopping OpenVSCode Server (PID ${VSCODE_SERVER_PID})..."
        kill $VSCODE_SERVER_PID 2>/dev/null || true
    fi
    if [ -n "$GO_CLIENT_PID" ]; then
        echo "Stopping Go Client (PID ${GO_CLIENT_PID})..."
        kill $GO_CLIENT_PID 2>/dev/null || true
    fi
    # if [ -n "$ACTIVATION_KEEPER_PID" ]; then # Activation keeper is disabled
    #     echo "Stopping Activation Keeper (PID ${ACTIVATION_KEEPER_PID})..."
    #     kill $ACTIVATION_KEEPER_PID 2>/dev/null || true
    # fi
    exit 0
}

# Set up trap for cleanup
trap cleanup SIGTERM SIGINT

echo "Starting container with:"
echo "- User ID: ${USER_ID}"
echo "- API Key Available: $(if [ -n "${ANTHROPIC_API_KEY}" ]; then echo "Yes"; else echo "No"; fi)"
echo "- Cline gRPC Port: ${CLINE_GRPC_PORT:-"(default 50051)"}" # Display configured/default gRPC port

# Define the fixed internal port for VS Code Server
VSCODE_INTERNAL_PORT=3000
VSCODE_SERVER_URL="http://localhost:${VSCODE_INTERNAL_PORT}"

# Check if extension is already installed (using wildcard for version)
EXTENSION_DIR_PATTERN="/home/openvscode-server/.openvscode-server/extensions/saoudrizwan.claude-dev-*"
INSTALL_CMD=""
if ! ls ${EXTENSION_DIR_PATTERN} 1> /dev/null 2>&1; then
  echo "Cline extension not found. Installing from /tmp/claude-dev.vsix..."
  INSTALL_CMD="--install-extension /tmp/claude-dev.vsix"
else
  echo "Cline extension already installed. Skipping installation."
fi

# Start the VS Code Server in the background
echo "Starting OpenVSCode Server on port ${VSCODE_INTERNAL_PORT}..."
/home/.openvscode-server/bin/openvscode-server \
  ${INSTALL_CMD} \
  --start-server \
  --host 0.0.0.0 \
  --port ${VSCODE_INTERNAL_PORT} \
  --extensions-dir /home/openvscode-server/.openvscode-server/extensions \
  --without-connection-token \
  --log=info & # Changed log level to info and removed verbose
VSCODE_SERVER_PID=$!
echo "OpenVSCode Server started with PID ${VSCODE_SERVER_PID}, logs will go to container stdout/stderr"

# Wait for VS Code Server port 3000 to be listening
echo "Waiting for OpenVSCode Server to listen on port ${VSCODE_INTERNAL_PORT}..."
while ! nc -z localhost ${VSCODE_INTERNAL_PORT}; do
  sleep 0.1
done
echo "OpenVSCode Server is listening on port ${VSCODE_INTERNAL_PORT}."

# Wait for the HOST's gRPC server port to be available
# Use CLINE_GRPC_HOST env var (set in docker-compose), fallback to host.docker.internal
GRPC_HOST=${CLINE_GRPC_HOST:-host.docker.internal}
GRPC_PORT=${CLINE_GRPC_PORT:-50051} # Use default if env var not set
WAIT_TIMEOUT=120 # Maximum seconds to wait for gRPC port (Increased from 60)
WAIT_INTERVAL=1 # Seconds between checks
SECONDS_WAITED=0

echo "Waiting up to ${WAIT_TIMEOUT}s for Cline gRPC server at ${GRPC_HOST}:${GRPC_PORT}..."
while ! nc -z ${GRPC_HOST} ${GRPC_PORT} 2>/dev/null; do
  if [ ${SECONDS_WAITED} -ge ${WAIT_TIMEOUT} ]; then
    echo "Error: Timed out waiting for gRPC server at ${GRPC_HOST}:${GRPC_PORT} after ${WAIT_TIMEOUT} seconds." >&2
    # Exit if the gRPC server doesn't become available
    exit 1
  fi
  sleep ${WAIT_INTERVAL}
  SECONDS_WAITED=$((SECONDS_WAITED + WAIT_INTERVAL))
  echo "Waited ${SECONDS_WAITED}s..."
done
echo "Cline gRPC server detected at ${GRPC_HOST}:${GRPC_PORT}."

# Define and export the global browser path (needed if Playwright is used by tools)
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
echo "Setting PLAYWRIGHT_BROWSERS_PATH to ${PLAYWRIGHT_BROWSERS_PATH}"

# Activation keeper script remains disabled/commented out

# Now start the Go sandbox client binary (gRPC version) in the background
# It reads CLINE_GRPC_PORT from the environment (set by Docker/runtime)
# Check RUN_TEST environment variable to decide whether to pass the -test flag
if [ "$RUN_TEST" = "true" ]; then
  echo "Starting Go gRPC sandbox client (/final-app/sandbox-binary) in TEST mode..."
  /final-app/sandbox-binary -test &
else
  echo "Starting Go gRPC sandbox client (/final-app/sandbox-binary) in default mode..."
  /final-app/sandbox-binary &
fi
GO_CLIENT_PID=$!
echo "Go client started with PID ${GO_CLIENT_PID}"

# Keep the container running by waiting for the primary VS Code server process
echo "Container setup complete. Monitoring background processes (VSCode Server: ${VSCODE_SERVER_PID}, Go Client: ${GO_CLIENT_PID})..."
# Wait specifically for the VS Code server process to exit. The Go client finishing should not stop the container.
# This will keep the script running in the foreground until VSCode Server stops.
wait $VSCODE_SERVER_PID
EXIT_CODE=$?
echo "VSCode Server process (PID ${VSCODE_SERVER_PID}) exited with code ${EXIT_CODE}. Initiating shutdown..."

# Call cleanup explicitly when the wait finishes (VS Code server exited)
cleanup

# Exit the script with the VS Code server's exit code
exit ${EXIT_CODE}

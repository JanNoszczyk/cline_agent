#!/bin/bash
set -e

# This is the entrypoint script for the sandbox container

# Define PIDs globally for cleanup
VSCODE_SERVER_PID=""
GO_CLIENT_PID=""
# ACTIVATION_KEEPER_PID="" # Activation keeper is disabled

# Define log file paths
LOG_DIR="/app/logs"
VSCODE_LOG_FILE="${LOG_DIR}/vscode_server.log"
GO_CLIENT_LOG_FILE="${LOG_DIR}/go_client.log"

# Ensure log directory exists
mkdir -p ${LOG_DIR}

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
  --user-data-dir /home/openvscode-server/.openvscode-server/data \
  --without-connection-token \
  --log=info \
  --default-folder=/home/workspace \
  > "${VSCODE_LOG_FILE}" 2>&1 &
VSCODE_SERVER_PID=$!
echo "OpenVSCode Server started with PID ${VSCODE_SERVER_PID}, logs will go to ${VSCODE_LOG_FILE}"

# Wait for VS Code Server port 3000 to be listening
echo "Waiting for OpenVSCode Server to listen on port ${VSCODE_INTERNAL_PORT}..."
while ! nc -z localhost ${VSCODE_INTERNAL_PORT}; do
  sleep 0.1
done
echo "OpenVSCode Server is listening on port ${VSCODE_INTERNAL_PORT}."

# Wait for the CONTAINER's gRPC server port to be available
GRPC_HOST="localhost" # Target is now localhost within the container
GRPC_PORT=${CLINE_GRPC_PORT:-50051} # Use port from env var or default
WAIT_TIMEOUT=120 # Increased timeout to 120 seconds
WAIT_INTERVAL=1 # Seconds between checks
SECONDS_WAITED=0

echo "Waiting up to ${WAIT_TIMEOUT}s for Cline gRPC server at ${GRPC_HOST}:${GRPC_PORT} (within container)..."
while ! nc -z ${GRPC_HOST} ${GRPC_PORT} 2>/dev/null; do
  if [ ${SECONDS_WAITED} -ge ${WAIT_TIMEOUT} ]; then
    echo "Error: Timed out waiting for gRPC server at ${GRPC_HOST}:${GRPC_PORT} (within container) after ${WAIT_TIMEOUT} seconds." >&2
    # Attempt to print gRPC server logs before exiting due to timeout
    PRIMARY_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT="/home/openvscode-server/.openvscode-server/data/User/globalStorage/saoudrizwan.claude-dev/grpc_server_debug.log"
    FALLBACK_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT="/tmp/grpc_server_debug.log"
    echo "Attempting to display gRPC server debug log on timeout..."
    if [ -f "${PRIMARY_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT}" ]; then
        echo "--- Contents of ${PRIMARY_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT} (on timeout) ---"
        cat "${PRIMARY_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT}"
        echo "--- End of ${PRIMARY_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT} (on timeout) ---"
    elif [ -f "${FALLBACK_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT}" ]; then
        echo "--- Contents of ${FALLBACK_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT} (on timeout) ---"
        cat "${FALLBACK_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT}"
        echo "--- End of ${FALLBACK_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT} (on timeout) ---"
    else
        echo "No gRPC debug log file found at either primary or fallback path during timeout."
        echo "Primary path checked: ${PRIMARY_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT}"
        echo "Fallback path checked: ${FALLBACK_GRPC_DEBUG_LOG_PATH_ON_TIMEOUT}"
        echo "Listing contents of /home/openvscode-server/.openvscode-server/data/User/globalStorage/ (if it exists):"
        ls -la /home/openvscode-server/.openvscode-server/data/User/globalStorage/ || echo "Could not list globalStorage or it does not exist."
        echo "Listing contents of /tmp/:"
        ls -la /tmp/ || echo "Could not list /tmp."
    fi
    exit 1 # Explicitly exit with error code
  fi
  sleep ${WAIT_INTERVAL}
  SECONDS_WAITED=$((SECONDS_WAITED + WAIT_INTERVAL))
  echo "Waited ${SECONDS_WAITED}s for intra-container gRPC server..."
done
echo "Cline gRPC server detected at ${GRPC_HOST}:${GRPC_PORT} (within container)."

# Add a short delay to allow the gRPC server within the extension to fully initialize
echo "Waiting 3 seconds for gRPC server internal initialization..."
sleep 3

echo "Attempting to display gRPC server debug log..."
PRIMARY_GRPC_DEBUG_LOG_PATH="/home/openvscode-server/.openvscode-server/data/User/globalStorage/saoudrizwan.claude-dev/grpc_server_debug.log"
FALLBACK_GRPC_DEBUG_LOG_PATH="/tmp/grpc_server_debug.log"

GRPC_DEBUG_LOG_PATH_TO_CAT=""

if [ -f "${PRIMARY_GRPC_DEBUG_LOG_PATH}" ]; then
    echo "Primary gRPC debug log file found at ${PRIMARY_GRPC_DEBUG_LOG_PATH}."
    GRPC_DEBUG_LOG_PATH_TO_CAT="${PRIMARY_GRPC_DEBUG_LOG_PATH}"
elif [ -f "${FALLBACK_GRPC_DEBUG_LOG_PATH}" ]; then
    echo "Fallback gRPC debug log file found at ${FALLBACK_GRPC_DEBUG_LOG_PATH}."
    GRPC_DEBUG_LOG_PATH_TO_CAT="${FALLBACK_GRPC_DEBUG_LOG_PATH}"
else
    echo "Neither primary nor fallback gRPC debug log file found."
    echo "Primary path checked: ${PRIMARY_GRPC_DEBUG_LOG_PATH}"
    echo "Fallback path checked: ${FALLBACK_GRPC_DEBUG_LOG_PATH}"
    # Attempt to list globalStorage to help debug path issues
    echo "Listing contents of /home/openvscode-server/.openvscode-server/data/User/globalStorage/ (if it exists):"
    ls -la /home/openvscode-server/.openvscode-server/data/User/globalStorage/ || echo "Could not list globalStorage or it does not exist."
    echo "Listing contents of /tmp/:"
    ls -la /tmp/ || echo "Could not list /tmp."
fi

if [ -n "${GRPC_DEBUG_LOG_PATH_TO_CAT}" ]; then
    echo "--- Contents of ${GRPC_DEBUG_LOG_PATH_TO_CAT} ---"
    cat "${GRPC_DEBUG_LOG_PATH_TO_CAT}"
    echo "--- End of ${GRPC_DEBUG_LOG_PATH_TO_CAT} ---"
fi

# --- TEMPORARY sleep removed, nc check restored ---

# Define and export the global browser path (needed if Playwright is used by tools)
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
echo "Setting PLAYWRIGHT_BROWSERS_PATH to ${PLAYWRIGHT_BROWSERS_PATH}"

# Activation keeper script remains disabled/commented out

# Now start the Go sandbox client binary (gRPC version)
# It reads CLINE_GRPC_PORT from the environment (set by Docker/runtime)
# Force TEST mode execution based on user feedback
if true; then # <<< Force this condition to always be true
  echo "Starting Go gRPC sandbox client (/final-app/sandbox-binary) in TEST mode (background for debugging)..."
  # Run in background to allow script to continue to 'wait $VSCODE_SERVER_PID'
  # Redirect Go client output to its log file
  /final-app/sandbox-binary -test > "${GO_CLIENT_LOG_FILE}" 2>&1 &
else
  # This block will now never be reached
  echo "Starting Go gRPC sandbox client (/final-app/sandbox-binary) in default mode..."
  /final-app/sandbox-binary > "${GO_CLIENT_LOG_FILE}" 2>&1 &
fi
GO_CLIENT_PID=$! # This will be the PID of the backgrounded Go client
echo "Go client started in background with PID ${GO_CLIENT_PID}, logs will go to ${GO_CLIENT_LOG_FILE}"

# Keep the container running by waiting for the primary VS Code server process
echo "Container setup complete. Monitoring background processes (VSCode Server: ${VSCODE_SERVER_PID}, Go Client: ${GO_CLIENT_PID}). Logs are in ${LOG_DIR}/"
# Wait specifically for the VS Code server process to exit.
# This will keep the script running in the foreground until VSCode Server stops.
wait $VSCODE_SERVER_PID
EXIT_CODE=$?
echo "VSCode Server process (PID ${VSCODE_SERVER_PID}) exited with code ${EXIT_CODE}. Initiating shutdown..."

# Call cleanup explicitly when the wait finishes (VS Code server exited)
# Also attempt to display log file in cleanup
echo "Attempting to display gRPC server debug log during cleanup..."
if [ -f "${PRIMARY_GRPC_DEBUG_LOG_PATH}" ]; then
    echo "--- Contents of ${PRIMARY_GRPC_DEBUG_LOG_PATH} (during cleanup) ---"
    cat "${PRIMARY_GRPC_DEBUG_LOG_PATH}"
    echo "--- End of ${PRIMARY_GRPC_DEBUG_LOG_PATH} (during cleanup) ---"
elif [ -f "${FALLBACK_GRPC_DEBUG_LOG_PATH}" ]; then
    echo "--- Contents of ${FALLBACK_GRPC_DEBUG_LOG_PATH} (during cleanup) ---"
    cat "${FALLBACK_GRPC_DEBUG_LOG_PATH}"
    echo "--- End of ${FALLBACK_GRPC_DEBUG_LOG_PATH} (during cleanup) ---"
else
    echo "No gRPC debug log file found at either primary or fallback path during cleanup."
fi
cleanup

# Exit the script with the VS Code server's exit code
exit ${EXIT_CODE}

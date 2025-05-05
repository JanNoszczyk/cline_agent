#!/bin/bash
set -e

# Set the timezone for all processes in this container to Europe/Warsaw
export TZ="Europe/Warsaw"
echo "Timezone set to $(date)"

# Define PIDs globally for cleanup
VSCODE_SERVER_PID=""
PUPPETEER_SCRIPT_PID=""
GO_CLIENT_PHASE1_PID=""
GO_CLIENT_PHASE2_PID=""

# Define log file paths
LOG_DIR="/app/logs"
OTHER_LOGS_SUBDIR="other_logs"
VSCODE_LOG_FILE="${LOG_DIR}/${OTHER_LOGS_SUBDIR}/vscode_server.log"
PUPPETEER_LOG_FILE="${LOG_DIR}/puppeteer_script.log"
GO_CLIENT_LOG_FILE_PHASE1="${LOG_DIR}/go_client_phase1.log"
GO_CLIENT_LOG_FILE_PHASE2="${LOG_DIR}/go_client_phase2.log"
GRPC_SERVER_DEBUG_LOG_FILE_IN_APP_LOGS="${LOG_DIR}/grpc_server_debug.log"

# Ensure log directories exist
mkdir -p ${LOG_DIR}
mkdir -p "${LOG_DIR}/${OTHER_LOGS_SUBDIR}"

# Explicitly remove and recreate the gRPC debug log file
echo "Ensuring ${GRPC_SERVER_DEBUG_LOG_FILE_IN_APP_LOGS} is a writable file..."
rm -rf "${GRPC_SERVER_DEBUG_LOG_FILE_IN_APP_LOGS}"
touch "${GRPC_SERVER_DEBUG_LOG_FILE_IN_APP_LOGS}"
chmod 666 "${GRPC_SERVER_DEBUG_LOG_FILE_IN_APP_LOGS}"
echo "${GRPC_SERVER_DEBUG_LOG_FILE_IN_APP_LOGS} ensured."

# Function to stop a specific PID
stop_pid() {
    local pid_to_kill=$1
    local process_name=$2
    if [ -n "$pid_to_kill" ]; then
        echo "Stopping ${process_name} (PID ${pid_to_kill})..."
        kill $pid_to_kill 2>/dev/null || true
        # Wait a bit for graceful shutdown
        for i in $(seq 1 3); do
            if ! ps -p $pid_to_kill > /dev/null; then
                echo "${process_name} (PID ${pid_to_kill}) exited."
                return
            fi
            sleep 1
        done
        echo "${process_name} (PID ${pid_to_kill}) did not exit gracefully, sending SIGKILL..."
        kill -9 $pid_to_kill 2>/dev/null || true
    fi
}

# Function to handle cleanup on exit
cleanup() {
    echo "Final cleanup: Shutting down any remaining services..."
    stop_pid "$VSCODE_SERVER_PID" "OpenVSCode Server"
    VSCODE_SERVER_PID=""
    stop_pid "$PUPPETEER_SCRIPT_PID" "Puppeteer Script"
    PUPPETEER_SCRIPT_PID=""
    stop_pid "$GO_CLIENT_PHASE1_PID" "Go Client (Phase 1)"
    GO_CLIENT_PHASE1_PID=""
    stop_pid "$GO_CLIENT_PHASE2_PID" "Go Client (Phase 2)"
    GO_CLIENT_PHASE2_PID=""
    # exit 0 # Let the script exit with the code from Phase 2
}
trap cleanup SIGTERM SIGINT

export GRPC_SERVER_DEBUG_LOG_PATH="${GRPC_SERVER_DEBUG_LOG_FILE_IN_APP_LOGS}"
echo "GRPC_SERVER_DEBUG_LOG_PATH set to ${GRPC_SERVER_DEBUG_LOG_PATH}"

VSCODE_INTERNAL_PORT=3000
GRPC_HOST="localhost"
GRPC_PORT=${CLINE_GRPC_PORT:-50051}

# --- PHASE 1: Automated Setup & Initial Task ---
echo "--- STARTING PHASE 1: Automated Setup & Initial Task ---"

# Check if extension is already installed
EXTENSION_DIR_PATTERN="/home/openvscode-server/.openvscode-server/extensions/saoudrizwan.claude-dev-*"
INSTALL_CMD=""
if ! ls ${EXTENSION_DIR_PATTERN} 1> /dev/null 2>&1; then
  echo "Cline extension not found. Installing from /tmp/claude-dev.vsix..."
  INSTALL_CMD="--install-extension /tmp/claude-dev.vsix"
else
  echo "Cline extension already installed."
fi

# Start the VS Code Server (headless)
echo "Starting OpenVSCode Server (Headless) on port ${VSCODE_INTERNAL_PORT}..."
/home/.openvscode-server/bin/openvscode-server \
  ${INSTALL_CMD} \
  --start-server --host 0.0.0.0 --port ${VSCODE_INTERNAL_PORT} \
  --extensions-dir /home/openvscode-server/.openvscode-server/extensions \
  --user-data-dir /home/openvscode-server/.openvscode-server/data \
  --without-connection-token --log=debug --default-folder=/home/workspace \
  > "${VSCODE_LOG_FILE}" 2>&1 &
VSCODE_SERVER_PID=$!
echo "OpenVSCode Server (Headless) started with PID ${VSCODE_SERVER_PID}, logs: ${VSCODE_LOG_FILE}"

echo "Waiting for OpenVSCode Server (Headless) to listen on port ${VSCODE_INTERNAL_PORT}..."
while ! nc -z localhost ${VSCODE_INTERNAL_PORT}; do sleep 0.1; done
echo "OpenVSCode Server (Headless) is listening."

# Start Puppeteer script
export PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers
echo "Starting Puppeteer script (/final-app/puppeteer_vscode_run.js)..."
node /final-app/puppeteer_vscode_run.js > "${PUPPETEER_LOG_FILE}" 2>&1 &
PUPPETEER_SCRIPT_PID=$!
echo "Puppeteer script started with PID ${PUPPETEER_SCRIPT_PID}, logs: ${PUPPETEER_LOG_FILE}"
sleep 2 # Check if it started
if ! ps -p $PUPPETEER_SCRIPT_PID > /dev/null; then
    echo "ERROR: Puppeteer script failed to start or exited immediately. Check ${PUPPETEER_LOG_FILE}"
    PUPPETEER_SCRIPT_PID=""
    # exit 1 # Consider this fatal for Phase 1
fi

if [ -n "$PUPPETEER_SCRIPT_PID" ]; then
    echo "Waiting 15s for Puppeteer to initialize VSCode..."
    sleep 15
else
    echo "Skipping 15s wait as Puppeteer script did not start correctly."
fi

# Wait for Cline gRPC server from headless VSCode
echo "Waiting up to 120s for Cline gRPC server (Phase 1) at ${GRPC_HOST}:${GRPC_PORT}..."
SECONDS_WAITED=0
WAIT_TIMEOUT=120
while ! nc -z ${GRPC_HOST} ${GRPC_PORT} 2>/dev/null; do
  if [ ${SECONDS_WAITED} -ge ${WAIT_TIMEOUT} ]; then
    echo "Error: Timed out waiting for gRPC server (Phase 1). Check logs." >&2
    cat "${VSCODE_LOG_FILE}" || true
    cat "${PUPPETEER_LOG_FILE}" || true
    cat "${GRPC_SERVER_DEBUG_LOG_FILE_IN_APP_LOGS}" || true
    exit 1
  fi
  sleep 1; SECONDS_WAITED=$((SECONDS_WAITED + 1))
  echo "Waited ${SECONDS_WAITED}s for gRPC server (Phase 1)..."
done
echo "Cline gRPC server (Phase 1) detected. Waiting 3s for full init..."
sleep 3

# Start Go client for Phase 1
echo "Starting Go client for Phase 1 (Initial Tasks)..."
# Assuming Go client takes an argument like -phase1 or similar
# For now, we'll use -test as a placeholder for the initial run.
# This needs to be coordinated with Go client changes.
/final-app/sandbox-binary -test -phase phase1 2>&1 | tee "${GO_CLIENT_LOG_FILE_PHASE1}" &
GO_CLIENT_PHASE1_PID=$!
echo "Go client (Phase 1) started with PID ${GO_CLIENT_PHASE1_PID}, logs: ${GO_CLIENT_LOG_FILE_PHASE1}"

wait $GO_CLIENT_PHASE1_PID
PHASE1_EXIT_CODE=$?
echo "Go client (Phase 1) exited with code ${PHASE1_EXIT_CODE}."
GO_CLIENT_PHASE1_PID="" # Clear PID

if [ $PHASE1_EXIT_CODE -ne 0 ]; then
    echo "Error: Go client (Phase 1) failed with exit code ${PHASE1_EXIT_CODE}. Aborting."
    cat "${GO_CLIENT_LOG_FILE_PHASE1}"
    cleanup
    exit $PHASE1_EXIT_CODE
fi
echo "--- PHASE 1 COMPLETED SUCCESSFULLY ---"

# --- TRANSITION: Stop automated environment, prompt user ---
echo "--- STARTING TRANSITION TO PHASE 2 ---"
echo "Stopping Puppeteer script (PID ${PUPPETEER_SCRIPT_PID})..."
stop_pid "$PUPPETEER_SCRIPT_PID" "Puppeteer Script"
PUPPETEER_SCRIPT_PID=""

# echo "Stopping OpenVSCode Server (Headless) (PID ${VSCODE_SERVER_PID})..." # Keep server running for Phase 2
# stop_pid "$VSCODE_SERVER_PID" "OpenVSCode Server (Headless)"
# VSCODE_SERVER_PID="" # Keep PID if server is running, though cleanup trap should handle it

echo ""
echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
echo "!! ACTION REQUIRED !!"
echo "!! Phase 1 (automated setup and initial task) is complete."
echo "!! The OpenVSCode Server inside Docker (and Cline within it) is STILL RUNNING."
echo "!!"
echo "!! TO TAKE MANUAL CONTROL:"
echo "!! 1. Open your web browser and navigate to: http://localhost:3003"
echo "!! 2. You will see the VS Code interface with Cline already loaded"
echo "!! 3. The gRPC server is already running and ready at localhost:50051"
echo "!!"
echo "!! IMPORTANT: DO NOT start a new VS Code Server instance!"
echo "!! Use the existing one at http://localhost:3003"
echo "!!"
echo "!! Phase 2 will test task resumption via gRPC against this running server."
echo "!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!"
read -p "Press Enter to continue to Phase 2 (Task Resumption Test against Dockerized VSCode)..."
echo ""

# --- PHASE 2: Task Resumption against Dockerized VSCode ---
echo "--- STARTING PHASE 2: Task Resumption against Dockerized VSCode ---"

# The OpenVSCode server from Phase 1 is still running.
# The gRPC server in that Cline instance should be available on ${GRPC_HOST}:${GRPC_PORT}.
# We need to ensure it's still responsive.

echo "Verifying Cline gRPC server (Phase 2 - Dockerized VSCode) at ${GRPC_HOST}:${GRPC_PORT}..."
SECONDS_WAITED=0
WAIT_TIMEOUT_PHASE2=120 # Can be adjusted
while ! nc -z ${GRPC_HOST} ${GRPC_PORT} 2>/dev/null; do
  if [ ${SECONDS_WAITED} -ge ${WAIT_TIMEOUT_PHASE2} ]; then
    echo "Error: Timed out waiting for gRPC server (Phase 2 - Dockerized VSCode)." >&2
    echo "Please ensure the Dockerized OpenVSCode server from Phase 1 is still running with Cline active and its gRPC server on port ${GRPC_PORT}."
    cat "${VSCODE_LOG_FILE}" || true
    cat "${PUPPETEER_LOG_FILE}" || true # Puppeteer logs might be relevant if server init depended on it
    cat "${GRPC_SERVER_DEBUG_LOG_FILE_IN_APP_LOGS}" || true
    cleanup 
    exit 1
  fi
  sleep 1; SECONDS_WAITED=$((SECONDS_WAITED + 1))
  echo "Waited ${SECONDS_WAITED}s for gRPC server (Phase 2 - Dockerized VSCode)..."
done
echo "Cline gRPC server (Phase 2 - Dockerized VSCode) detected. Waiting 3s for full init..."
sleep 3

# Start Go client for Phase 2
echo "Starting Go client for Phase 2 (Task Resumption)..."
# Assuming Go client takes an argument like -phase2 or similar
# This needs to be coordinated with Go client changes.
/final-app/sandbox-binary -test -phase phase2 2>&1 | tee "${GO_CLIENT_LOG_FILE_PHASE2}" &
GO_CLIENT_PHASE2_PID=$!
echo "Go client (Phase 2) started with PID ${GO_CLIENT_PHASE2_PID}, logs: ${GO_CLIENT_LOG_FILE_PHASE2}"

wait $GO_CLIENT_PHASE2_PID
PHASE2_EXIT_CODE=$?
echo "Go client (Phase 2) exited with code ${PHASE2_EXIT_CODE}."
GO_CLIENT_PHASE2_PID="" # Clear PID

if [ $PHASE2_EXIT_CODE -ne 0 ]; then
    echo "Error: Go client (Phase 2) failed with exit code ${PHASE2_EXIT_CODE}."
    cat "${GO_CLIENT_LOG_FILE_PHASE2}"
fi
echo "--- PHASE 2 COMPLETED ---"

# Final cleanup (most PIDs should be clear already)
cleanup

echo "E2E Test for Manual Handoff Finished. Exit code: ${PHASE2_EXIT_CODE}"
exit ${PHASE2_EXIT_CODE}

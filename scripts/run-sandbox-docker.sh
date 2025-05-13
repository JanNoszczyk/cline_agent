#!/bin/bash

# Ensure the run_logs directory exists
mkdir -p run_logs

# Define log files globally so the trap function can access them
COMPOSE_LOG_FILE="run_logs/docker_compose_output.log"
SANDBOX_CONTAINER_LOG_FILE="run_logs/sandbox_container_stdout_stderr.log"
DOCKER_COMPOSE_PID_FILE="run_logs/docker_compose.pid" # To store PID of backgrounded compose

# Function to fetch docker compose logs, aggregate all logs, and stop services
# This will be called on exit (normal or interrupted)
cleanup_and_aggregate_all_logs() {
  echo "--- TRAP: Starting cleanup and log aggregation ---"

  # Fetch Docker Compose logs first
  echo "Fetching logs from Docker Compose (all services) on exit..."
  if docker compose logs --no-log-prefix --tail="all" > "$COMPOSE_LOG_FILE" 2>&1; then
    echo "All Docker Compose service logs saved to $COMPOSE_LOG_FILE"
  else
    echo "Warning: Failed to fetch logs from Docker Compose on exit."
  fi

  echo "Fetching full logs from sandbox-client container specifically on exit..."
  if docker compose logs --no-log-prefix --tail="all" sandbox-client > "$SANDBOX_CONTAINER_LOG_FILE" 2>&1; then
    echo "Full sandbox-client container logs saved to $SANDBOX_CONTAINER_LOG_FILE"
  else
    echo "Warning: Failed to fetch logs from sandbox-client container on exit."
  fi

  # Aggregate all logs in run_logs/
  echo "Attempting to aggregate individual logs on exit..."
  # if [ -f "scripts/aggregate_run_logs.sh" ]; then
  #   bash scripts/aggregate_run_logs.sh
  # else
  #   echo "Warning: scripts/aggregate_run_logs.sh not found. Skipping aggregation on exit."
  # fi
  echo "Log aggregation step has been removed as per user request."

  # Stop and remove Docker Compose services
  echo "Stopping Docker Compose services (if any are running)..."
  docker compose down --remove-orphans
  echo "Docker Compose services stopped."

  # Clean up PID file
  if [ -f "$DOCKER_COMPOSE_PID_FILE" ]; then
    rm -f "$DOCKER_COMPOSE_PID_FILE"
  fi

  echo "--- TRAP: Cleanup and log aggregation finished ---"
}

# Trap SIGINT, SIGTERM, and EXIT to run the cleanup and aggregation.
# For SIGINT/SIGTERM, we explicitly exit after the trap function.
trap 'cleanup_and_aggregate_all_logs; echo "Exiting due to signal."; exit' SIGINT SIGTERM
# For normal EXIT (e.g., end of script or explicit 'exit' command), just run cleanup.
trap cleanup_and_aggregate_all_logs EXIT

# Clear previous composite log files if they exist at the start of the script
> "$COMPOSE_LOG_FILE"
> "$SANDBOX_CONTAINER_LOG_FILE"

echo "Starting Docker Compose for sandbox-client in the background..."
echo "Docker Compose output will be streamed to the terminal."
# Individual logs (vscode_server.log, grpc_server_debug.log, etc.) will be in run_logs/ as copied by the container's entrypoint.

# Build the sandbox-client service first, passing the dynamic CACHEBUST argument to ensure Go binary is rebuilt.
echo "Building sandbox-client service with cache bust..."
docker compose build --build-arg CACHEBUST=$(date +%s) sandbox-client
BUILD_EXIT_CODE=$?

if [ $BUILD_EXIT_CODE -ne 0 ]; then
  echo "Error: Docker Compose build failed with exit code $BUILD_EXIT_CODE."
  # The trap will handle cleanup, so we can exit here.
  exit $BUILD_EXIT_CODE
fi

echo "Build complete. Starting Docker Compose for sandbox-client in the background..."
# Run docker compose up in the background.
# The --abort-on-container-exit flag will cause 'docker compose up' to stop all containers if any container was stopped.
# No need for --build here as we've just built it.
docker compose up --abort-on-container-exit sandbox-client &
DOCKER_COMPOSE_PID=$!
echo "$DOCKER_COMPOSE_PID" > "$DOCKER_COMPOSE_PID_FILE" # Store PID
echo "Docker Compose running in background with PID $DOCKER_COMPOSE_PID. Waiting for completion..."

# Wait for the background Docker Compose process
# This allows the script to be the primary recipient of Ctrl+C
wait $DOCKER_COMPOSE_PID
DOCKER_COMPOSE_EXIT_CODE=$? # Capture the exit code of 'docker compose up'

if [ $DOCKER_COMPOSE_EXIT_CODE -eq 0 ]; then
  echo "Docker Compose process completed successfully."
else
  echo "Docker Compose process exited with an error (Code: $DOCKER_COMPOSE_EXIT_CODE)."
fi

# Log fetching, aggregation, and docker compose down are now handled by the trap function 'cleanup_and_aggregate_all_logs' on EXIT.
# The script will now exit, triggering the trap.
echo "Script main execution finished. Trap will handle final log processing and cleanup."
echo "Key log files to check:"
echo "- $COMPOSE_LOG_FILE (All service logs from Docker Compose)"
echo "- $SANDBOX_CONTAINER_LOG_FILE (Full stdout/stderr from sandbox-client container)"
echo "- run_logs/vscode_server.log (VSCode server logs from within container)"
echo "- run_logs/grpc_server_debug.log (gRPC server specific debug logs from within container)"
echo "- run_logs/puppeteer_script.log (Puppeteer script logs from within container)"
echo "- run_logs/go_client.log (Go client logs from within container, if it ran)"

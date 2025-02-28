#!/bin/bash

# Run API Server Script
# This script runs the consolidated API server

# Set default port or use the provided port
PORT=${1:-3000}

# Set API key (can be overridden with environment variable)
if [ -z "$CLINE_API_KEY" ]; then
  export CLINE_API_KEY="default-dev-key"
  echo "Using default API key: $CLINE_API_KEY"
else
  echo "Using provided API key from environment"
fi

# Make the API server executable
chmod +x api_server.js

# Run the API server
echo "Starting API server on port $PORT..."
PORT=$PORT node api_server.js

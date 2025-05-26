#!/bin/bash

# Build script for Cline with proto submodule support

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Cline Build Script with Submodule Support ==="

# Function to check if proto is a submodule
is_proto_submodule() {
    if [ -f "$PROJECT_ROOT/.gitmodules" ] && grep -q "proto" "$PROJECT_ROOT/.gitmodules"; then
        return 0
    else
        return 1
    fi
}

# Step 1: Update proto submodule if needed
if is_proto_submodule; then
    echo "Updating proto submodule..."
    cd "$PROJECT_ROOT"
    git submodule update --init --recursive
else
    echo "Proto is not a submodule, using local proto directory"
fi

# Step 2: Build proto files
echo "Building proto files..."
cd "$PROJECT_ROOT/proto"
if [ -f "package.json" ]; then
    npm install
    npm run build
else
    echo "Warning: No package.json found in proto directory"
fi

# Step 3: Build main extension
echo "Building Cline extension..."
cd "$PROJECT_ROOT"
npm run install:all
npm run compile

# Step 4: Package extension (optional)
if [ "$1" == "--package" ]; then
    echo "Packaging extension..."
    npm run package
fi

echo "=== Build completed successfully ==="

# Step 5: Build adapter if present
if [ -d "$PROJECT_ROOT/cline-grpc-adapter" ]; then
    echo "Building Cline gRPC adapter..."
    cd "$PROJECT_ROOT/cline-grpc-adapter"
    
    # Generate Go code from proto files
    echo "Generating Go code from proto files..."
    mkdir -p genproto
    cd "$PROJECT_ROOT/proto"
    protoc --go_out="$PROJECT_ROOT/cline-grpc-adapter/genproto" \
           --go-grpc_out="$PROJECT_ROOT/cline-grpc-adapter/genproto" \
           --go_opt=paths=source_relative \
           --go-grpc_opt=paths=source_relative \
           *.proto
    
    # Build Go module
    cd "$PROJECT_ROOT/cline-grpc-adapter"
    go mod tidy
    go build ./...
    
    echo "Adapter build completed"
fi
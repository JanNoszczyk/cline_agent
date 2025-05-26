#!/bin/bash

# Development environment setup script for modular Cline structure

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Setting up Cline Development Environment ==="

# Function to prompt user
prompt_yes_no() {
    local prompt="$1"
    local default="${2:-n}"
    
    if [ "$default" = "y" ]; then
        prompt="$prompt [Y/n]: "
    else
        prompt="$prompt [y/N]: "
    fi
    
    read -p "$prompt" response
    response="${response:-$default}"
    
    [[ "$response" =~ ^[Yy]$ ]]
}

# Step 1: Check if we're setting up for public or private development
echo "This repository can be configured for:"
echo "1. Public development (Cline fork only)"
echo "2. Private development (with testing framework)"
read -p "Select configuration [1/2]: " config_choice

# Step 2: Set up proto as submodule if needed
if [ ! -d "$PROJECT_ROOT/proto/.git" ]; then
    if prompt_yes_no "Set up proto as a git submodule?" "y"; then
        read -p "Enter proto repository URL: " proto_url
        if [ -n "$proto_url" ]; then
            cd "$PROJECT_ROOT"
            
            # Remove existing proto directory if it exists
            if [ -d "proto" ]; then
                echo "Backing up existing proto directory..."
                mv proto proto.backup.$(date +%Y%m%d_%H%M%S)
            fi
            
            # Add as submodule
            git submodule add "$proto_url" proto
            git submodule update --init --recursive
            
            echo "Proto submodule added successfully"
        fi
    fi
fi

# Step 3: Set up private components for private development
if [ "$config_choice" = "2" ]; then
    echo "Setting up private development environment..."
    
    # Create private directory structure
    mkdir -p "$PROJECT_ROOT/../cline-private-tests"
    
    # Create example private test
    cat > "$PROJECT_ROOT/../cline-private-tests/example_test.go" << 'EOF'
package main

import (
    "context"
    "log"
    
    adapter "github.com/your-org/cline-grpc-adapter"
    framework "github.com/your-org/grpc-testing-framework"
    "google.golang.org/grpc"
)

type ExampleClineTests struct {
    // Your test implementation
}

func (t *ExampleClineTests) GetTestName() string {
    return "Example Cline Tests"
}

func (t *ExampleClineTests) Setup(conn *grpc.ClientConn) error {
    // Initialize your gRPC clients here
    return nil
}

func (t *ExampleClineTests) RunTests(ctx context.Context) error {
    // Implement your test scenarios
    return nil
}

func (t *ExampleClineTests) Cleanup() error {
    return nil
}

func main() {
    config := adapter.NewClineConfig(
        "../cline_agent/cline.vsix",
        50051,
        "./test-workspace",
    )
    
    fw := framework.NewTestFramework(config)
    fw.EnableDebugMode(true)
    
    result, err := fw.Run(&ExampleClineTests{})
    if err != nil {
        log.Fatalf("Test execution failed: %v", err)
    }
    
    if result.Success {
        log.Println("All tests passed!")
    } else {
        log.Fatalf("Tests failed: %v", result.Error)
    }
}
EOF
    
    echo "Private test structure created at: $PROJECT_ROOT/../cline-private-tests"
fi

# Step 4: Update .gitignore
echo "Updating .gitignore..."
cat >> "$PROJECT_ROOT/.gitignore" << 'EOF'

# Private components (if not already ignored)
sandbox-client/
grpc-testing-framework/
*-private/
*.backup.*

# Local development
.env.local
.vscode/settings.json

# Proto submodule build artifacts
proto/node_modules/
proto/dist/
proto/*.js
proto/*.d.ts
cline-grpc-adapter/genproto/
EOF

# Step 5: Install dependencies
echo "Installing dependencies..."
cd "$PROJECT_ROOT"
npm run install:all

# Step 6: Initial build
if prompt_yes_no "Run initial build?" "y"; then
    "$SCRIPT_DIR/build-with-submodules.sh"
fi

echo "=== Development environment setup complete ==="
echo ""
echo "Next steps:"
echo "1. Configure your proto submodule remote (if using submodules)"
echo "2. Run './scripts/build-with-submodules.sh' to build the project"
echo "3. For private development, implement your tests in the private directory"
echo ""
echo "For more information, see the documentation in each component's README"
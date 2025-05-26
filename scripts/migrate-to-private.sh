#!/bin/bash

# Script to help migrate proto-shared and sandbox-client to private repository

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Cline Private Repository Migration Script ==="
echo ""
echo "This script will help you move proto-shared and sandbox-client"
echo "to your private repository while setting up the proper structure."
echo ""

# Get private repository path
read -p "Enter the path to your private repository: " PRIVATE_REPO
PRIVATE_REPO=$(eval echo "$PRIVATE_REPO")  # Expand ~ if used

if [ ! -d "$PRIVATE_REPO" ]; then
    echo "Error: Directory '$PRIVATE_REPO' does not exist."
    exit 1
fi

if [ ! -d "$PRIVATE_REPO/.git" ]; then
    echo "Error: '$PRIVATE_REPO' is not a git repository."
    exit 1
fi

echo ""
echo "Will migrate to: $PRIVATE_REPO"
echo ""

# Check what needs to be migrated
MIGRATE_PROTO=false
MIGRATE_SANDBOX=false

if [ -d "$PUBLIC_ROOT/proto-shared" ]; then
    echo "✓ Found proto-shared/ to migrate"
    MIGRATE_PROTO=true
else
    echo "✗ proto-shared/ not found (may already be migrated)"
fi

if [ -d "$PUBLIC_ROOT/sandbox-client" ]; then
    echo "✓ Found sandbox-client/ to migrate"
    MIGRATE_SANDBOX=true
else
    echo "✗ sandbox-client/ not found (may already be migrated)"
fi

if [ "$MIGRATE_PROTO" = false ] && [ "$MIGRATE_SANDBOX" = false ]; then
    echo ""
    echo "Nothing to migrate. Both directories already moved or not found."
    exit 0
fi

echo ""
read -p "Continue with migration? [y/N]: " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Migration cancelled."
    exit 0
fi

# Perform migration
cd "$PRIVATE_REPO"

# Migrate proto-shared
if [ "$MIGRATE_PROTO" = true ]; then
    echo ""
    echo "Migrating proto-shared..."
    cp -r "$PUBLIC_ROOT/proto-shared" .
    
    # Update proto-shared README for private context
    cat > proto-shared/README.md << 'EOF'
# Cline gRPC Proto Definitions (Private)

This directory contains the Protocol Buffer definitions for the Cline gRPC interface.

## Overview

These proto files define the gRPC services and messages used for remote control of the Cline VS Code extension.

## Usage

### In this repository (sandbox-client)
The sandbox-client uses these definitions directly:
```bash
cd sandbox-client
protoc --go_out=genproto --go-grpc_out=genproto -I../proto-shared ../proto-shared/*.proto
```

### In Cline public fork
These definitions are accessed via git submodule.

## Building TypeScript definitions
```bash
npm install
npm run build
```

## Building Go definitions
See sandbox-client build scripts.
EOF
    
    git add proto-shared/
    git commit -m "Add Cline proto definitions from public fork"
    echo "✓ proto-shared migrated successfully"
fi

# Migrate sandbox-client
if [ "$MIGRATE_SANDBOX" = true ]; then
    echo ""
    echo "Migrating sandbox-client..."
    cp -r "$PUBLIC_ROOT/sandbox-client" .
    
    # Update imports to use local proto-shared
    if [ -f "sandbox-client/grpc_client_test_logic.go" ]; then
        echo "Updating Go imports to use local proto-shared..."
        # This is a simplified example - you may need to adjust paths
        sed -i.bak 's|sandboxclient/genproto|./genproto|g' sandbox-client/*.go
        rm sandbox-client/*.go.bak
    fi
    
    git add sandbox-client/
    git commit -m "Add Cline sandbox-client from public fork"
    echo "✓ sandbox-client migrated successfully"
fi

# Create private build script
echo ""
echo "Creating private build script..."
mkdir -p scripts

cat > scripts/build-cline-tests.sh << 'EOF'
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIVATE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Allow override of Cline location
CLINE_ROOT="${CLINE_ROOT:-$PRIVATE_ROOT/../cline_agent}"

echo "=== Building Cline Tests ==="
echo "Private repo: $PRIVATE_ROOT"
echo "Cline fork: $CLINE_ROOT"

# Build proto
cd "$PRIVATE_ROOT/proto-shared"
npm install
npm run build

# Generate Go code
cd "$PRIVATE_ROOT/sandbox-client"
mkdir -p genproto
protoc --go_out=genproto --go-grpc_out=genproto \
       --go_opt=paths=source_relative \
       --go-grpc_opt=paths=source_relative \
       -I../proto-shared \
       ../proto-shared/*.proto

# Build Go client
go mod tidy
go build .

echo "=== Build complete ==="
EOF

chmod +x scripts/build-cline-tests.sh

git add scripts/build-cline-tests.sh
git commit -m "Add Cline test build script"

echo ""
echo "=== Migration Complete! ==="
echo ""
echo "Next steps:"
echo ""
echo "1. In your private repository ($PRIVATE_REPO):"
echo "   - Review and test the migrated code"
echo "   - Run: ./scripts/build-cline-tests.sh"
echo ""
echo "2. In the public Cline fork:"
echo "   - Remove the migrated directories:"
echo "     rm -rf proto-shared sandbox-client"
echo ""
echo "   - Set up proto as a submodule:"
echo "     git submodule add $PRIVATE_REPO proto-submodule"
echo "     ln -s proto-submodule/proto-shared proto"
echo ""
echo "   - Or use sparse-checkout (see PRIVATE_PROTO_SETUP.md)"
echo ""
echo "3. Update your .gitignore in the public fork"
echo ""
echo "For detailed instructions, see PRIVATE_PROTO_SETUP.md"
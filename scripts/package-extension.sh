#!/bin/bash

# Script to package the Cline extension with modular structure support

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Get the current version from package.json
VERSION=$(node -p "require('$PROJECT_ROOT/package.json').version")
EXPECTED_VSIX="claude-dev-${VERSION}.vsix"

echo "=== Packaging Cline Extension v${VERSION} ==="

# Step 1: Check if proto is available (either local or submodule)
if [ ! -d "$PROJECT_ROOT/proto" ]; then
    echo "Error: proto directory not found. Please set up proto files first."
    exit 1
fi

# Step 2: Build Protocol Buffer files
echo "Building Protocol Buffer files..."
cd "$PROJECT_ROOT/proto"
if [ -f "build-proto.js" ]; then
    node build-proto.js
    if [ $? -ne 0 ]; then
        echo "Error: Protocol Buffer generation failed."
        exit 1
    fi
else
    echo "Warning: build-proto.js not found, skipping proto generation"
fi

# Step 3: Compile the extension
echo "Compiling extension..."
cd "$PROJECT_ROOT"
rm -rf dist/
npm run package
if [ $? -ne 0 ]; then
    echo "Error: Extension compilation failed."
    exit 1
fi

# Step 4: Package with vsce
echo "Packaging with vsce..."
if ! command -v vsce &> /dev/null; then
    echo "Error: 'vsce' command not found. Please install it globally: npm install -g @vscode/vsce"
    exit 1
fi

vsce package --allow-star-activation

# Step 5: Verify VSIX was created
if [ ! -f "$PROJECT_ROOT/$EXPECTED_VSIX" ]; then
    echo "Error: Expected VSIX file '${EXPECTED_VSIX}' not found."
    exit 1
fi

echo "=== Successfully created ${EXPECTED_VSIX} ==="

# Step 6: Handle destination based on arguments
if [ "$1" == "--copy-to" ] && [ -n "$2" ]; then
    DEST_DIR="$2"
    if [ ! -d "$DEST_DIR" ]; then
        echo "Creating destination directory: $DEST_DIR"
        mkdir -p "$DEST_DIR"
    fi
    
    DEST_FILE="$DEST_DIR/cline-extension.vsix"
    echo "Copying to: $DEST_FILE"
    cp "$PROJECT_ROOT/$EXPECTED_VSIX" "$DEST_FILE"
    
    # Create VSIX contents log if destination is writable
    if [ -w "$DEST_DIR" ]; then
        echo "Creating VSIX contents log..."
        vsce ls --tree > "$DEST_DIR/vsix-contents-tree.log" 2>/dev/null || true
    fi
elif [ "$1" == "--sandbox" ]; then
    # Legacy support for sandbox-client
    if [ -d "$PROJECT_ROOT/sandbox-client" ]; then
        echo "Warning: Using legacy sandbox-client directory"
        cp "$PROJECT_ROOT/$EXPECTED_VSIX" "$PROJECT_ROOT/sandbox-client/cline-extension.vsix"
        vsce ls --tree > "$PROJECT_ROOT/sandbox-client/vsix-contents-tree.log" 2>/dev/null || true
    else
        echo "Error: sandbox-client directory not found"
        exit 1
    fi
fi

echo ""
echo "Package created: $EXPECTED_VSIX"
echo "To copy to a specific location, use: $0 --copy-to <destination-directory>"
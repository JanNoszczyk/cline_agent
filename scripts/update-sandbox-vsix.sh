#!/bin/bash

# Script to package the Cline extension using vsce and copy it to the sandbox-client directory.

# Exit immediately if a command exits with a non-zero status.
set -e

# Get the current version from package.json
VERSION=$(node -p "require('./package.json').version")
EXPECTED_VSIX="claude-dev-${VERSION}.vsix"
SANDBOX_DEST="sandbox-client/cline-extension.vsix"

echo "Packaging extension version ${VERSION} using vsce..."

# Check if vsce is installed
if ! command -v vsce &> /dev/null
then
    echo "Error: 'vsce' command not found. Please install it globally: npm install -g @vscode/vsce"
    exit 1
fi

# Run vsce package
vsce package

# Check if the expected VSIX file was created
if [ ! -f "$EXPECTED_VSIX" ]; then
    echo "Error: Expected VSIX file '${EXPECTED_VSIX}' not found after running 'vsce package'."
    exit 1
fi

echo "Copying '${EXPECTED_VSIX}' to '${SANDBOX_DEST}'..."

# Copy the generated vsix file to the sandbox directory
cp "$EXPECTED_VSIX" "$SANDBOX_DEST"

echo "Successfully packaged and copied extension to sandbox."
echo "Remember to run 'npm run compile' before this script if you made code changes,"
echo "and 'docker-compose up --build -d' afterwards to update the sandbox container."

#!/bin/bash

# Script to package the Cline extension using vsce and copy it to the sandbox-client directory.

# Exit immediately if a command exits with a non-zero status.
set -e

# Get the current version from package.json
VERSION=$(node -p "require('./package.json').version")
EXPECTED_VSIX="claude-dev-${VERSION}.vsix"
SANDBOX_DEST="sandbox-client/cline-extension.vsix"

echo "Building Protocol Buffer files..."
# Ensure Node.js is available and execute the proto build script
if command -v node &> /dev/null; then
    node ./proto/build-proto.js
    if [ $? -ne 0 ]; then
        echo "Error: Protocol Buffer generation failed."
        exit 1
    fi
else
    echo "Error: Node.js is not installed or not in PATH. Cannot build .proto files."
    exit 1
fi

echo "Packaging extension version ${VERSION} using vsce..."

# Check if vsce is installed
if ! command -v vsce &> /dev/null
then
    echo "Error: 'vsce' command not found. Please install it globally: npm install -g @vscode/vsce"
    exit 1
fi

# Ensure dist is clean and then compile the extension
echo "Ensuring 'dist' directory is clean and compiling extension..."
rm -rf dist/
# Use the 'package' script from package.json which includes esbuild for production
npm run package
if [ $? -ne 0 ]; then
    echo "Error: 'npm run package' (compilation) failed."
    exit 1
fi
echo "Extension compiled successfully."

# Run vsce package
echo "Packaging with vsce..."
vsce package --allow-star-activation

# Check if the expected VSIX file was created
if [ ! -f "$EXPECTED_VSIX" ]; then
    echo "Error: Expected VSIX file '${EXPECTED_VSIX}' not found after running 'vsce package'."
    exit 1
fi
echo "VSIX '${EXPECTED_VSIX}' created successfully."

echo "Listing VSIX contents to sandbox-client/vsix-contents-tree.log..."
vsce ls --tree > sandbox-client/vsix-contents-tree.log
if [ $? -ne 0 ]; then
    echo "Warning: 'vsce ls --tree' failed. VSIX contents log will not be available."
fi

echo "Copying '${EXPECTED_VSIX}' to '${SANDBOX_DEST}'..."

# Copy the generated vsix file to the sandbox directory
cp "$EXPECTED_VSIX" "$SANDBOX_DEST"

echo "Successfully packaged and copied extension to sandbox."
echo "This script now includes .proto file generation."
echo "Remember to run 'npm run compile' (for main extension code) and 'npm run build' in 'webview-ui' (for webview changes) before this script if you made code changes,"
echo "and 'docker-compose up --build -d' afterwards to update the sandbox container."

#!/bin/bash

# Simple migration script - only moves sandbox-client to private repo

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PUBLIC_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== Simple Cline Migration Script ==="
echo ""
echo "This script moves only sandbox-client to your private repository."
echo "Proto definitions remain public in this fork."
echo ""

# Check if sandbox-client exists
if [ ! -d "$PUBLIC_ROOT/sandbox-client" ]; then
    echo "Error: sandbox-client/ not found. May already be migrated."
    exit 1
fi

# Get private repository path
read -p "Enter the path to your private repository: " PRIVATE_REPO
PRIVATE_REPO=$(eval echo "$PRIVATE_REPO")  # Expand ~ if used

if [ ! -d "$PRIVATE_REPO" ]; then
    echo "Error: Directory '$PRIVATE_REPO' does not exist."
    exit 1
fi

echo ""
echo "Will move sandbox-client to: $PRIVATE_REPO"
read -p "Continue? [y/N]: " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Migration cancelled."
    exit 0
fi

# Move sandbox-client
echo "Moving sandbox-client..."
mv "$PUBLIC_ROOT/sandbox-client" "$PRIVATE_REPO/"

# Create build script in private repo
echo "Creating build script..."
mkdir -p "$PRIVATE_REPO/scripts"

cat > "$PRIVATE_REPO/scripts/build-tests.sh" << 'EOF'
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIVATE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# Path to public Cline fork (can be overridden)
CLINE_ROOT="${CLINE_ROOT:-$PRIVATE_ROOT/../cline_agent}"

if [ ! -d "$CLINE_ROOT" ]; then
    echo "Error: Cline fork not found at: $CLINE_ROOT"
    echo "Set CLINE_ROOT environment variable to correct path"
    exit 1
fi

echo "=== Building Cline Tests ==="
echo "Using Cline at: $CLINE_ROOT"

# Generate Go proto code from public proto
echo "Generating Go proto code..."
cd "$PRIVATE_ROOT/sandbox-client"
mkdir -p genproto

# Clean old generated files
rm -rf genproto/*

# Generate new files
protoc --go_out=genproto --go-grpc_out=genproto \
       --go_opt=paths=source_relative \
       --go-grpc_opt=paths=source_relative \
       -I"$CLINE_ROOT/proto-shared" \
       "$CLINE_ROOT/proto-shared"/*.proto

# Build Go client
echo "Building test client..."
go mod tidy
go build .

echo "=== Build complete ==="
EOF

chmod +x "$PRIVATE_REPO/scripts/build-tests.sh"

# Create README in private repo
cat > "$PRIVATE_REPO/sandbox-client/README.md" << 'EOF'
# Cline Sandbox Client

Private test implementation for Cline VS Code extension.

## Setup

1. Ensure you have the public Cline fork cloned nearby:
   ```bash
   git clone <cline-fork-url> ../cline_agent
   ```

2. Build the test client:
   ```bash
   ../scripts/build-tests.sh
   ```

## Running Tests

```bash
# With Docker
docker-compose up --build

# Or directly
./main -test
```

## Configuration

Set `CLINE_ROOT` environment variable if Cline fork is not at `../cline_agent`:

```bash
export CLINE_ROOT=/path/to/cline_agent
../scripts/build-tests.sh
```
EOF

# Create symlink in public fork for compatibility
echo "Creating proto symlink for compatibility..."
cd "$PUBLIC_ROOT"
if [ ! -e "proto" ]; then
    ln -sf proto-shared proto
    echo "Created symlink: proto -> proto-shared"
fi

echo ""
echo "=== Migration Complete! ==="
echo ""
echo "Next steps:"
echo ""
echo "1. Commit changes in private repository:"
echo "   cd $PRIVATE_REPO"
echo "   git add sandbox-client/ scripts/"
echo "   git commit -m 'Add Cline sandbox client from public fork'"
echo ""
echo "2. Update this public fork:"
echo "   git add -u"
echo "   git commit -m 'Move sandbox-client to private repository'"
echo ""
echo "3. Build and test in private repository:"
echo "   cd $PRIVATE_REPO"
echo "   ./scripts/build-tests.sh"
echo ""
echo "Proto definitions remain public in: $PUBLIC_ROOT/proto-shared/"
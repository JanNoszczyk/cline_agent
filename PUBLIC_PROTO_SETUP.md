# Public Proto Setup Guide

This guide explains the simplified architecture where proto definitions remain in the public Cline fork.

## Architecture Overview

### Public Cline Fork (this repository)
```
cline_agent/
├── proto-shared/           # gRPC interface definitions (PUBLIC)
│   ├── *.proto            # All proto files
│   ├── build-proto.js     # Build script
│   ├── package.json       # Node dependencies
│   └── README.md          # Documentation
├── proto/                  # Symlink to proto-shared for compatibility
├── src/                    # Extension source code
├── grpc-testing-framework/ # Generic testing framework
├── cline-grpc-adapter/     # Cline-specific adapter
└── scripts/                # Build scripts
```

### Private Repository (your backend)
```
your-private-backend/
├── sandbox-client/         # Cline test implementation
│   ├── main.go
│   ├── grpc_client_test_logic.go
│   ├── Dockerfile
│   └── go.mod
├── your-other-services/    # Other backend services
└── scripts/
    └── build-tests.sh
```

## Benefits of This Approach

1. **Simplicity**: No submodule configuration needed
2. **Transparency**: Interface is public, only implementation is private
3. **Collaboration**: Others can see and potentially use the gRPC interface
4. **Easy Setup**: Clone public repo and you have everything except tests

## Setup Instructions

### 1. Set up Proto in Public Fork

The proto-shared directory is already set up. To use it:

```bash
# Create symlink for compatibility
cd cline_agent
ln -sf proto-shared proto

# Build proto files
cd proto-shared
npm install
npm run build
```

### 2. Move Only sandbox-client to Private Repository

```bash
# In your private repository
mv /path/to/cline_agent/sandbox-client .

# Update imports to reference public proto
# In go.mod:
# replace github.com/your-org/cline-fork => ../path/to/cline_agent

git add sandbox-client/
git commit -m "Add Cline sandbox test client"
```

### 3. Create Build Script in Private Repository

`your-private-backend/scripts/build-tests.sh`:

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIVATE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLINE_ROOT="${CLINE_ROOT:-$PRIVATE_ROOT/../cline_agent}"

echo "=== Building Cline Tests ==="

# Step 1: Build Cline extension if needed
if [ "$1" == "--build-extension" ]; then
    echo "Building Cline extension..."
    cd "$CLINE_ROOT"
    ./scripts/build-with-submodules.sh --package
    cp *.vsix "$PRIVATE_ROOT/sandbox-client/"
fi

# Step 2: Generate Go proto code from public proto
echo "Generating Go proto code..."
cd "$PRIVATE_ROOT/sandbox-client"
mkdir -p genproto
protoc --go_out=genproto --go-grpc_out=genproto \
       -I"$CLINE_ROOT/proto-shared" \
       "$CLINE_ROOT/proto-shared"/*.proto

# Step 3: Build Go test client
echo "Building test client..."
go mod tidy
go build .

echo "=== Build complete ==="
```

### 4. Configure Go Module in Private Repository

In `sandbox-client/go.mod`:

```go
module github.com/your-org/private-backend/sandbox-client

go 1.19

require (
    google.golang.org/grpc v1.56.0
    google.golang.org/protobuf v1.30.0
)

// Reference the public adapter if needed
replace github.com/your-org/cline-grpc-adapter => ../../cline_agent/cline-grpc-adapter
```

## Development Workflow

### Daily Development

1. **Update Proto Definitions** (Public Fork):
   ```bash
   cd cline_agent/proto-shared
   # Edit .proto files
   npm run build
   git commit -am "Update proto definitions"
   git push
   ```

2. **Update Test Implementation** (Private Repo):
   ```bash
   cd your-private-backend
   # Pull latest proto changes
   cd ../cline_agent && git pull
   
   # Rebuild with new proto
   cd ../your-private-backend
   ./scripts/build-tests.sh
   ```

3. **Run Tests** (Private Repo):
   ```bash
   cd sandbox-client
   docker-compose up --build
   ```

## Example Directory Structure

```
workspace/
├── cline_agent/            # Public fork (cloned)
│   ├── proto-shared/       # Proto definitions (PUBLIC)
│   ├── src/                # Extension code
│   └── ...
└── my-private-backend/     # Private repository
    ├── sandbox-client/     # Test implementation (PRIVATE)
    └── ...
```

## Migration from Current State

Since you already have proto-shared in the public fork:

1. **Just move sandbox-client**:
   ```bash
   mv sandbox-client ../my-private-backend/
   ```

2. **Update .gitignore** (already done)

3. **Create symlink for compatibility**:
   ```bash
   ln -sf proto-shared proto
   ```

That's it! Much simpler than the submodule approach.

## Security Notes

- Proto definitions are public (just the interface)
- All test logic and implementation details remain private
- No sensitive data in proto files
- Review proto files before committing to ensure no accidental leaks

## CI/CD Integration

### Public Fork CI
```yaml
name: Build Public
on: [push, pull_request]
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm run install:all
      - run: ./scripts/build-with-submodules.sh
```

### Private Repository CI
```yaml
name: Test Private
on: [push]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/checkout@v3
        with:
          repository: your-org/cline-fork
          path: cline_agent
      - run: ./scripts/build-tests.sh --build-extension
      - run: cd sandbox-client && docker-compose up --build
```

This approach gives you the best of both worlds: public interface, private implementation!
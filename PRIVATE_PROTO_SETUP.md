# Private Proto Setup Guide

This guide explains how to set up the Cline architecture with proto definitions in your private repository.

## Recommended Structure

### Private Repository
```
your-private-backend/
├── proto-shared/           # gRPC interface definitions
│   ├── *.proto            # All proto files
│   ├── build-proto.js     # Build script
│   ├── package.json       # Node dependencies
│   └── README.md          # Documentation
├── sandbox-client/         # Cline test implementation
│   ├── main.go
│   ├── grpc_client_test_logic.go
│   ├── Dockerfile
│   └── go.mod
├── your-other-services/    # Other backend services
└── scripts/
    └── setup-cline-testing.sh

```

### Public Cline Fork
```
cline_agent/
├── proto/                  # Submodule → your-private-backend/proto-shared
├── src/                    # Extension source (unchanged)
├── grpc-testing-framework/ # Generic testing framework
├── cline-grpc-adapter/     # Cline-specific adapter
└── scripts/                # Build scripts
```

## Step-by-Step Setup

### 1. Move proto-shared to Private Repository

```bash
# In your private repository
cd your-private-backend
mv /path/to/cline_agent/proto-shared .

# Commit in private repo
git add proto-shared/
git commit -m "Add Cline proto definitions"
git push
```

### 2. Move sandbox-client to Private Repository

```bash
# Still in private repository
mv /path/to/cline_agent/sandbox-client .

# Update imports in sandbox-client to use local proto
# In sandbox-client/main.go and grpc_client_test_logic.go:
# Update module paths to reference ../proto-shared

git add sandbox-client/
git commit -m "Add Cline sandbox test client"
git push
```

### 3. Set up Proto Submodule in Public Fork

```bash
# In public Cline fork
cd cline_agent

# Remove local proto-shared
rm -rf proto-shared

# If you have existing proto directory, back it up
mv proto proto.backup

# Add private proto as submodule
git submodule add git@github.com:your-org/private-backend.git temp-submodule
git submodule add git@github.com:your-org/private-backend.git/proto-shared proto
# Note: The above might not work directly, see alternative below

# Alternative: Use sparse checkout
git submodule add git@github.com:your-org/private-backend.git private-backend
cd private-backend
git sparse-checkout init --cone
git sparse-checkout set proto-shared
cd ..
ln -s private-backend/proto-shared proto

# Commit the submodule
git add .gitmodules proto
git commit -m "Add proto as submodule from private repo"
```

### 4. Update Build Scripts in Private Repository

Create `your-private-backend/scripts/build-cline-tests.sh`:

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PRIVATE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CLINE_ROOT="${CLINE_ROOT:-$PRIVATE_ROOT/../cline_agent}"

echo "=== Building Cline Tests ==="

# Step 1: Build proto files
echo "Building proto definitions..."
cd "$PRIVATE_ROOT/proto-shared"
npm install
npm run build

# Step 2: Build Cline extension if needed
if [ "$1" == "--build-extension" ]; then
    echo "Building Cline extension..."
    cd "$CLINE_ROOT"
    ./scripts/build-with-submodules.sh --package
    cp *.vsix "$PRIVATE_ROOT/sandbox-client/"
fi

# Step 3: Generate Go proto code
echo "Generating Go proto code..."
cd "$PRIVATE_ROOT/sandbox-client"
mkdir -p genproto
protoc --go_out=genproto --go-grpc_out=genproto \
       -I../proto-shared \
       ../proto-shared/*.proto

# Step 4: Build Go test client
echo "Building test client..."
go mod tidy
go build .

echo "=== Build complete ==="
```

### 5. Configure Private Repository Go Modules

In `sandbox-client/go.mod`:

```go
module github.com/your-org/private-backend/sandbox-client

go 1.19

require (
    google.golang.org/grpc v1.56.0
    google.golang.org/protobuf v1.30.0
)

// If you need the adapter from public fork
replace github.com/your-org/cline-grpc-adapter => ../../cline_agent/cline-grpc-adapter
```

## Benefits of This Approach

1. **Complete Privacy**: Both proto definitions and tests are private
2. **Single Private Repository**: Everything private is in one place
3. **Simpler Management**: No need for separate proto repository
4. **Integrated with Backend**: Proto definitions can be shared with other backend services
5. **Flexible Access**: Public fork only needs read access to proto via submodule

## Alternative: Without Submodules

If submodules are too complex, you can use a build-time copy approach:

In your private repository's build script:
```bash
# Copy proto files to public fork during build
cp -r ../proto-shared/* ../../cline_agent/proto/

# Build in public fork
cd ../../cline_agent
./scripts/build-with-submodules.sh
```

Then add to public fork's `.gitignore`:
```
# Copied proto files
proto/*.proto
proto/build-proto.js
proto/package.json
```

## Security Considerations

1. **Access Control**: Public fork needs read-only access to private proto
2. **Submodule URLs**: Use SSH URLs for private submodules
3. **CI/CD**: Configure proper authentication for automated builds
4. **Review**: Ensure no private code leaks to public fork

## Example Workflow

```bash
# Daily development workflow
cd your-private-backend

# 1. Update proto definitions
cd proto-shared
# Edit proto files
npm run build

# 2. Update tests
cd ../sandbox-client
# Edit test code

# 3. Build and test
cd ..
./scripts/build-cline-tests.sh --build-extension

# 4. Run tests
cd sandbox-client
docker-compose up --build
```

This setup keeps all your private code (proto definitions and tests) in your private repository while the public fork contains only the generic, reusable components.
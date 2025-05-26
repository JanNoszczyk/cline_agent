# Quick Setup Guide

This guide helps you quickly set up the modular Cline architecture.

## Final Architecture

```
Public Cline Fork (this repo):
├── proto-shared/           # Proto definitions (PUBLIC)
├── grpc-testing-framework/ # Generic testing framework
├── cline-grpc-adapter/     # Cline-specific adapter
└── src/                    # Extension code

Your Private Repo:
└── sandbox-client/         # Test implementation (PRIVATE)
```

## Setup Steps

### 1. Clone Public Fork
```bash
git clone <your-cline-fork-url> cline_agent
cd cline_agent
```

### 2. Build Extension
```bash
# Install dependencies
npm run install:all

# Build with proto
./scripts/build-with-submodules.sh

# Package extension
./scripts/package-extension.sh
```

### 3. Move sandbox-client to Private Repo
```bash
# Run migration script
./scripts/simple-migration.sh

# Or manually:
mv sandbox-client ../your-private-repo/
```

### 4. Set Up Private Repo

In your private repository:

```bash
# Build tests
cd sandbox-client
mkdir -p genproto

# Generate Go code from public proto
protoc --go_out=genproto --go-grpc_out=genproto \
       -I../cline_agent/proto-shared \
       ../cline_agent/proto-shared/*.proto

# Build
go mod tidy
go build .
```

## Daily Workflow

### Working on Proto
```bash
cd cline_agent/proto-shared
# Edit .proto files
npm run build
git commit -am "Update proto"
git push
```

### Working on Tests
```bash
cd your-private-repo/sandbox-client
# Edit test code
../scripts/build-tests.sh
docker-compose up --build
```

### Building Extension
```bash
cd cline_agent
./scripts/package-extension.sh --copy-to ../your-private-repo/sandbox-client
```

## Key Points

1. **Proto is PUBLIC**: Interface definitions stay in public fork
2. **Tests are PRIVATE**: Implementation stays in private repo
3. **No Submodules**: Simple, clean separation
4. **Easy to Use**: Clone public repo, move one directory, done!

## Environment Variables

In your private repo, set if needed:
```bash
export CLINE_ROOT=/path/to/cline_agent  # If not at ../cline_agent
```

## Troubleshooting

### Proto not found
```bash
# Ensure proto-shared exists in public fork
cd cline_agent
ls proto-shared/
```

### Build fails
```bash
# Clean and rebuild
cd cline_agent
rm -rf node_modules dist
npm run install:all
./scripts/build-with-submodules.sh
```

### Go generation fails
```bash
# Check protoc is installed
protoc --version

# Install if needed
# Mac: brew install protobuf
# Linux: apt-get install protobuf-compiler
```

That's it! Simple and clean separation of public and private code.
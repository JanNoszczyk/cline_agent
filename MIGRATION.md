# Migration Guide: Monolithic to Modular Structure

This guide walks through migrating from the monolithic Cline + sandbox-client structure to the new modular architecture.

## Pre-Migration Checklist

- [ ] Backup your current repository
- [ ] Ensure all changes are committed
- [ ] Have access to create new private repository
- [ ] Decide on proto repository strategy (public/private)

## Step 1: Prepare Proto Submodule

### Option A: Public Proto Repository

1. Create new repository for proto files:
```bash
# In a temporary directory
mkdir cline-grpc-proto
cd cline-grpc-proto
git init
git branch -m main

# Copy proto files
cp -r /path/to/cline_agent/proto/* .
git add .
git commit -m "Initial commit: Cline gRPC proto definitions"

# Push to GitHub/GitLab
git remote add origin <your-proto-repo-url>
git push -u origin main
```

### Option B: Private Proto Repository

Same as Option A, but create as private repository.

## Step 2: Update Cline Fork

1. Remove old proto directory and add as submodule:
```bash
cd cline_agent
git rm -r proto/  # Remove tracked files
rm -rf proto/     # Remove directory

# Add proto submodule
git submodule add <proto-repo-url> proto
git commit -m "Convert proto to submodule"
```

2. Update build scripts:
```bash
# The new scripts are already in scripts/ directory
# Just ensure they're executable
chmod +x scripts/build-with-submodules.sh
chmod +x scripts/package-extension.sh
chmod +x scripts/setup-dev-environment.sh
```

## Step 3: Create Private Repository Structure

1. Create new private repository:
```bash
mkdir my-cline-private
cd my-cline-private
git init
git branch -m main
```

2. Move sandbox-client:
```bash
# From cline_agent directory
mv sandbox-client/ ../my-cline-private/
cd ../my-cline-private
git add sandbox-client/
git commit -m "Import sandbox-client from public fork"
```

3. Update sandbox-client imports:

In `sandbox-client/main.go`:
```go
// Old imports
// pb "sandboxclient/genproto/task_control"

// New imports (after setting up proper Go modules)
import (
    pb "github.com/your-org/cline-grpc-proto/task_control"
    // or if using local generation
    pb "./genproto/task_control"
)
```

4. Create go.mod for private tests:
```bash
cd my-cline-private
go mod init github.com/your-org/cline-private-tests
```

## Step 4: Set Up Build Pipeline

1. In private repository, create build script:

`my-cline-private/scripts/build.sh`:
```bash
#!/bin/bash
set -e

# Build Cline extension
cd ../cline_agent
./scripts/build-with-submodules.sh --package

# Copy VSIX to private repo
cp *.vsix ../my-cline-private/sandbox-client/

# Generate Go proto files
cd ../my-cline-private/sandbox-client
mkdir -p genproto
protoc --go_out=genproto --go-grpc_out=genproto \
       -I../../cline_agent/proto \
       ../../cline_agent/proto/*.proto

# Build Go client
go build .
```

## Step 5: Update Git Configuration

1. In Cline fork, update `.gitignore`:
```gitignore
# Remove sandbox-client references
sandbox-client/
/sandbox-client

# Add new ignores
*-private/
grpc-testing-framework/
cline-grpc-adapter/genproto/
```

2. Clean up Git history (optional):
```bash
# Remove sandbox-client from history if needed
git filter-branch --force --index-filter \
  'git rm -r --cached --ignore-unmatch sandbox-client' \
  --prune-empty --tag-name-filter cat -- --all
```

## Step 6: Verify Setup

1. Test proto submodule:
```bash
cd cline_agent
git submodule update --init --recursive
cd proto
npm install
npm run build
```

2. Test extension build:
```bash
cd ..
./scripts/build-with-submodules.sh
```

3. Test private repository:
```bash
cd ../../my-cline-private/sandbox-client
go build .
```

## Step 7: Update CI/CD

### For Cline Fork (Public)

`.github/workflows/build.yml`:
```yaml
name: Build Cline
on: [push, pull_request]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          submodules: recursive
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - run: npm run install:all
      - run: ./scripts/build-with-submodules.sh
```

### For Private Repository

`.github/workflows/test.yml`:
```yaml
name: Run Private Tests
on: [push]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - name: Checkout Cline
        uses: actions/checkout@v3
        with:
          repository: your-org/cline-fork
          path: cline_agent
          submodules: recursive
      
      - name: Build and Test
        run: |
          cd cline_agent
          ./scripts/build-with-submodules.sh --package
          cd ../sandbox-client
          ./run-tests.sh
```

## Common Issues and Solutions

### Issue: Proto imports not found
**Solution**: Ensure proto submodule is initialized:
```bash
git submodule update --init --recursive
```

### Issue: Go module errors
**Solution**: Update go.mod replace directives:
```go
replace github.com/your-org/cline-grpc-adapter => ../cline_agent/cline-grpc-adapter
```

### Issue: Docker build fails
**Solution**: Ensure Docker context includes necessary files:
```bash
# In private repo
docker build -f sandbox-client/Dockerfile \
             --build-arg VSIX_PATH=./cline.vsix \
             .
```

## Rollback Plan

If you need to revert to monolithic structure:

1. Copy sandbox-client back:
```bash
cp -r ../my-cline-private/sandbox-client ./
```

2. Remove proto submodule:
```bash
git submodule deinit -f proto
rm -rf .git/modules/proto
git rm -f proto
cp -r ../cline-grpc-proto/* proto/
git add proto/
```

3. Restore original scripts:
```bash
git checkout HEAD~10 -- scripts/update-sandbox-vsix.sh
git checkout HEAD~10 -- scripts/run-sandbox-docker.sh
```

## Next Steps

After migration:

1. Set up automated testing in private repository
2. Configure deployment pipelines
3. Document test scenarios
4. Train team on new structure
5. Consider publishing testing framework as open source
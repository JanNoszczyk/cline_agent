# Quick Reference: Modular Cline Structure

## Directory Structure

```
cline_agent/ (public fork)
├── src/                      # Extension source code
├── proto/                    # Proto definitions (submodule)
├── cline-grpc-adapter/       # Cline-specific adapter
├── grpc-testing-framework/   # Generic testing framework
├── scripts/
│   ├── build-with-submodules.sh
│   ├── package-extension.sh
│   └── setup-dev-environment.sh
├── ARCHITECTURE.md
├── MIGRATION.md
└── QUICK_REFERENCE.md

my-private-repo/ (private)
├── sandbox-client/           # Test implementations
├── test-workspaces/          # Test data
└── scripts/                  # Private build scripts
```

## Common Commands

### Building Extension (Public Repo)

```bash
# Full build with proto generation
./scripts/build-with-submodules.sh

# Package extension as VSIX
./scripts/package-extension.sh

# Package and copy to specific location
./scripts/package-extension.sh --copy-to ../my-private-repo/sandbox-client
```

### Proto Management

```bash
# Update proto submodule
git submodule update --remote proto

# Generate TypeScript definitions
cd proto && npm run build

# Generate Go definitions (from private repo)
protoc --go_out=./genproto --go-grpc_out=./genproto \
       -I../cline_agent/proto \
       ../cline_agent/proto/*.proto
```

### Running Tests (Private Repo)

```bash
# Build and run Docker tests
cd sandbox-client
docker build -t cline-tests .
docker run --rm cline-tests

# Run specific test phase
docker run --rm -e TEST_PHASE=1 cline-tests
```

## Configuration Files

### Proto Submodule (.gitmodules)
```ini
[submodule "proto"]
    path = proto
    url = https://github.com/your-org/cline-grpc-proto.git
```

### Test Configuration (Go)
```go
config := adapter.NewClineConfig(
    "./cline.vsix",     // Extension path
    50051,              // gRPC port
    "./workspace",      // Test workspace
)
```

### Docker Environment Variables
```dockerfile
ENV GRPC_PORT=50051
ENV EXTENSION_ID=rooveterinaryinc.cline
ENV TEST_PHASE=all
```

## Workflow Diagrams

### Build Flow
```
proto/ → npm run build → TypeScript definitions
                      ↘
                        src/ → npm run compile → dist/
                                              ↘
                                                vsce package → .vsix
```

### Test Flow
```
.vsix → Docker container → VS Code Server → Extension
                        ↘                 ↗
                          gRPC client tests
```

## Troubleshooting

### Proto not found
```bash
git submodule update --init --recursive
```

### Build fails
```bash
# Clean and rebuild
rm -rf node_modules dist
npm run install:all
./scripts/build-with-submodules.sh
```

### Docker connection issues
```bash
# Check if extension is running
docker logs <container-id>

# Verify gRPC port
docker exec <container-id> netcat -zv localhost 50051
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GRPC_PORT` | gRPC server port | 50051 |
| `EXTENSION_ID` | VS Code extension ID | rooveterinaryinc.cline |
| `TEST_PHASE` | Which test phase to run | all |
| `DEBUG_MODE` | Enable verbose logging | false |

## Git Workflow

### Working with Submodules
```bash
# Clone with submodules
git clone --recursive <repo-url>

# Update submodule to latest
git submodule update --remote

# Commit submodule changes
cd proto
git add .
git commit -m "Update proto definitions"
git push
cd ..
git add proto
git commit -m "Update proto submodule"
```

### Branching Strategy
- `main` - Stable, tested code
- `develop` - Integration branch
- `feature/*` - New features
- `fix/*` - Bug fixes
- `private/*` - Never push (local only)

## Security Notes

1. **Never commit private test code to public fork**
2. **Use `.gitignore` to exclude sensitive files**
3. **Keep API keys and credentials in environment variables**
4. **Review all commits before pushing to public repositories**

## Useful Aliases

Add to your shell configuration:

```bash
# Cline development aliases
alias cline-build='./scripts/build-with-submodules.sh'
alias cline-package='./scripts/package-extension.sh'
alias cline-test='cd ../my-private-repo && ./run-tests.sh'
alias cline-proto='cd proto && npm run build && cd ..'
```

## Resources

- [Proto3 Language Guide](https://developers.google.com/protocol-buffers/docs/proto3)
- [gRPC Go Tutorial](https://grpc.io/docs/languages/go/quickstart/)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
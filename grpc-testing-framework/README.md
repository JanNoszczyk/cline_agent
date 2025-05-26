# gRPC Testing Framework

A generic framework for testing VS Code extensions with gRPC interfaces.

## Overview

This framework provides a reusable testing infrastructure for VS Code extensions that expose gRPC services. It handles:
- Docker container orchestration
- VS Code Server setup
- Extension installation and lifecycle management
- gRPC client connectivity
- Test execution and validation

## Architecture

The framework is designed to be extension-agnostic through the use of interfaces:

```
TestRunner (Interface)
    ├── Setup() - Initialize test environment
    ├── RunTests() - Execute test scenarios
    └── Cleanup() - Tear down test environment

ExtensionConfig (Interface)
    ├── GetExtensionPath() - Path to VSIX file
    ├── GetGrpcPort() - gRPC server port
    └── GetProtoPath() - Path to proto definitions
```

## Usage

To use this framework with your VS Code extension:

1. Implement the `TestRunner` interface for your specific tests
2. Provide an `ExtensionConfig` implementation
3. Use the framework's Docker orchestration to run tests

### Example

```go
type MyExtensionTests struct {
    client MyServiceClient
}

func (t *MyExtensionTests) Setup(conn *grpc.ClientConn) error {
    t.client = NewMyServiceClient(conn)
    return nil
}

func (t *MyExtensionTests) RunTests(ctx context.Context) error {
    // Implement your test scenarios
    return nil
}

func main() {
    config := &MyExtensionConfig{
        extensionPath: "./my-extension.vsix",
        grpcPort: 50051,
    }
    
    framework := NewTestFramework(config)
    framework.Run(&MyExtensionTests{})
}
```

## Docker Integration

The framework includes Docker support for running tests in isolated environments:
- Multi-stage builds for efficient caching
- VS Code Server with extension pre-installed
- Automated test execution and result collection

## Requirements

- Docker
- Go 1.19+
- Protocol Buffer compiler (protoc)
- VS Code extension packaged as VSIX
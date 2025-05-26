# Cline gRPC Adapter

This package provides the integration between the Cline VS Code extension and the generic gRPC testing framework.

## Overview

The adapter implements the necessary interfaces to test Cline using the generic gRPC testing framework. It remains in the public Cline fork repository while the actual test implementations can be kept private.

## Structure

- `config.go` - Cline-specific configuration implementation
- `client.go` - Generated gRPC client stubs from proto files
- `helpers.go` - Utility functions for Cline-specific operations

## Usage

This adapter is used by private test implementations:

```go
import (
    "github.com/your-org/cline-grpc-adapter"
    "github.com/your-org/grpc-testing-framework"
)

func main() {
    config := adapter.NewClineConfig(
        "./cline.vsix",
        50051,
        "./test-workspace",
    )
    
    framework := grpctesting.NewTestFramework(config)
    
    // Run your private tests
    framework.Run(myPrivateTests)
}
```

## Proto Generation

The adapter includes generated Go code from the Cline proto definitions:

```bash
cd proto
protoc --go_out=../cline-grpc-adapter --go-grpc_out=../cline-grpc-adapter *.proto
```
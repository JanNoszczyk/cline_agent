# Cline Modular Architecture

## Overview

This document describes the modular architecture implemented for the Cline VS Code extension to support both public and private development workflows.

## Problem Statement

The original monolithic structure mixed public extension code with private testing infrastructure in a single repository. This created challenges:
- Private test code couldn't be kept confidential in a public fork
- Testing infrastructure was tightly coupled to Cline
- Difficult to reuse testing framework for other extensions

## Solution Architecture

The solution separates concerns into multiple, loosely-coupled components:

```
┌─────────────────────────────────────────────────────────────┐
│                    Public Cline Fork                         │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Cline VS Code Extension                 │   │
│  │  - Core extension code                              │   │
│  │  - gRPC server implementation                       │   │
│  │  - Webview UI                                       │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              proto-shared (Public)                   │   │
│  │  - Service definitions (task_control.proto, etc.)   │   │
│  │  - Message types                                    │   │
│  │  - Interface contract (nothing sensitive)            │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              cline-grpc-adapter                      │   │
│  │  - Cline-specific configuration                     │   │
│  │  - Helper utilities                                 │   │
│  │  - Proto client generation                          │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            grpc-testing-framework                    │   │
│  │  - Generic testing interfaces                       │   │
│  │  - Docker orchestration                             │   │
│  │  - Test execution framework                         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Uses proto definitions
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                Private Repository (Backend)                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           sandbox-client (Private)                   │   │
│  │  - Test implementations                             │   │
│  │  - Business logic                                   │   │
│  │  - Docker orchestration                             │   │
│  │  - VS Code automation                               │   │
│  │  - Generates Go code from public proto              │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐   │
│  │         Other Backend Services (Private)             │   │
│  │  - Your other private services                      │   │
│  │  - Can also use public proto definitions            │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Component Descriptions

### 1. Proto Definitions (proto-shared)
- **Location**: Public fork (this repository)
- **Purpose**: Single source of truth for gRPC interface definitions
- **Contents**: All .proto files defining services and messages
- **Visibility**: Public (just the interface contract)
- **Benefits**: Transparent, reusable, nothing sensitive

### 2. Cline VS Code Extension
- **Location**: Public fork (this repository)
- **Purpose**: Core VS Code extension functionality
- **Changes**: Minimal - only gRPC server integration
- **Visibility**: Public

### 3. grpc-testing-framework
- **Location**: Public fork (can be moved to separate repo)
- **Purpose**: Generic, reusable testing framework for any VS Code extension
- **Key Features**:
  - Extension-agnostic interfaces
  - Docker container management
  - gRPC connection handling
  - Test orchestration
- **Visibility**: Public (valuable for community)

### 4. cline-grpc-adapter
- **Location**: Public fork
- **Purpose**: Bridge between generic framework and Cline-specific needs
- **Contents**:
  - Cline configuration implementation
  - Generated Go client code from protos
  - Helper utilities for Cline messages
- **Visibility**: Public

### 5. sandbox-client (Private)
- **Location**: Private repository
- **Purpose**: Actual test implementations and business logic
- **Contents**:
  - Test scenarios
  - Integration tests
  - Performance tests
  - Any proprietary testing logic
- **Visibility**: Private

## Development Workflows

### Public Development (Contributing to Cline)

1. Clone the public fork:
```bash
git clone <public-fork-url>
cd cline_agent
```

2. Set up proto as submodule (if public):
```bash
git submodule add <proto-repo-url> proto
git submodule update --init
```

3. Build and develop:
```bash
./scripts/build-with-submodules.sh
```

### Private Development (Internal Testing)

1. Set up private repository structure:
```
my-private-project/
├── cline_agent/          # Public fork as submodule
├── sandbox-client/       # Private tests
└── test-workspaces/      # Test data
```

2. In private repository:
```go
// main_test.go
import (
    adapter "github.com/your-org/cline-grpc-adapter"
    framework "github.com/your-org/grpc-testing-framework"
)

func TestMyScenarios(t *testing.T) {
    config := adapter.NewClineConfig("./cline.vsix", 50051, "./workspace")
    fw := framework.NewTestFramework(config)
    
    result, err := fw.Run(&MyPrivateTests{})
    // ... handle results
}
```

## Migration Guide

### From Monolithic to Modular

1. **Move sandbox-client to private repo**:
```bash
mv sandbox-client/ ../my-private-repo/
cd ../my-private-repo
git add sandbox-client/
git commit -m "Move sandbox-client to private repository"
```

2. **Update imports in sandbox-client**:
- Change imports to use the adapter package
- Update proto imports to use generated code

3. **Set up proto submodule in public fork**:
```bash
cd cline_agent
rm -rf proto
git submodule add <proto-repo-url> proto
```

4. **Update .gitignore**:
```gitignore
# Exclude private components
sandbox-client/
*-private/
```

## Benefits

1. **Separation of Concerns**: Clear boundaries between public and private code
2. **Reusability**: Testing framework can be used for other extensions
3. **Security**: Private test logic remains confidential
4. **Maintainability**: Easier to update components independently
5. **Collaboration**: Public components can benefit from community contributions

## Configuration Examples

### Proto Submodule Configuration (.gitmodules)
```ini
[submodule "proto"]
    path = proto
    url = https://github.com/your-org/cline-grpc-proto.git
    branch = main
```

### Testing Framework Usage
```go
type MyTests struct {
    client pb.TaskControlServiceClient
}

func (t *MyTests) Setup(conn *grpc.ClientConn) error {
    t.client = pb.NewTaskControlServiceClient(conn)
    return nil
}

func (t *MyTests) RunTests(ctx context.Context) error {
    // Implement test scenarios
    stream, err := t.client.StartTask(ctx, &pb.NewTaskRequest{
        Text: "Test task",
    })
    // ... handle stream
    return nil
}
```

## Future Enhancements

1. **Published Packages**: Publish framework and adapter as proper Go modules
2. **Test Templates**: Provide templates for common test scenarios
3. **CI/CD Integration**: GitHub Actions for automated testing
4. **Multiple Extension Support**: Test multiple extensions in same framework
5. **Performance Metrics**: Built-in performance measurement and reporting
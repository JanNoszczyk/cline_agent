# Cline gRPC Proto Definitions

This repository contains the shared Protocol Buffer definitions for the Cline gRPC interface.

## Overview

These proto files define the gRPC services and messages used for remote control of the Cline VS Code extension. They are shared between:
- The Cline VS Code extension (public fork)
- Private sandbox/testing clients
- Any other systems that need to integrate with Cline via gRPC

## Structure

- `task_control.proto` - Main service definition for task control
- `account.proto` - Account management types
- `browser.proto` - Browser automation types
- `checkpoints.proto` - Checkpoint/versioning types
- `common.proto` - Common shared types
- `file.proto` - File operation types
- `mcp.proto` - Model Context Protocol types
- `models.proto` - AI model configuration types
- `slash.proto` - Slash command types
- `state.proto` - Extension state types
- `task.proto` - Task-specific types
- `ui.proto` - UI interaction types
- `web.proto` - Web-related types
- `build-proto.js` - JavaScript build script for generating TypeScript definitions

## Usage

This repository is designed to be used as a git submodule in projects that need the Cline gRPC interface definitions.

### Adding as a submodule

```bash
git submodule add <proto-shared-repo-url> proto
```

### Generating TypeScript definitions

```bash
cd proto
npm install
npm run build
```

### Generating Go definitions

```bash
protoc --go_out=. --go-grpc_out=. *.proto
```

## License

[Add appropriate license information]
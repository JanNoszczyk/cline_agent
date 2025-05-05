# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Cline** is a VS Code extension providing an autonomous AI coding assistant with gRPC remote control capabilities. It enables external systems to spawn, manage, and interact with Cline instances in isolated environments while maintaining a seamless user experience through both direct webview interaction and remote gRPC control.

## Core Architecture

### Communication Patterns
- **Internal**: VS Code `postMessage` between extension and webview
- **External**: gRPC server for remote system integration
- **Dual-path messaging**: Original webview streaming + cleaned gRPC message delivery

### Key Components
```
External gRPC Client → GrpcServer → GrpcBridge → Controller/Task → WebviewProvider
```

## Development Commands

### Essential Setup
- `npm run install:all` - Install all dependencies (root + webview)
- `npm run protos` - Generate TypeScript from protocol buffers (run after `.proto` changes)

### Development Workflow
- `npm run dev` - Development mode with file watching
- `npm run dev:webview` - Webview development server (React)
- `npm run compile` - TypeScript + ESLint + esbuild compilation

### Testing (Critical for gRPC Integration)
- `npm run test` - All tests (unit + integration)
- `npm run test:unit` - Mocha unit tests
- `npm run test:webview` - Vitest webview tests

### Docker Testing Workflow (Primary for gRPC)
**CRITICAL**: Use these scripts for testing gRPC functionality:

1. **After `src/` changes**: `bash scripts/update-sandbox-vsix.sh` (packages extension)
2. **Run tests**: `bash scripts/run-sandbox-docker.sh` (full Docker E2E test)
3. **Analyze results**: Check logs in `run_logs/` directory

**Skip step 1** if changes are only in `sandbox-client/` directory.

## Key Architectural Patterns

### gRPC Integration (`GrpcBridge.ts`)
- **Active Mode**: gRPC client controls task lifecycle via `clientTaskMap`
- **Passive Mode**: User controls via webview, gRPC logs/rejects unauthorized calls
- **Message Processing**: Dual-path approach preserves webview streaming while providing cleaned messages to gRPC
- **State Management**: `clientTaskMap` tracks gRPC client → Task relationships

### Message Flow & De-duplication
1. `Task.say()` → `Controller.postMessageToWebview()` (wrapped by `GrpcBridge`)
2. **gRPC Path**: Intercepts `partialMessage`/`say` types, uses `grpcCleanMessageAggregator` for de-duplication
3. **Webview Path**: Always passes original message through unchanged
4. Complete messages emitted via `newChatMessage` events to gRPC clients

### Protocol Buffer Workflow
- Modify `.proto` files for API changes
- Run `npm run protos` to regenerate TypeScript definitions
- Update `src/services/grpc/mapper.ts` for type conversions
- Implement handlers in `GrpcBridge.ts`

## Directory Structure & Key Files

### gRPC Core
- `proto/*.proto` - Service definitions (especially `task_control.proto`)
- `src/services/grpc/server.ts` - gRPC server implementation
- `src/services/grpc/GrpcBridge.ts` - **CORE**: Mediates gRPC ↔ Cline
- `src/services/grpc/mapper.ts` - Protobuf ↔ TypeScript conversions

### Extension Core
- `src/extension.ts` - Entry point, initializes `GrpcBridge`
- `src/core/controller/index.ts` - Central state management
- `src/core/task/index.ts` - Task execution logic
- `src/core/webview/index.ts` - UI communication

### Testing Infrastructure
- `sandbox-client/` - Go gRPC client for E2E testing
- `scripts/update-sandbox-vsix.sh` - **MUST RUN** after `src/` changes
- `scripts/run-sandbox-docker.sh` - Orchestrates Docker E2E tests
- `run_logs/` - Primary artifact for test analysis

### Frontend
- `webview-ui/` - React frontend with Vite/Tailwind
- Uses path aliases: `@core`, `@services`, `@api`, etc.

## Critical Development Notes

### Task Ownership & Security
- gRPC clients can only delete tasks they "own" via `clientTaskMap`
- Passive mode prevents unauthorized task interference
- User-controlled tasks protected from gRPC manipulation

### State Management Patterns
- `clientTaskMap`: Maps gRPC `clientId` → active `Task`
- `grpcCleanMessageAggregator`: De-duplicates streaming text content
- Event-driven: `Task.onDispose`, `GrpcNotifier.emit()`

### Testing Requirements
- Always test gRPC changes with Docker workflow
- Verify both active (gRPC-controlled) and passive (user-controlled) modes
- Check logs in `run_logs/` after test runs
- E2E tests must pass before integration

### Build System
- esbuild with custom plugins for WASM/proto file copying
- TypeScript strict mode throughout
- Path aliases configured in `esbuild.js`

## Current Implementation Status

**Working**: Core gRPC services (`UpdateSettings`, `StartTask`, `sendUserInput`, `SubmitAskResponse`, `McpService`, `CheckpointsService`, `ResumeLatestTask`), task handoff mechanism, passive observation mode, Docker E2E testing infrastructure.

**Architecture Decision**: Non-invasive integration pattern - gRPC functionality wraps existing Cline logic without breaking webview experience.
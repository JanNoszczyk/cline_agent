# System Patterns: Cline gRPC Integration (Summary)

## 1. Core Architecture
`GrpcBridge` mediates between external gRPC clients and Cline's core (`Controller`, `Task`).

```mermaid
graph LR
    ExternalSystem[External System (gRPC Client)] --> GrpcServer[gRPC Server (server.ts)]
    subgraph ClineExtension [Cline Extension (VSCode)]
        GrpcServer --> GrpcBridge[GrpcBridge (grpc/GrpcBridge.ts)]
        GrpcBridge --> Controller[Controller (core/controller)]
        GrpcBridge --> Task[Task (core/task)]
        Controller --> Task
        Controller --> WebviewProvider[WebviewProvider (core/webview)]
        GrpcBridge -.-> WebviewProvider
    end
    style GrpcBridge fill:#ccf,stroke:#333,stroke-width:2px
```

## 2. Key Components & Interactions
*   **`proto/*.proto`:** Define gRPC service contract.
*   **`src/services/grpc/server.ts`:** Implements gRPC server; uses `GrpcServerCallbacks` (in) & `GrpcTaskNotifier` (out).
*   **`src/services/grpc/mapper.ts`:** Translates Cline data <=> Protobuf messages.
*   **`src/services/grpc/GrpcBridge.ts`:**
    *   Inits in `extension.ts`, starts `GrpcServer`.
    *   Manages `clientTaskMap` (`clientId` -> `Task`). Cleans up on `Task.onDispose`.
    *   Routes gRPC requests to `Controller` or `Task`.
    *   Handles input via `handleWebviewAskResponse` (for `sendUserInput`, `submitAskResponse`). `handleUserInput` allows unprompted input.
    *   Wraps `postMessageToWebview` to route messages to gRPC client or webview based on `taskId`.
*   **`src/extension.ts`:** Inits/disposes `GrpcBridge`.
*   **`src/core/controller/index.ts` (`Controller`):** Core state; `postMessageToWebview` includes `taskId`.
*   **`src/core/task/index.ts` (`Task`):** Active task; `onDispose` event. `postMessageToWebview` calls pass `taskId`.
*   **`src/core/webview/index.ts` (`WebviewProvider`):** UI communication; receives messages not for gRPC.

## 3. Design Patterns & Decisions
*   **Bridge:** `GrpcBridge`.
*   **Callback/Notifier:** For gRPC server I/O.
*   **Event Emitter (Observer):** `Task.onDispose`.
*   **Message Interception (Wrapper):** `GrpcBridge` wraps `Controller.postMessageToWebview` for routing.
*   **State Management:** `GrpcBridge` owns `clientTaskMap`.
*   **Passive Interface:** `GrpcBridge` primarily relays; `sendUserInput` can now push unprompted input.
*   **Protobuf Structure Mirroring:** Proto messages must match `WebviewMessage.ts` structures.

## 4. Data Flow
1.  **In (Client -> Cline):** gRPC Client -> `GrpcServer` -> `GrpcBridge` -> `Controller`/`Task`.
2.  **Out (Cline -> Client):** `Controller`/`Task` -> `GrpcBridge` -> `GrpcTaskNotifier` -> `GrpcServer` -> gRPC Client.

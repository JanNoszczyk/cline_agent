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
    *   Wraps `Controller.postMessageToWebview`. For gRPC clients:
        *   It intercepts `WebviewMessage` of type `partialMessage`.
        *   A `grpcPartialMessageBuffer` (Map<taskId, Map<timestamp, accumulatedText>>) accumulates these partials.
        *   When a `partialMessage` arrives with its `partial` flag as false (or undefined), indicating the message is complete, the full message is retrieved from the buffer.
        *   This complete message is then emitted via `grpcNotifier.emit('newChatMessage', ...)` using the `ExtensionMessage.new_chat_message` protobuf field.
        *   The direct emission of `sayUpdate` or `askRequest` events for gRPC clients from the `partialMessage` handling path has been removed, ensuring only complete messages are sent.
    *   The `startTask` gRPC method handler in `GrpcBridge` listens for `newChatMessage` events from the notifier and streams these individual, complete messages to the client.
*   **`src/extension.ts`:** Inits/disposes `GrpcBridge`.
*   **`src/core/controller/index.ts` (`Controller`):** Core state; `postMessageToWebview` (called by `Task.say`) includes `taskId` and `message.type` (e.g., `partialMessage`), triggering the wrapped logic in `GrpcBridge`.
*   **`src/core/task/index.ts` (`Task`):** Active task; `onDispose` event. `postMessageToWebview` calls pass `taskId`.
*   **`src/core/webview/index.ts` (`WebviewProvider`):** UI communication; receives messages not for gRPC.

## 3. Design Patterns & Decisions
*   **Bridge:** `GrpcBridge`.
*   **Callback/Notifier:** For gRPC server I/O. `GrpcNotifier` emits events like `newChatMessage`, `error`, `taskStarted`. (Note: `sayUpdate`, `askRequest` are no longer emitted to gRPC clients from the `partialMessage` path).
*   **Event Emitter (Observer):** `Task.onDispose`.
*   **Message Interception (Wrapper):** `GrpcBridge` wraps `Controller.postMessageToWebview` to intercept `partialMessage` types for gRPC clients, buffers them using `grpcPartialMessageBuffer`, and emits complete messages.
*   **State Management:** `GrpcBridge` owns `clientTaskMap` (mapping `clientId` to `Task` instances) and `grpcPartialMessageBuffer` (for accumulating partial messages for gRPC clients before sending).
*   **Passive Interface:** `GrpcBridge` primarily relays; `sendUserInput` can now push unprompted input.
*   **Protobuf Structure Mirroring:** Proto messages must match `WebviewMessage.ts` structures.

## 4. Data Flow
1.  **In (Client -> Cline):** gRPC Client -> `GrpcServer` -> `GrpcBridge` -> `Controller`/`Task`.
2.  **Out (Cline -> Client):**
    *   `Task.say()` -> `Controller.postMessageToWebview()` (intercepted by `GrpcBridge`).
    *   If `message.type === 'partialMessage'` and the client is a gRPC client:
        *   `GrpcBridge` buffers the partial content in `grpcPartialMessageBuffer`.
        *   If the `partialMessage.partial` flag is false (message complete):
            *   The full message is retrieved from the buffer.
            *   `GrpcBridge` -> `GrpcNotifier.emit('newChatMessage')` -> `GrpcServer` -> gRPC Client (sends single, complete `ClineMessage` via `ExtensionMessage.new_chat_message`).
    *   Messages not intended for gRPC clients, or other message types like `state` (for webview UI), are passed through or handled differently.
    *   Other events for gRPC (e.g., `error`, `taskStarted`) are also emitted via `GrpcNotifier`.

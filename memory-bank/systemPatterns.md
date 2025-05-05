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
    *   Wraps `Controller.postMessageToWebview`.
    *   **For gRPC clients:**
        *   It intercepts `WebviewMessage` of type `partialMessage` (for `say: "text"`, `say: "reasoning"`, `say: "completion_result"`) and direct `say` messages of the same subtypes.
        *   A `grpcCleanMessageAggregator` (Map<clientId, Map<taskId, Map<timestamp, {firstChunkPayload, cleanAccumulatedText}>>>) accumulates and de-duplicates text content for these messages. De-duplication logic (e.g., overlap removal) is applied in `handleAndCleanGrpcPartialMessage`.
        *   When a message is deemed complete (either arrived complete or the final partial chunk is processed), the de-duplicated message is retrieved from the aggregator.
        *   This cleaned, complete message is then emitted via `grpcNotifier.emit('newChatMessage', ...)` using the `ExtensionMessage.new_chat_message` protobuf field.
        *   The `startTask` gRPC method handler in `GrpcBridge` listens for `newChatMessage` events from the notifier and streams these individual, cleaned, complete messages to the client.
    *   **For VSCode Webview:**
        *   The original, unaltered message (whether partial or complete) is **always** passed through to the original `postMessageToWebview` function, ensuring the webview's streaming functionality remains unaffected.
*   **`src/extension.ts`:** Inits/disposes `GrpcBridge`.
*   **`src/core/controller/index.ts` (`Controller`):** Core state; `postMessageToWebview` (called by `Task.say`) includes `taskId` and `message.type`, triggering the wrapped logic in `GrpcBridge`.
*   **`src/core/task/index.ts` (`Task`):** Active task; `onDispose` event. `postMessageToWebview` calls pass `taskId`.
*   **`src/core/webview/index.ts` (`WebviewProvider`):** UI communication; receives original messages via the passthrough in `GrpcBridge`.

## 3. Design Patterns & Decisions
*   **Bridge:** `GrpcBridge`.
*   **Callback/Notifier:** For gRPC server I/O. `GrpcNotifier` emits events like `newChatMessage` (for cleaned gRPC messages), `error`, `taskStarted`.
*   **Event Emitter (Observer):** `Task.onDispose`.
*   **Message Interception & Dual Path (Wrapper):** `GrpcBridge` wraps `Controller.postMessageToWebview`.
    *   **gRPC Path:** Intercepts specific message types (`partialMessage` and direct `say` for text/reasoning/completion), buffers them using `grpcCleanMessageAggregator`, de-duplicates content, and emits cleaned, complete messages via `newChatMessage`.
    *   **Webview Path:** Always calls the original `postMessageToWebview` to ensure the webview receives the original, unaltered stream.
*   **State Management:** `GrpcBridge` owns `clientTaskMap` and `grpcCleanMessageAggregator`.
*   **Active vs. Passive gRPC Mode:**
    *   **Active Mode (e.g., E2E Tests):** When a gRPC client initiates a task via `StartTask` or `ResumeLatestTask`, it provides a `clientId`. This `clientId` is then associated with the created/resumed `Task` instance in `clientTaskMap`. Subsequent gRPC calls from this `clientId` (e.g., `sendUserInput`, `submitAskResponse`, `cancelTask`, `deleteTaskWithId`) operate on this mapped task. The gRPC server actively streams messages related to this task back to the client.
    *   **Passive Observation Mode (User-Controlled via Webview):** This is the default state when no `clientId` has an actively mapped task.
        *   The gRPC server remains listening.
        *   If gRPC calls like `StartTask` are received without a `clientId` or with a `clientId` not matching an active gRPC-initiated task, they are typically rejected or logged as unexpected.
        *   Calls like `sendUserInput`, `submitAskResponse`, `deleteTaskWithId` from a `clientId` that does not have a task in `clientTaskMap` will fail, with logs indicating that Cline is likely user-controlled or the gRPC session is invalid/inactive.
        *   `deleteTaskWithId` specifically checks if the `clientId` "owns" the task in `clientTaskMap` before allowing deletion, preventing gRPC clients from deleting tasks initiated by the user or other gRPC clients.
        *   The primary purpose in this mode is to log unexpected gRPC activity and potentially (future) allow observation of user-driven tasks without interference.
*   **Protobuf Structure Mirroring:** Proto messages must match `WebviewMessage.ts` structures.

## 4. Data Flow
1.  **In (Client -> Cline):** gRPC Client -> `GrpcServer` -> `GrpcBridge` -> `Controller`/`Task`.
2.  **Out (Cline -> External Systems & Webview):**
    *   `Task.say()` -> `Controller.postMessageToWebview()` (this call is now to the `GrpcBridge` wrapper).
    *   **Inside `GrpcBridge.getWrappedPostMessage`:**
        *   **gRPC Processing (if `clientId` and `taskId` identified):**
            *   If `message.type === 'partialMessage'` (with `say: "text"`, `"reasoning"`, or `"completion_result"`) OR `message.type === 'say'` (with same `say` subtypes and a `ts`):
                *   `GrpcBridge.handleAndCleanGrpcPartialMessage` is called.
                *   Content is accumulated in `grpcCleanMessageAggregator` with de-duplication.
                *   If the message (or final partial) is complete:
                    *   The cleaned, full message is retrieved.
                    *   `GrpcBridge` -> `GrpcNotifier.emit('newChatMessage')` -> `GrpcServer` -> gRPC Client (sends single, cleaned, complete `ClineMessage` via `ExtensionMessage.new_chat_message`).
            *   If `message.error` is present:
                *   `GrpcNotifier.emit('error', ...)` is called.
            *   If `message.type === 'state'`:
                *   New, complete messages from `state.clineMessages` not yet sent are processed by `handleAndCleanGrpcPartialMessage` (if text/reasoning/completion) or sent directly via `newChatMessage` (for other types like tool calls).
        *   **Webview Processing (Always Occurs):**
            *   The original `originalPostMessage(message, taskId)` is called, sending the unaltered message (partial or complete) to the VSCode webview.
    *   Other direct events for gRPC (e.g., `taskStarted` from `initTask`) are also emitted via `GrpcNotifier`.

# System Patterns: Cline gRPC Integration

## 1. Core Architecture

The integration introduces a `GrpcBridge` component that acts as an intermediary between the external gRPC world and the internal Cline extension core (`Controller`, `Task`).

```mermaid
graph LR
    subgraph External System
        GrpcClient[gRPC Client (e.g., Go Backend)]
    end

    subgraph Cline Extension (VSCode)
        GrpcServer[gRPC Server (server.ts)]
        GrpcBridge[GrpcBridge (grpc/GrpcBridge.ts)]
        Controller[Controller (core/controller)]
        Task[Task (core/task)]
        WebviewProvider[WebviewProvider (core/webview)]
    end

    GrpcClient -- gRPC --> GrpcServer
    GrpcServer -- Callbacks/Notifier --> GrpcBridge
    GrpcBridge -- Calls --> Controller
    GrpcBridge -- Calls/Injects --> Task
    Controller -- Manages --> Task
    Controller -- Sends Messages --> WebviewProvider
    GrpcBridge -- Intercepts/Wraps --> WebviewProvider

    style GrpcBridge fill:#ccf,stroke:#333,stroke-width:2px
```

## 2. Key Components & Interactions

*   **`proto/`**: Contains Protobuf definitions for the gRPC service (`task_control.proto`, etc.). These define the contract between the external client and the Cline gRPC server.
*   **`src/services/grpc/server.ts`**: Implements the gRPC server logic. It uses a callback interface (`GrpcServerCallbacks`) for incoming requests and provides a notifier interface (`GrpcTaskNotifier`) for sending messages back to the client.
*   **`src/services/grpc/mapper.ts` & `utils.ts`**: Handle the translation between Cline's internal data structures and the Protobuf message types.
*   **`src/services/grpc/GrpcBridge.ts`**:
    *   Initialized in `src/extension.ts`.
    *   Starts the `GrpcServer` and provides implementations for `GrpcServerCallbacks` (including `handleClientDisconnect`).
    *   Receives the `GrpcTaskNotifier` to send messages out.
    *   Manages a mapping (`clientTaskMap`) between external `clientId`s and internal `Task` instances.
    *   Listens for `Task.onDispose` events to clean up `clientTaskMap`.
    *   Translates incoming gRPC requests into calls on the `Controller` or the specific `Task` instance (retrieved via `clientTaskMap`).
    *   **Crucially:** Only provides input to a `Task` via `handleWebviewAskResponse` when the task is explicitly waiting (via `ask()`).
    *   Intercepts outgoing messages (via wrapped `postMessageToWebview`) using the `taskId` to route messages to the correct gRPC client or the webview.
*   **`src/extension.ts`**: Responsible for initializing and disposing of the `GrpcBridge`.
*   **`src/core/controller/index.ts` (`Controller`)**: The core state manager. `GrpcBridge` interacts with it to initiate tasks. `postMessageToWebview` signature updated to include `taskId`.
*   **`src/core/task/index.ts` (`Task`)**: Represents an active agent task. Includes an `EventEmitter` to signal disposal via `onDispose`. `abortTask` triggers this event. Call sites for `postMessageToWebview` updated to pass `taskId`.
*   **`src/core/webview/index.ts` (`WebviewProvider`)**: Standard UI communication channel. Receives messages routed by the `GrpcBridge` wrapper if they are not intended for a gRPC client.

## 3. Design Patterns & Decisions

*   **Bridge Pattern:** `GrpcBridge` acts as a bridge between the gRPC interface and the Cline core.
*   **Callback/Notifier:** The gRPC server uses callbacks for incoming actions and a notifier object for outgoing messages.
*   **Event Emitter (Observer Pattern):** `Task` uses an `EventEmitter` for disposal notification, allowing `GrpcBridge` to observe and react.
*   **Dependency Injection (Implicit):** `extension.ts` injects dependencies into `GrpcBridge`.
*   **Message Interception (Wrapper/Decorator):** `GrpcBridge` wraps `Controller.postMessageToWebview`. The wrapper uses the `taskId` provided in the message call to look up the `clientId` in `clientTaskMap` and route accordingly.
*   **State Management:** `GrpcBridge` maintains the `clientId`-to-`Task` mapping, with cleanup handled via the `onDispose` listener.
*   **Strictly Passive Interface (Pull-Based Interaction):** The gRPC client interaction model MUST strictly mirror the webview's pull-based model. The `GrpcBridge` acts solely as a passive interface. It MUST NOT initiate actions or modify internal `Task` state directly. It only provides input back to the `Task` (via `handleWebviewAskResponse`) when, and only when, the `Task` is explicitly waiting for input via an `ask()` call. Unsolicited inputs or attempts to trigger internal actions are forbidden.
*   **Protobuf Structure Mirroring:** The Protobuf message definitions (especially those related to `WebviewMessage` payloads like `AskPayload`, `SayPayload`, etc.) MUST precisely mirror the structure and types defined in `src/shared/WebviewMessage.ts`. This ensures consistency and simplifies the mapping layer (`grpc-mapper.ts`).

## 4. Data Flow Summary

1.  **Incoming (Client -> Cline):** gRPC Client -> `GrpcServer` -> `GrpcBridge` (Callback) -> `Controller`/`Task`
2.  **Outgoing (Cline -> Client):** `Controller`/`Task` -> `GrpcBridge` (Interceptor/Wrapper) -> `GrpcTaskNotifier` -> `GrpcServer` -> gRPC Client

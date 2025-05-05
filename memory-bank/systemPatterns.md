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
*   **`src/services/grpc/GrpcBridge.ts` (New)**:
    *   Initialized in `src/extension.ts`.
    *   Starts the `GrpcServer` and provides implementations for `GrpcServerCallbacks`.
    *   Receives the `GrpcTaskNotifier` to send messages out.
    *   Manages a mapping between external `clientId`s and internal `Task` instances.
    *   Translates incoming gRPC requests into calls on the `Controller` or `Task`.
    *   Intercepts outgoing messages (intended for the webview) from `Controller`/`Task` that belong to gRPC-controlled tasks and forwards them via the `GrpcTaskNotifier`.
*   **`src/extension.ts`**: Responsible for initializing and disposing of the `GrpcBridge`.
*   **`src/core/controller/index.ts` (`Controller`)**: The core state manager. The `GrpcBridge` will interact with it to initiate tasks and potentially handle some incoming messages.
*   **`src/core/task/index.ts` (`Task`)**: Represents an active agent task. The `GrpcBridge` needs to interact with the relevant `Task` instance to inject responses (like tool results or answers to `ask` prompts).
*   **`src/core/webview/index.ts` (`WebviewProvider`)**: The standard way Cline communicates with its UI. The `GrpcBridge` needs a mechanism to intercept messages destined for the webview *if* they originate from a task controlled by gRPC.

## 3. Design Patterns & Decisions

*   **Bridge Pattern:** `GrpcBridge` acts as a bridge between the gRPC interface and the Cline core.
*   **Callback/Notifier:** The gRPC server uses callbacks for incoming actions and a notifier object for outgoing messages, decoupling the server logic from the bridge implementation.
*   **Dependency Injection (Implicit):** `extension.ts` injects necessary dependencies (like `ExtensionContext`, potentially `WebviewProvider` or its `postMessage` function) into `GrpcBridge`.
*   **Message Interception:** A key challenge is intercepting outgoing messages non-invasively. The preferred approach is likely wrapping the `postMessage` function passed to the `Controller` during initialization in `extension.ts`. This wrapper, provided by `GrpcBridge`, checks the task context (`clientId`) before deciding whether to route the message via gRPC or to the actual webview.
*   **State Management:** The `GrpcBridge` maintains the `clientId`-to-`Task` mapping.

## 4. Data Flow Summary

1.  **Incoming (Client -> Cline):** gRPC Client -> `GrpcServer` -> `GrpcBridge` (Callback) -> `Controller`/`Task`
2.  **Outgoing (Cline -> Client):** `Controller`/`Task` -> `GrpcBridge` (Interceptor/Wrapper) -> `GrpcTaskNotifier` -> `GrpcServer` -> gRPC Client

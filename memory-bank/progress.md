# Progress: Cline gRPC `StartTask` RPC Fix

## 1. What Works

*   **Protobuf Generation:** `npm run protos` successfully generates TypeScript/Go code.
*   **gRPC Server (`server.ts`):**
    *   Basic server setup, service registration, stream handling, and callback routing structure are in place.
    *   Successfully handles `UpdateSettings` RPC, and the Go client receives the `DID_UPDATE_SETTINGS` confirmation.
    *   Logging to `/tmp/grpc_server_debug.log` is functional.
    *   **Server-side `StartTask` sends `TASK_STARTED`:** The server correctly constructs and sends the `TASK_STARTED` message with `taskId` and `version` after `initTask` completes.
*   **gRPC Mapper (`mapper.ts`):** Initial mapping logic exists.
*   **`GrpcBridge` Component (`src/services/grpc/GrpcBridge.ts`):**
    *   Basic structure, instantiation, controller registration, server startup, and message interception logic are in place.
    *   `initTask` method modified to return `Promise<Task | undefined>` and the `taskInstance` directly.
    *   `GrpcServerCallbacks` interface updated for the new `initTask` signature.
    *   `StartTask` RPC handler refactored to directly use the result of `initTask` to send `TASK_STARTED` and set up task-specific event listeners.
    *   Construction of `ExtensionMessage` objects for `TASK_STARTED`, `ERROR`, and listener messages within `StartTask` simplified (attempted fix for payload issue).
*   **`Task` Class (`src/core/task/index.ts`):**
    *   Added `isDisposed: boolean` property, initialized to `false` and set to `true` in `abortTask`.
*   **Extension Integration:** `GrpcBridge` is instantiated and managed within `src/extension.ts`.
*   **Go Client (`sandbox-client`):**
    *   Successfully connects to the gRPC server.
    *   `UpdateSettings` test passes.
    *   Receives the `TASK_STARTED` message *type* from the server.

## 2. What's Left to Build (Prioritized)

1.  **(Debugging) `StartTask` RPC - Go Client Payload Parsing:** Investigate why the Go client receives the `TASK_STARTED` message type but its `TaskStartedInfo` payload is `nil`. This is the immediate blocker.
2.  **(Testing) `SendUserInput` RPC:** If `StartTask` payload issue is resolved, test the `SendUserInput` flow.
3.  **(Verification) Type Mapping:** Rigorously verify `mapper.ts` for all message types, especially around `oneof` fields.
4.  **(Refinement) Error Handling:** Improve gRPC error reporting from `GrpcBridge` and `server.ts`.
5.  **(Refinement) Full Task Lifecycle:** Ensure robust handling of task completion, cancellation from client, and server-side errors within the gRPC stream.

## 3. Current Status

*   **`StartTask` RPC:**
    *   Server-side logic in `GrpcBridge.ts` correctly sends the `TASK_STARTED` message with payload.
    *   Go client receives the message type `TASK_STARTED` but fails to access/parse the `TaskStartedInfo` payload (it appears as `nil`).
    *   Simplifying `ExtensionMessage` construction in `GrpcBridge.ts` (removing explicit `undefined` for other `oneof` fields) did **not** resolve the `nil` payload issue on the client.
*   **Next:** The AI will analyze the Go client code (`sandbox-client/grpc_client_test_logic.go`) to understand how it's trying to access the `oneof` payload, then propose a fix.

## 4. Known Issues / Blockers

*   **Go Client `TASK_STARTED` Payload Issue:** The Go client receives the `TASK_STARTED` message type but its `TaskStartedInfo` payload is `nil`. This prevents the client from extracting the `taskId` and proceeding.
*   **`SendUserInput` Logic:** The `handleUserInput` in `GrpcBridge.ts` has a check `if (task.askResponse === undefined)` which might be problematic if the task isn't immediately in an "ask" state after `StartTask`. This will be the next area to debug if `TASK_STARTED` payload issue is resolved.
*   **Unimplemented Services:** Calls to `BrowserService`, `CheckpointsService`, and `McpService` from the Go client are expected to fail with "Unimplemented" as they are not the current focus.
*   **Incomplete Type Mapping:** `mapClineMessageToProto` and `mapExtensionStateToProto` need full verification.

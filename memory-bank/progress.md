# Progress: gRPC Deserialization and Server Startup Troubleshooting

## 1. What Works

*   **Protobuf Generation:** `npm run protos` successfully generates TypeScript/Go code using `outputServices=grpc-js`.
*   **gRPC Server (`server.ts`):**
    *   Server setup, service registration (using `*ServiceService` imports), stream handling, and callback routing structure are in place.
    *   Logging to `/tmp/grpc_server_debug.log` is functional.
*   **`GrpcBridge` Component (`src/services/grpc/GrpcBridge.ts`):**
    *   Basic structure, instantiation, controller registration, server startup, and message interception logic are in place.
    *   `initTask` method modified to return `Promise<Task | undefined>` and the `taskInstance` directly.
    *   RPC handler keys in `createTaskControlImplementation` (e.g., `updateSettings`, `startTask`) are now camelCase, matching `@grpc/grpc-js` expectations.
*   **Extension Integration:** `GrpcBridge` is instantiated and managed within `src/extension.ts`.
*   **Go Client (`sandbox-client`):**
    *   Successfully connects to the gRPC server.
    *   `UpdateSettings` RPC call is now successful, and the client receives `DID_UPDATE_SETTINGS`.
*   **`proto/task_control.proto`:** `TaskStartedInfo task_started` field moved out of `oneof payload` to be a direct optional field in `ExtensionMessage`.
*   **`webview-ui/src/services/grpc-client.ts`:** Mock client updated for new service definitions.

## 2. What's Left to Build (Prioritized)

1.  **(Testing & Debugging) `StartTask` RPC - Go Client Payload Parsing:**
    *   Verify the `StartTask` RPC call is now successful (no "Unimplemented" error).
    *   Investigate if the Go client correctly receives and parses the `TaskStartedInfo` payload (now a direct field) from the `ExtensionMessage`. This was the original deserialization issue.
2.  **(Testing) `SendUserInput` RPC:** If `StartTask` payload issue is resolved, test the `SendUserInput` flow.
3.  **(Verification) Type Mapping:** Rigorously verify `mapper.ts` for all message types.
4.  **(Refinement) Error Handling:** Improve gRPC error reporting from `GrpcBridge` and `server.ts`.
5.  **(Refinement) Full Task Lifecycle:** Ensure robust handling of task completion, cancellation from client, and server-side errors within the gRPC stream.

## 3. Current Status

*   **`UpdateSettings` RPC:** Working correctly.
*   **`StartTask` RPC:**
    *   The "Unimplemented" error for `startTask` (camelCase) should now be resolved due to the handler key fix in `GrpcBridge.ts`.
    *   **Next Test:** Verify if the Go client receives the `TASK_STARTED` message and can access its `task_started` payload (which is now a direct field, not part of a `oneof`).
*   **Build & Test Cycle:** The `docker compose up` command was interrupted. Waiting for new logs to confirm the latest changes.

## 4. Known Issues / Blockers

*   **Original `TaskStartedInfo` Deserialization:** The core issue of the Go client potentially receiving a `nil` `task_started` payload (even as a direct field) needs to be verified in the next test run. If it persists, the problem is likely in how the message is constructed on the server or deserialized on the client, independent of the `oneof` or RPC method naming.
*   **`SendUserInput` Logic:** The `handleUserInput` in `GrpcBridge.ts` has a check `if (task.askResponse === undefined)` which might be problematic. This is a lower priority until `StartTask` is fully working.
*   **Unimplemented Services:** Calls to `BrowserService`, `CheckpointsService`, and `McpService` from the Go client are still expected to fail with "Unimplemented".
*   **Incomplete Type Mapping:** `mapClineMessageToProto` and `mapExtensionStateToProto` need full verification.

# Progress: gRPC Deserialization and Server Startup Troubleshooting

## 1. What Works

*   **Protobuf Generation:** `npm run protos` successfully generates TypeScript/Go code using `outputServices=grpc-js`.
*   **gRPC Server (`server.ts`):**
    *   Server setup, service registration (using `*ServiceService` imports), stream handling, and callback routing structure are in place.
    *   Logging to `/tmp/grpc_server_debug.log` is functional (when server starts).
*   **`GrpcBridge` Component (`src/services/grpc/GrpcBridge.ts`):**
    *   Basic structure, instantiation, controller registration, server startup logic, and message interception are in place.
    *   `initTask` method returns `Promise<Task | undefined>` and the `taskInstance` directly.
    *   RPC handler keys for `updateSettings`, `startTask`, and `sendUserInput` in `createTaskControlImplementation` are camelCase.
    *   `sendUserInput` gRPC handler signature corrected to server-streaming and uses `InvokeRequest`.
    *   `handleUserInput` method now allows unprompted input (removed `task.askResponse === undefined` check).
*   **Extension Integration:** `GrpcBridge` is instantiated and managed within `src/extension.ts`.
*   **Go Client (`sandbox-client`):**
    *   Successfully connects to the gRPC server (when server starts).
    *   `UpdateSettings` RPC call is successful, client receives `DID_UPDATE_SETTINGS`.
    *   `StartTask` RPC call is successful (no "Unimplemented" error).
    *   Go client correctly receives and deserializes the `TaskStartedInfo` payload (as a direct field) from the `ExtensionMessage`.
*   **`proto/task_control.proto`:** `TaskStartedInfo task_started` field is a direct optional field in `ExtensionMessage`, resolving original deserialization issue.
*   **`webview-ui/src/services/grpc-client.ts`:** Mock client updated for new service definitions.

## 2. What's Left to Build (Prioritized)

1.  **(Debugging) gRPC Server Startup in Docker:**
    *   Investigate and resolve why the Cline extension's gRPC server fails to start or be detected by the Go client within the Docker container. This currently results in a 120s timeout in `sandbox-client/entrypoint.sh`.
    *   Focus on analyzing `/tmp/grpc_server_debug.log` from a failed run.
2.  **(Testing) `SendUserInput` RPC End-to-End:** Once the server startup is reliable, test the full `SendUserInput` flow, including the AI processing the input and sending responses back via the `StartTask` stream.
3.  **(Verification) Type Mapping:** Rigorously verify `mapper.ts` for all message types involved in active RPCs.
4.  **(Refinement) Error Handling:** Improve gRPC error reporting from `GrpcBridge` and `server.ts` for robustness.
5.  **(Refinement) Full Task Lifecycle:** Ensure robust handling of task completion, cancellation from client, and server-side errors within the gRPC stream for all implemented RPCs.

## 3. Current Status

*   **`UpdateSettings` RPC:** Working correctly.
*   **`StartTask` RPC & `TaskStartedInfo` Payload:** Working correctly. Go client receives and parses the payload.
*   **`sendUserInput` RPC:**
    *   Handler implementation in `GrpcBridge.ts` (method name, signature, request type, image access, unprompted input logic) is corrected.
    *   End-to-end functionality (including AI response) is **blocked** by the current gRPC server startup/detection issue in Docker.
*   **Build & Test Cycle:** The latest `docker compose up` command resulted in the `sandbox-client-1` container timing out after 120 seconds, as it could not detect the gRPC server starting.

## 4. Known Issues / Blockers

*   **Primary Blocker: gRPC Server Startup/Detection Timeout in Docker:** The Cline extension's gRPC server is not starting or being detected reliably within the Docker container.
*   **Unimplemented Services:** Calls to `BrowserService`, `CheckpointsService`, and `McpService` from the Go client are still expected to fail with "Unimplemented". This is lower priority.
*   **Incomplete Type Mapping:** `mapClineMessageToProto` and `mapExtensionStateToProto` in `mapper.ts` need full verification for all message types that will be used. This is lower priority until core RPCs are stable.
*   **Linting Warnings:** Several ESLint warnings exist in `GrpcBridge.ts` and `mapper.ts` (mostly missing curly braces). These are non-blocking.

# Progress: gRPC Server Startup in Docker (Summary)

## 1. What Works
*   **Proto Gen:** `npm run protos` with `outputServices=grpc-js` OK.
*   **gRPC Server (`server.ts`):** Setup, service registration, stream/callback routing, logging to `/tmp/grpc_server_debug.log` (when server starts) OK.
*   **`GrpcBridge.ts`:** Structure, init, controller registration, server start, message interception OK. `initTask` returns `Task`. RPC handlers (camelCase), `sendUserInput` (streaming, `InvokeRequest`, unprompted input) OK.
*   **Extension Integration:** `GrpcBridge` init/dispose in `extension.ts` OK.
*   **Go Client (`sandbox-client`):** Connects (when server up), `UpdateSettings` RPC OK (gets `DID_UPDATE_SETTINGS`), `StartTask` RPC OK. Correctly deserializes `TaskStartedInfo` (direct field).
*   **`proto/task_control.proto`:** `TaskStartedInfo` as direct optional field in `ExtensionMessage` OK.
*   **`webview-ui/.../grpc-client.ts`:** Mock client updated.

## 2. What's Left (Prioritized)
1.  **(Debugging) gRPC Server Startup in Docker:** Resolve server start/detection failure (120s timeout in `entrypoint.sh`). Analyze `/tmp/grpc_server_debug.log` from failed run.
2.  **(Testing) `SendUserInput` RPC E2E:** Test full flow (AI processing, response via `StartTask` stream) once server is reliable.
3.  **(Verification) Type Mapping:** Rigorously verify `mapper.ts` for active RPCs.
4.  **(Refinement) Error Handling:** Improve gRPC error reporting.
5.  **(Refinement) Full Task Lifecycle:** Robustly handle task completion, client cancellation, server errors in gRPC streams.

## 3. Current Status
*   **`UpdateSettings` RPC:** Working.
*   **`StartTask` RPC & `TaskStartedInfo`:** Working.
*   **`sendUserInput` RPC:** Handler logic corrected. E2E test **blocked** by Docker gRPC server startup issue.
*   **Build & Test:** Last `docker compose up` -> 120s timeout (gRPC server not detected).

## 4. Known Issues / Blockers
*   **Primary Blocker: gRPC Server Startup/Detection Timeout in Docker.**
*   **Unimplemented Services:** `BrowserService`, `CheckpointsService`, `McpService` calls from Go client will fail (lower priority).
*   **Incomplete Type Mapping:** `mapClineMessageToProto`, `mapExtensionStateToProto` in `mapper.ts` need full verification (lower priority).
*   **Linting Warnings:** Minor, non-blocking.

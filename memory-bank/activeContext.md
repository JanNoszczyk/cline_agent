# Active Context: gRPC Deserialization and Server Startup Troubleshooting

## 1. Current Focus

Troubleshoot a gRPC server startup failure within the Cline VSCode extension when run in a Docker container. The Go client (`sandbox-client`) is timing out (after 120s) waiting for the Node.js gRPC server to become available on `localhost:50051`. This issue emerged after successfully fixing several prior gRPC communication problems.

## 2. Problem History Recap

*   **Original Problem:** Go client received `nil` for `TaskStartedInfo` payload (initially in a `oneof`, then moved to a direct field). This was **resolved** by making `TaskStartedInfo` a direct optional field in `proto/task_control.proto`.
*   **gRPC Server Startup Issue (Initial):** Node.js gRPC server failed to start due to `ts-proto`'s `outputServices=generic-definitions`. **Resolved** by changing to `outputServices=grpc-js` and updating service imports in `src/services/grpc/server.ts` and `webview-ui/src/services/grpc-client.ts`.
*   **"Unimplemented" RPC Method Errors:** Go client reported "Unimplemented" for `updateSettings` and `startTask`. **Resolved** by changing handler keys in `src/services/grpc/GrpcBridge.ts` from PascalCase to camelCase.
*   **`sendUserInput` RPC Issues:**
    *   "Unimplemented" error. **Resolved** by changing handler key to `sendUserInput` (camelCase).
    *   Mismatch between unary handler and streaming proto definition. **Resolved** by updating `sendUserInput` handler in `GrpcBridge.ts` to be server-streaming.
    *   Incorrect type for `call.request` in `sendUserInput` handler. **Resolved** by changing type from `UserInputRequest` to `InvokeRequest`.
    *   Incorrect access to images in `sendUserInput` handler (`request.chatContent?.images`). **Resolved** by changing to `request.images`.
    *   `handleUserInput` in `GrpcBridge.ts` was too restrictive (threw error if task not in `ask()` state). **Resolved** by removing the `if (task.askResponse === undefined)` check.

## 3. Recent Changes (This Session)

*   **`src/services/grpc/GrpcBridge.ts`:**
    *   Corrected `sendUserInput` gRPC handler to be server-streaming (`grpc.ServerWritableStream<taskControlPb.InvokeRequest, ...>`).
    *   Corrected type of `request` in `sendUserInput` handler to `taskControlPb.InvokeRequest`.
    *   Corrected image access in `sendUserInput` handler to `request.images`.
    *   Removed the `if (task.askResponse === undefined)` check from `handleUserInput` to allow unprompted input.
*   **Build & Test Cycle:**
    *   Ran `bash scripts/update-sandbox-vsix.sh` to rebuild the extension (successful).
    *   Ran `docker compose up --build --force-recreate sandbox-client`. This command resulted in the `sandbox-client-1` container timing out after 120 seconds, as it could not detect the gRPC server starting.

## 4. Next Steps (Current)

1.  **Investigate gRPC Server Startup Timeout:**
    *   The immediate priority is to understand why the Cline extension's gRPC server is not starting (or not being detected by the Go client) in the Docker environment.
    *   **Action:** Attempt to retrieve and analyze the contents of `/tmp/grpc_server_debug.log` from *within the Docker container* during or immediately after a failed startup attempt. The `sandbox-client/entrypoint.sh` script attempts to `cat` this log, but it might not capture it if the script exits too early due to the timeout.
    *   If the log is empty or doesn't show the server attempting to bind/start, the issue is likely early in the extension activation or `GrpcBridge` initialization.
    *   If the log shows bind/start errors, those will be the focus.

2.  **Hypothesis/Plan based on gRPC server logs:**
    *   **If server logs show errors:** Address the specific errors (e.g., port conflicts, issues loading protos, problems in `GrpcBridge` constructor or `setController`).
    *   **If server logs are missing or incomplete:** Suspect an issue with extension activation itself or a very early crash in `GrpcBridge` or `server.ts` before logging is fully set up or flushed. This might require adding more verbose logging at the very beginning of `extension.ts` and `GrpcBridge.ts` constructor.
    *   **If server logs look normal but client still times out:** Could indicate a subtle Docker networking issue (less likely as it worked before) or a problem with how `nc -z` in `entrypoint.sh` detects the port.

## 5. Active Decisions & Considerations

*   The `TaskStartedInfo` payload is confirmed to be working as a direct field. This approach is stable.
*   All previously identified RPC method naming and signature issues for `updateSettings`, `startTask`, and `sendUserInput` in `GrpcBridge.ts` are believed to be resolved.
*   The current blocker is the gRPC server failing to start or be detected within the Docker container, leading to a 120-second timeout in `entrypoint.sh`.
*   The `entrypoint.sh` script already includes logic to output `/tmp/grpc_server_debug.log`. The challenge is ensuring this log is captured from the *failed* run.

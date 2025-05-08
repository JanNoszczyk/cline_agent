# Active Context: gRPC Server Startup in Docker (Summary)

## 1. Current Focus
Troubleshoot gRPC server startup failure in Docker. Go client (`sandbox-client`) times out (120s) awaiting Node.js gRPC server on `localhost:50051`.

## 2. Problem History (Resolved Issues)
*   `TaskStartedInfo` `nil` payload (fixed by direct field).
*   gRPC server start failure (`ts-proto` generic definitions) (fixed by `outputServices=grpc-js`).
*   "Unimplemented" RPCs (`updateSettings`, `startTask`) (fixed by camelCase handlers).
*   `sendUserInput` RPC issues (unimplemented, unary/streaming mismatch, `request` type, image access, restrictive `handleUserInput`) (all fixed).

## 3. Recent Changes
*   **`src/services/grpc/GrpcBridge.ts`:** `sendUserInput` handler corrected (streaming, `InvokeRequest`, image access, unprompted input allowed).
*   **Build & Test:** `update-sandbox-vsix.sh` successful. `docker compose up` led to 120s timeout (gRPC server not detected).

## 4. Next Steps
1.  **Investigate gRPC Server Startup Timeout:**
    *   Analyze `/tmp/grpc_server_debug.log` from *within the Docker container* of a failed run.
    *   If log empty/no start attempt: Issue in extension activation or early `GrpcBridge` init.
    *   If log shows bind/start errors: Focus on those errors.
2.  **Hypothesis/Plan (based on logs):**
    *   **Errors in log:** Address specific errors (port conflicts, proto loading, `GrpcBridge` init).
    *   **Missing/incomplete log:** Suspect early crash; add verbose logging to `extension.ts`, `GrpcBridge.ts`.
    *   **Normal log, client timeout:** Docker networking or `nc -z` detection issue (less likely).

## 5. Active Decisions
*   `TaskStartedInfo` as direct field is stable.
*   Previous RPC handler issues (naming, signatures) are resolved.
*   **Current Blocker:** gRPC server not starting/detected in Docker.
*   `entrypoint.sh` outputs `/tmp/grpc_server_debug.log`; need to ensure capture from *failed* run.

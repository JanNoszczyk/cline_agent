# Active Context: Cline gRPC `StartTask` RPC Fix

## 1. Current Focus

The primary focus has shifted to resolving why the Go gRPC client (`sandbox-binary`) receives the `TASK_STARTED` message from Cline's gRPC server but fails to parse/access its payload (specifically `taskId` and `version`), resulting in a timeout.

## 2. Problem History Recap

*   Initially, the Go client's `StartTask` test timed out waiting for any `TASK_STARTED` message. This was attributed to a timing issue with event emission vs. listening in `GrpcBridge.ts`.
*   Refactoring `GrpcBridge.ts` to directly send `TASK_STARTED` after `initTask` successfully made the server send the message.
*   **Current Issue:** The Go client now receives the `TASK_STARTED` message *type*, but the `TaskStartedInfo` payload within it appears as `nil` to the client, leading to a continued timeout as it cannot extract the `taskId`.

## 3. Recent Changes (This Session)

*   **`src/services/grpc/GrpcBridge.ts`:**
    *   **`initTask` method:**
        *   Modified to return `Promise<Task | undefined>` and the `taskInstance` directly.
        *   Removed `taskInitialized` event emission.
    *   **`StartTask` RPC Handler:**
        *   Refactored to `await this.initTask(...)`.
        *   If successful, immediately sends `TASK_STARTED` using the returned `taskInstance.taskId`.
        *   Sets up task-specific listeners on `grpcNotifier` for subsequent messages and uses `taskInstance.onDispose()` for cleanup.
    *   **`ExtensionMessage` Construction (Attempted Fix):**
        *   Simplified the construction of `ExtensionMessage` objects (for `TASK_STARTED`, `ERROR`, and listener messages within `StartTask`) by only including the `type` and the specific `oneof` payload field, omitting other `undefined` `oneof` fields. This was an attempt to address the `nil` payload issue on the Go client. **This change did not resolve the nil payload issue.**

*   **`src/core/task/index.ts` (`Task` class):**
    *   Added `public isDisposed = false;`.
    *   `abortTask()` now sets `this.isDisposed = true;`.

## 4. Next Steps

1.  **AI Action (Memory Bank):** Update all Memory Bank files to reflect the current state (this step).
2.  **AI Action (Analysis):** Examine the Go client code (`sandbox-client/grpc_client_test_logic.go`) to understand how it attempts to access the `TaskStartedInfo` payload from the `ExtensionMessage`'s `oneof` field.
3.  **AI Action (Hypothesis):** Formulate a hypothesis for why the Go client sees a `nil` payload (e.g., incorrect field access method for `oneof` in Go, subtle serialization/deserialization mismatch between `ts-proto` and Go Protobuf).
4.  **AI Action (Plan):** Propose changes to either the Go client or, if necessary, further adjustments to the server-side message construction or Protobuf definitions based on the Go client analysis.
5.  **User Action:** Implement proposed changes.
6.  **User Action:** Re-run build and test:
    *   `bash scripts/update-sandbox-vsix.sh`
    *   `docker compose build --no-cache sandbox-client`
    *   `docker compose up --force-recreate -d sandbox-client`
7.  **User Action:** Provide new Docker logs.
8.  **AI Action:** Analyze logs and iterate.

## 5. Active Decisions & Considerations

*   The issue is likely related to how `oneof` payloads are handled/accessed between `ts-proto` (server-side JavaScript/TypeScript) and Go's Protobuf libraries (client-side).
*   Simplifying the `ExtensionMessage` construction on the server by removing explicit `undefined` fields for the `oneof` did not fix the problem, suggesting the issue is not merely about extraneous `undefined` fields but potentially about the fundamental way the `oneof` is structured or accessed.
*   The server-side logs consistently show the `TASK_STARTED` message being prepared with the correct `taskId` and `version` before being written to the stream.

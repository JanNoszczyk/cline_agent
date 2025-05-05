# Active Context: Task Handoff Mechanism Implementation

## 1. Current Focus
Implementation of a "passive observation" mode for Cline's gRPC server. This mode is for when Cline is user-controlled via the webview, not actively managed by a gRPC client.

## 2. Problem History (Context from Previous Tasks)
*   **Previous Session (E2E Test Debugging):** Focused on fixing E2E tests for *active* gRPC control. This involved ensuring `CancelTask` worked correctly, resolving a hang in the "calculator app" test stage by ensuring `ASK TOOL` messages were sent with `partial: false`, and identifying that a gRPC server binding error was due to a superfluous startup attempt.
*   **Task Handoff Mechanism:** Implemented and verified core components for handing off tasks between different Cline instances using gRPC `ResumeLatestTask`.
*   **Import Path Corrections:** Resolved issues with telemetry and feature flag service imports.

## 3. Recent Changes & Current State (Passive gRPC Mode - 2025-05-22)
*   **Objective:** Adapt the gRPC server (`GrpcBridge.ts`) to operate in a "passive observation" mode when Cline is user-controlled (i.e., no active gRPC `clientId` is managing tasks). In this mode, the gRPC server should:
    *   Remain operational and listen on its port.
    *   Log any unexpected incoming gRPC calls.
    *   Reject gRPC calls that attempt to actively control tasks if no `clientId` is mapped to an active task (e.g., `StartTask`, `sendUserInput`, `submitAskResponse`, `deleteTaskWithId` if the client doesn't "own" the task).
    *   Not interfere with user-driven tasks.
    *   The existing active gRPC control (used by E2E tests) must remain functional.
*   **`src/core/controller/index.ts`:**
    *   Added a `getTaskHistory(): Promise<HistoryItem[]>` method to allow `GrpcBridge` to check if a task ID exists in history, even if not actively mapped to a gRPC client.
*   **`src/services/grpc/GrpcBridge.ts`:**
    *   Enhanced logging in gRPC handlers (`handleToolResult`, `handleUserInput`, `submitAskResponse`, `submitOptionsResponse`) to clearly indicate when a call is received for a `clientId` that doesn't have an active, mapped task. This logging now highlights that Cline is likely user-controlled or the gRPC session is inactive/invalid.
    *   Modified `handleDeleteTaskWithId` to:
        *   Check if the requesting `clientId` "owns" the task (i.e., the `taskId` is currently mapped to this `clientId` in `clientTaskMap`).
        *   If not owned, it checks if the task exists in the broader task history (using the new `controller.getTaskHistory()`).
        *   If the task exists in history but is not owned by the requesting client, the deletion is denied with a "Permission denied" error.
        *   If the task does not exist in history, a "Task not found" error is returned.
    *   These changes ensure that gRPC clients cannot interfere with tasks they don't manage, which is crucial for the passive mode when users are controlling Cline via the webview.
*   **Conclusion:** The core logic for the passive observation mode in `GrpcBridge.ts` is implemented. The gRPC server will now behave more appropriately when Cline is user-controlled, primarily by logging unexpected calls and preventing unauthorized actions on tasks.

## 4. Next Steps (Prioritized)
1.  **(Testing) Verify Passive Observation Mode:**
    *   Manually test scenarios where Cline is user-controlled (no active gRPC client like the E2E test runner).
    *   Attempt to send gRPC calls (e.g., `StartTask`, `sendUserInput` to a non-existent/unmapped task, `deleteTaskWithId` for a user-initiated task) from an external gRPC tool (like a simple Go client or `grpcurl`).
    *   Verify that these calls are logged as unexpected by `GrpcBridge.ts` and that they are either rejected or do not interfere with the user's active Cline session.
    *   Verify that `deleteTaskWithId` correctly prevents deletion of tasks not owned by the gRPC client.
2.  **(Testing) Verify E2E Tests Still Pass:**
    *   Run `bash scripts/run-sandbox-docker.sh` to ensure the existing E2E tests (which use active gRPC control) are not broken by these changes.
    *   Analyze logs to confirm expected behavior.
3.  **(Documentation) Update Memory Bank:**
    *   Update this file (`memory-bank/activeContext.md`) to reflect the implementation and testing results of the passive observation mode.
    *   Update `memory-bank/progress.md` with the status of this feature.
4.  **(Refinement) Logging & Error Messages:** Review and refine logging messages in `GrpcBridge.ts` for clarity in both active and passive modes.
5.  **(Consideration) Explicit Passive Mode Flag:** Evaluate if an explicit "passive mode" flag (e.g., set at extension startup if no specific gRPC control environment is detected) would be beneficial for even clearer differentiation in `GrpcBridge.ts`, though current `clientId` mapping largely achieves this.

## 5. Active Decisions & Considerations
*   **Passive Mode Definition:** Passive mode is implicitly active when no gRPC `clientId` has an active task mapped in `GrpcBridge.ts`. The gRPC server still runs, but its handlers are now more defensive against calls that would interfere with user control.
*   **Task Ownership for Deletion:** The `handleDeleteTaskWithId` method now enforces that a gRPC client can only delete tasks it actively manages via `clientTaskMap`. This protects user-initiated tasks.
*   **Logging:** Enhanced logging in gRPC handlers will provide better insight into unexpected or misdirected gRPC calls, especially when Cline is user-controlled.

# Active Context: Cline gRPC Bridge Implementation & Refactoring

# Active Context: Cline gRPC Bridge Implementation & Refactoring

## 1. Current Focus

Continue addressing issues identified during the gRPC bridge review. Based on user feedback, the priority is now to ensure the bridge only interacts with the `Task` class via existing, safe mechanisms, specifically responding only when the `Task` explicitly `ask()`s for input.

## 2. Review Findings Summary (Recap)

1.  ~~**Unsafe State Manipulation (Highest Priority):** `GrpcBridge.handleToolResult` and `GrpcBridge.handleUserInput` directly modify internal `Task` properties.~~ (Addressed by changing approach)
2.  **Fragile Message Routing:** `postMessageToWebview` wrapper relies on the *controller's active task* ID.
3.  **Inadequate Task Lifecycle Handling:** Lack of `Task` disposal and client disconnection handling.
4.  **Incorrect Task Context Usage:** Some callbacks (`handleClearTask`, `handleCancelTask`) target the active UI task.
5.  **Timestamp Mapping Errors:** `mapper.ts` sends numbers instead of `Timestamp` objects.
6.  **Incomplete/Risky Type Mapping:** `ProtoClineMessage` `oneof` mapping incomplete; casting needs validation.

## 3. Recent Changes (gRPC Refactoring Cycle)

*   **gRPC Implementation Review:** Completed.
*   **Refined `GrpcBridge` Interaction:** Updated `GrpcBridge.ts` based on user feedback:
    *   `handleToolResult` now logs a warning and does nothing, assuming tool execution is internal.
    *   `handleUserInput` now checks if the `Task` is waiting for an `ask` response. If not, it throws an error; otherwise, it uses the safe `task.handleWebviewAskResponse` method.
*   **Decision:** Decided *not* to add new injection methods (`injectExternalUserInput`, `injectExternalToolResult`) to `Task.ts`, adhering to the principle of only responding to explicit `ask()` calls.
*   **Message Routing (`postMessageToWebview`):**
    *   Modified `Controller.postMessageToWebview` signature to accept optional `taskId`.
    *   Updated `GrpcBridge.getWrappedPostMessage` to use the `taskId` for routing decisions between gRPC client and webview.
    *   Updated all call sites in `Task.ts` to pass `this.taskId`.
*   **Task Lifecycle Handling:**
    *   Added `EventEmitter` and `onDispose` method to `Task` class (`src/core/task/index.ts`).
    *   Updated `GrpcBridge.initTask` to register an `onDispose` listener that removes the task from `clientTaskMap`.
    *   Added `handleClientDisconnect` callback to `GrpcBridge` and `GrpcServerCallbacks`.
    *   Updated `server.ts` (`registerClientStream`) to call `handleClientDisconnect` on stream `end`/`error`/`cancelled`.
*   **Task Context Usage:** Refactored `handleClearTask` and `handleCancelTask` in `GrpcBridge.ts` to call `task.abortTask()` directly on the specific task instance retrieved via `clientTaskMap`.
*   **Timestamp Mapping:** Corrected timestamp handling in `GrpcBridge.ts` (for `notifyAsk`) and simplified `int64` mapping in `mapper.ts` (`mapClineMessageToProto`).
*   **Type Mapping (`oneof`):** Expanded `mapClineMessageToProto` in `mapper.ts` to handle most `ask`/`say` types and their payloads using `$case`. Corrected related TS errors (camelCase, enum values, missing constant).
*   **Remaining Callbacks:** Implemented `handleApplyBrowserSettings` and `handleOpenFile` in `GrpcBridge.ts`.

## 4. Next Steps (Prioritized)

1.  **(Testing) End-to-End:** Thoroughly test the refactored gRPC communication flow using the `sandbox-client`.
2.  **(Verification) Type Mapping:** Rigorously verify that all required proto fields are handled correctly in `mapper.ts`, minimizing risky casts, especially within `mapExtensionStateToProto` and the remaining unmapped `ClineMessage` payloads.
3.  **(Refinement) Error Handling:** Improve error reporting back to the gRPC client in `GrpcBridge` and `server.ts`.
4.  **(Refinement) Controller Interaction:** Review if `controller.initTask` needs modification to better support `GrpcBridge` (e.g., accepting `clientId`).

## 5. Active Decisions & Considerations

*   **Strictly Passive Interface:** Re-emphasized the critical principle: The gRPC bridge MUST act solely as a passive interface mirroring the webview. It MUST NOT initiate actions or modify internal `Task` state directly. Input is ONLY provided via `handleWebviewAskResponse` when the `Task` explicitly `ask()`s. Unsolicited input via `handleUserInput` is rejected. Tool results are handled internally by the `Task`.
*   **Protobuf Structure Mirroring:** It is paramount that Protobuf message definitions (especially for `AskPayload`, `SayPayload`, etc.) precisely mirror the structure and types in `src/shared/WebviewMessage.ts`. This ensures consistency and simplifies mapping.
*   **Task Lifecycle:** Robust handling of task creation, disposal, and cancellation triggered by external events (client disconnect) remains crucial.
*   **Message Routing:** Decoupling message routing from the active UI task is essential.

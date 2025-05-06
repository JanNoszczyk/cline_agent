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

## 3. Recent Changes (gRPC Debugging Cycle)

*   **Persistent Error:** Encountered persistent `rpc error: code = Unimplemented desc = unknown service cline.task_control.TaskControlService` from the Go client (`sandbox-client`) when calling `UpdateSettings`.
*   **Debugging Steps:**
    *   Verified gRPC server starts and binds to `0.0.0.0:50051`.
    *   Checked Go client connection logic (uses 30s timeout).
    *   Ruled out host firewall as the primary issue (connection succeeds, but RPC fails).
    *   Attempted various fixes in `src/services/grpc/server.ts`:
        *   Implemented `UpdateSettings` handler in `GrpcBridge.ts`.
        *   Added detailed logging around service registration.
        *   Simplified proto loading (only `task_control.proto`).
        *   Tried FQN lookup (`protoDescriptor["..."]`) vs. nested property access (`clineProto.task_control...`) for service definition.
        *   Added a small delay after `server.start()`.
    *   None of the above resolved the "Unimplemented" error.
*   **Build Script Fix:** Identified and fixed a missing `build` script in `package.json` required for compiling TypeScript changes. Added `build` and `dev` scripts using `esbuild.js`.

## 4. Next Steps (Prioritized)

1.  **(Retry Clean Build):** Execute the full clean build command again, now that the `build` script exists: `rm -rf node_modules dist && npm install && node proto/build-proto.js && npm run build && docker compose up --build -d sandbox-client`.
2.  **(Testing) End-to-End:** If the clean build resolves the "Unimplemented" error, proceed with testing the gRPC flow using the `sandbox-client`.
3.  **(Further Debugging):** If the error persists after a clean build, investigate potential issues with:
    *   The `grpc-js` library's handling of dynamically loaded protos.
    *   The generated Go code's expectation vs. the server's registration.
    *   Build caching or environment inconsistencies.
4.  **(Verification) Type Mapping:** Rigorously verify `mapper.ts`.
5.  **(Refinement) Error Handling:** Improve gRPC error reporting.
6.  **(Refinement) Controller Interaction:** Review `controller.initTask`.

## 5. Active Decisions & Considerations

*   **Strictly Passive Interface:** Re-emphasized the critical principle: The gRPC bridge MUST act solely as a passive interface mirroring the webview. It MUST NOT initiate actions or modify internal `Task` state directly. Input is ONLY provided via `handleWebviewAskResponse` when the `Task` explicitly `ask()`s. Unsolicited input via `handleUserInput` is rejected. Tool results are handled internally by the `Task`.
*   **Protobuf Structure Mirroring:** It is paramount that Protobuf message definitions (especially for `AskPayload`, `SayPayload`, etc.) precisely mirror the structure and types in `src/shared/WebviewMessage.ts`. This ensures consistency and simplifies mapping.
*   **Task Lifecycle:** Robust handling of task creation, disposal, and cancellation triggered by external events (client disconnect) remains crucial.
*   **Message Routing:** Decoupling message routing from the active UI task is essential.

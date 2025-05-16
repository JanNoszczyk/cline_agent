# Progress: Sandbox Testing Workflow & SendUserInput E2E (Summary)

## 1. What Works
*   **gRPC Server Startup in Docker:** The Cline extension's gRPC server now starts reliably within the Dockerized OpenVSCode Server environment. This was achieved by:
    *   Modifying `sandbox-client/puppeteer_vscode_run.js` to robustly handle the VSCode "Workspace Trust" dialog, allowing the extension to activate.
*   **Core gRPC Functionality:**
    *   `UpdateSettings` RPC.
    *   `StartTask` RPC, including streaming of `TASK_STARTED`, `STATE`, and `PARTIAL_MESSAGE` (including `SAY_COMPLETION_RESULT`).
    *   `sendUserInput` RPC handler logic in `GrpcBridge.ts` is prepared for E2E testing.
*   **Proto Generation & Basic Server Setup:** `npm run protos` (with `outputServices=grpc-js`), gRPC server (`server.ts`) setup, service registration, and `GrpcBridge.ts` structure are stable.
*   **Go Client (`sandbox-client`):** Connects to the gRPC server, makes `UpdateSettings` and `StartTask` calls, and receives streamed responses correctly.
*   **Testing Infrastructure & Logging:**
    *   **`scripts/update-sandbox-vsix.sh`**: Reliably packages the extension for Docker testing.
    *   **`scripts/run-sandbox-docker.sh`**: Orchestrates Docker builds and runs. It now includes robust `trap` handling to ensure logs are fetched and aggregated even on interruption (Ctrl+C).
    *   **`scripts/aggregate_run_logs.sh`**: Note: Log aggregation is currently disabled as per user request in `run-sandbox-docker.sh`. Analysis relies on individual logs.
    *   **`sandbox-client/entrypoint.sh`**: Correctly configures log paths, ensuring `grpc_server_debug.log` is populated and `vscode_server.log` is moved to `run_logs/other_logs/`.
    *   Primary logs for analysis are individual files in `run_logs/` (e.g., `go_client.log`, `grpc_server_debug.log`).

## 2. What's Left (Prioritized)
1.  **(Refinement) gRPC Error Handling:**
    *   Improved routing of `say: "error"` messages in `GrpcBridge.ts` to emit top-level gRPC `ERROR`.
    *   Updated `Task.handleError` to call `abortTask()` ensuring task termination on tool errors.
2.  **(Refinement) Full Task Lifecycle Management:**
    *   Server-side error handling during tool execution now leads to task abortion and gRPC stream closure.
    *   Client-initiated cancellations (`cancelled` event on gRPC stream) correctly trigger `task.abortTask()`.
    *   Normal task completion (`SAY_COMPLETION_RESULT`) allows the gRPC stream to remain open for potential follow-up interactions or until the task is naturally disposed of by the Controller.
3.  **(Verify `tool_use_id` Flow):**
    *   `ToolUse` interface in `src/core/assistant-message/index.ts` updated with `id: string`.
    *   `toolParamNames` in `src/core/assistant-message/index.ts` updated with `"tool_use_id"`.
    *   `parseAssistantMessage` in `src/core/assistant-message/parse-assistant-message.ts` updated to populate `ToolUse.id` from the `tool_use_id` parameter or assign a default.
    *   Verification is **pending a full successful test run that includes tool usage by the AI**.
4.  **(Refinement & Verification) gRPC Message Streaming & Go Client Logic:** **VERIFIED**
    *   **`src/services/grpc/GrpcBridge.ts` Modification:**
        *   Logic added to `postMessageToWebview` wrapper to intercept `partialMessage` types.
        *   `grpcPartialMessageBuffer` accumulates these partials internally per task/timestamp.
        *   Fully assembled messages are emitted via `newChatMessage` event on `grpcNotifier` (using `ExtensionMessage.new_chat_message` protobuf field).
        *   Direct emission of `sayUpdate`/`askRequest` for gRPC clients from `partialMessage` case removed.
    *   **`sandbox-client/grpc_client_test_logic.go` Modification:**
        *   `receiveLoop` updated with `followUpQuerySent` flag for single follow-up.
        *   Client now performs a single interaction cycle and then concludes.
    *   **Verification:** E2E test run confirmed Go client's single interaction, reduced message count, and that the gRPC client *only* receives complete messages via `ExtensionMessage.new_chat_message`.
5.  **(Documentation) Update Memory Bank:** (This step - In Progress)
6.  **(Implementation) Expand Service Coverage:** Begin implementing and testing `BrowserService`.


## 3. Current Status
*   **gRPC Server in Docker:** Stable and operational.
*   **`UpdateSettings`, `StartTask`, `sendUserInput` RPCs:** Working and E2E tested.
*   **Build & Test Workflow:** Robust. Log analysis now focuses on individual logs.
*   **Vite Build Issue (`path.basename`):** Resolved.
*   **Protobuf/`webContentPb` errors in `webview-ui/src/services/grpc-client.ts` (compile-time):** Believed resolved.
*   **gRPC Error Handling:** Initial refinements implemented.
*   **`tool_use_id` Propagation:** Implementation changes are complete.
*   **gRPC Message Streaming & Go Client Logic:** Refined logic in `GrpcBridge.ts` (partial message buffering, emitting only complete messages) and `grpc_client_test_logic.go` (single interaction cycle) **implemented and verified**.

## 4. Known Issues / Blockers
*   **No current major blockers.**
*   **`tool_use_id` Flow Verification:** The `tool_use_id` propagation still needs full verification in a test run where the AI actually uses a tool.
*   **Lower Priority:**
    *   Full implementation and testing of `CheckpointsService`, `McpService`.
    *   Comprehensive verification of all type mappings in `mapper.ts` (beyond the currently active RPCs).
    *   Minor linting warnings in the codebase.

# Tech Context: Cline gRPC Integration (Summary)

## 1. Core Technologies
*   **Language:** TypeScript
*   **Framework:** VSCode Extension API
*   **UI:** React (webview)
*   **Communication:** VSCode `postMessage` (internal), gRPC (external)

## 2. Key Libraries & Tools
*   **`@grpc/grpc-js`:** Node.js gRPC server.
*   **`google-protobuf`:** Protobuf message handling.
*   **`protoc` & `ts-protoc-gen`:** Protobuf compilation to TypeScript.
*   **VSCode API:** Editor interaction, state, webviews.
*   **Node.js:** Extension host runtime.

## 3. Relevant Project Files
*   **Protos:** `proto/*.proto` (esp. `task_control.proto`, which now includes a `new_chat_message` field in `ExtensionMessage` for individual complete messages).
*   **Proto Build:** `proto/build-proto.js` (executed via `npm run protos`).
*   **Generated Protos:** `src/shared/proto/` (updated after proto changes).
*   **gRPC Server:** `src/services/grpc/server.ts` (houses `GrpcNotifier` which is used by `GrpcBridge`).
*   **Mapping (Cline <=> Proto):** `src/services/grpc/mapper.ts`.
*   **Core Logic:** `src/extension.ts`, `src/core/controller/index.ts`, `src/core/task/index.ts`, `src/core/webview/index.ts`.
*   **Bridge:** `src/services/grpc/GrpcBridge.ts` (contains the primary logic for intercepting `partialMessage` types for gRPC clients, buffering them in `grpcPartialMessageBuffer`, and emitting `newChatMessage` events for complete messages).
*   **Test Client:** `sandbox-client/` (Go) (has been updated and verified to handle `new_chat_message` and perform a single interaction cycle).

## 4. Development & Build
*   **Deps:** `package.json` (root, `proto/`). `npm install`.
*   **Proto Compile:** `node proto/build-proto.js` (or npm script) -> generates TS from `.proto`.
*   **TS Compile:** `tsc` or `esbuild`. Check `package.json` scripts.

### 4.1 Sandbox Testing Workflow
The primary method for testing the gRPC integration and extension behavior in an isolated environment involves a Dockerized OpenVSCode Server setup automated with Playwright.

*   **Key Scripts for Testing:**
    *   **`sandbox-client/puppeteer_vscode_run.js`**: A Playwright script that automates launching VSCode in a headless browser within the Docker container. It handles initial UI interactions like the "Workspace Trust" dialog and performs actions to ensure the VSCode environment is ready and the Cline extension can activate.
    *   **`scripts/update-sandbox-vsix.sh`**: **CRITICAL** - This script MUST be run after ANY changes to the `src/` directory (main Cline extension code). It rebuilds the extension `.vsix` file and copies it into the `sandbox-client/` directory, making it available to the Docker build process. **Note:** If changes are *only* made to files within the `sandbox-client/` directory (e.g., `grpc_client_test_logic.go`), this script is NOT required; only `run-sandbox-docker.sh` is needed.
    *   **`scripts/run-sandbox-docker.sh`**: This script orchestrates the entire Docker-based test run. It builds the Docker image (which installs the updated `.vsix` if `update-sandbox-vsix.sh` was run), starts the `sandbox-client` container (which runs `entrypoint.sh`, OpenVSCode Server, the Puppeteer script, and the Go gRPC client). It also handles log collection and aggregation upon completion or interruption.
    *   **`scripts/aggregate_run_logs.sh`**: Called by `run-sandbox-docker.sh` at the end of a test run (even on interruption). It collects all individual log files from the `run_logs/` directory (e.g., `go_client.log`, `puppeteer_script.log`, `grpc_server_debug.log`, `docker_compose_output.log`) and puts them inside`run_logs` directory. This aggregated log is the primary artifact for AI analysis after a test run.
    *   **`sandbox-client/entrypoint.sh`**: The main script run inside the Docker container. It sets up the environment, starts OpenVSCode Server, installs the extension (if not present), runs the Puppeteer script, and the Go gRPC test client. It configures log paths, including `GRPC_SERVER_DEBUG_LOG_PATH` for the extension's gRPC server logs and ensures `vscode_server.log` goes to `run_logs/other_logs/`.

*   **Standard Test Procedure:**
    1.  Make code changes.
    2.  If changes were made to the extension code (`src/`): Run `bash scripts/update-sandbox-vsix.sh` to package the latest extension code.
    3.  If changes were *only* made to `sandbox-client/` files or other test scripts: Skip the `update-sandbox-vsix.sh` step.
    4.  Run `bash scripts/run-sandbox-docker.sh` to execute the full test in Docker.
    5.  After the script completes (or is interrupted), the AI should primarily analyze relevant logs from `run_logs` to understand the outcome of the test run. Individual logs in `run_logs/` can be consulted if deeper specific analysis is needed, but the aggregated log provides a comprehensive overview.

*   **Local Debugging (Alternative):** For direct debugging of the extension without Docker, use the VSCode "Run and Debug" panel (e.g., "Run Extension" launch configuration).

## 5. Constraints & Considerations
*   Runs in VSCode extension host (either locally or within OpenVSCode Server in Docker).
*   Async heavy (gRPC, VSCode API).
*   Careful state management for gRPC client ID <-> `Task` mapping, and for `grpcPartialMessageBuffer` in `GrpcBridge.ts` to ensure complete messages are assembled before sending to gRPC clients.
*   Prefer non-invasive integration (wrappers/interceptors), as demonstrated by modifying `GrpcBridge` primarily.
*   Robust gRPC error handling.
*   The Go gRPC client (`sandbox-client/grpc_client_test_logic.go`) has been updated and verified to handle the `new_chat_message` field and perform a single, non-looping interaction cycle.

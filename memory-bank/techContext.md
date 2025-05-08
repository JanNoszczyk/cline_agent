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
*   **Protos:** `proto/*.proto` (esp. `task_control.proto`)
*   **Proto Build:** `proto/build-proto.js`
*   **Generated Protos:** `src/shared/proto/`
*   **gRPC Server:** `src/services/grpc/server.ts`
*   **Mapping (Cline <=> Proto):** `src/services/grpc/mapper.ts`
*   **Core Logic:** `src/extension.ts`, `src/core/controller/index.ts`, `src/core/task/index.ts`, `src/core/webview/index.ts`
*   **Bridge:** `src/services/grpc/GrpcBridge.ts`
*   **Test Client:** `sandbox-client/` (Go)

## 4. Development & Build
*   **Deps:** `package.json` (root, `proto/`). `npm install`.
*   **Proto Compile:** `node proto/build-proto.js` (or npm script) -> generates TS from `.proto`.
*   **TS Compile:** `tsc` or `esbuild`. Check `package.json` scripts.
*   **CRITICAL: Update Sandbox VSIX:** Run `bash scripts/update-sandbox-vsix.sh` after ANY `src/` changes and BEFORE `docker compose up`. This copies the new `.vsix` to `sandbox-client/`.
*   **Run/Debug:** VSCode "Run and Debug" panel.

## 5. Constraints & Considerations
*   Runs in VSCode extension host.
*   Async heavy (gRPC, VSCode API).
*   Careful state management for gRPC client ID <-> `Task` mapping.
*   Prefer non-invasive integration (wrappers/interceptors).
*   Robust gRPC error handling.

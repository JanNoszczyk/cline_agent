# Tech Context: Cline gRPC Integration

## 1. Core Technologies

*   **Language:** TypeScript
*   **Framework:** VSCode Extension API
*   **UI:** React (for the webview)
*   **Communication (Internal):** VSCode `postMessage` API between extension host and webview.
*   **Communication (External):** gRPC

## 2. Key Libraries & Tools

*   **`@grpc/grpc-js`:** Node.js library for implementing the gRPC server.
*   **`google-protobuf`:** Library for working with Protobuf messages in JavaScript/TypeScript.
*   **Protobuf Compiler (`protoc`):** Used with plugins (`ts-protoc-gen`) to generate TypeScript definitions and service interfaces from `.proto` files (build process likely managed by `proto/build-proto.js`).
*   **VSCode API:** Used extensively for interacting with the editor, managing state, webviews, etc.
*   **Node.js:** The runtime environment for the VSCode extension host.

## 3. Relevant Project Files & Locations

*   **Protobuf Definitions:** `proto/*.proto` (e.g., `task_control.proto`, `task.proto`)
*   **Protobuf Build Script:** `proto/build-proto.js`
*   **Generated Protobuf Code:** `src/shared/proto/` (output of `proto/build-proto.js`)
*   **gRPC Server Implementation:** `src/services/grpc/server.ts`
*   **Type Mapping (Cline <-> Proto):** `src/services/grpc/mapper.ts`
*   **Protobuf Utilities:** `src/utils/proto-mapper.ts` (Note: This file might be legacy or less used now with `mapper.ts` being central)
*   **Core Extension Logic:**
    *   `src/extension.ts` (Entry point, initialization)
    *   `src/core/controller/index.ts` (Controller class)
    *   `src/core/task/index.ts` (Task class)
    *   `src/core/webview/index.ts` (WebviewProvider class)
*   **New Integration Component:** `src/services/grpc/GrpcBridge.ts`
*   **External Test Client:** `sandbox-client/` (Go-based gRPC client)

## 4. Development Setup & Build Process

*   **Dependencies:** Managed via `package.json` (root) and potentially `proto/package.json`. Use `npm install`.
*   **Protobuf Compilation:** Requires running the script in `proto/build-proto.js` (e.g., `node proto/build-proto.js` or via an `npm script`) to generate TypeScript code from `.proto` files *before* compiling the main extension TypeScript code.
*   **TypeScript Compilation:** Uses `tsc` (via `tsconfig.json`) or potentially `esbuild` (as suggested by `esbuild.js` in the root). Check `package.json` scripts for build commands (e.g., `npm run compile`, `npm run build`).
*   **Updating Sandbox Extension:** After making changes to the core extension code (`src/`), run `bash scripts/update-sandbox-vsix.sh`. This script rebuilds the extension `.vsix` file and copies it to the `sandbox-client/` directory, ensuring the Docker container uses the latest version during the build.
*   **Running/Debugging:** Typically done via VSCode's "Run and Debug" panel (launch configurations likely in `.vscode/launch.json`).

## 5. Technical Constraints & Considerations

*   **VSCode Extension Environment:** Code runs within the VSCode extension host process.
*   **Asynchronous Nature:** Heavy reliance on async/await due to I/O (gRPC, VSCode API, file system).
*   **State Management:** Need to carefully manage the mapping between gRPC client IDs and Cline `Task` instances.
*   **Non-Invasive Integration:** The goal is to integrate the gRPC bridge with minimal changes to the core `Controller` and `Task` classes. Wrapping/interception techniques are preferred over direct modification.
*   **Error Handling:** Robust error handling is needed for gRPC communication and potential issues during task execution or state mapping.

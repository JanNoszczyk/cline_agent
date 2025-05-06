# Progress: Cline gRPC Bridge Implementation & Refactoring

## 1. What Works

*   **Protobuf Generation:** `npm run protos` successfully generates TypeScript/Go code.
*   **gRPC Server (`server.ts`):** Basic server setup, service registration, stream handling, and callback routing structure are in place.
*   **gRPC Mapper (`mapper.ts`):** Initial mapping logic exists between internal types and Protobuf types. Handles enums, `google.protobuf.Value`, and uses `$case` for `oneof`. TypeScript errors related to initial mapping are resolved.
*   **`GrpcBridge` Component:** Basic structure exists (`src/services/grpc/GrpcBridge.ts`), including instantiation, controller registration (`setController`), server startup, basic callback stubs, and message interception logic via `postMessageToWebview` wrapping.
*   **Extension Integration:** `GrpcBridge` is instantiated and managed within `src/extension.ts`.

## 2. What's Left to Build (Prioritized)

1.  **(Testing) End-to-End:** Thoroughly test the refactored gRPC communication flow using the `sandbox-client`.
2.  **(Verification) Type Mapping:** Rigorously verify that all required proto fields are handled correctly in `mapper.ts`, minimizing risky casts, especially within `mapExtensionStateToProto` and the remaining unmapped `ClineMessage` payloads.
3.  **(Refinement) Error Handling:** Improve error reporting back to the gRPC client in `GrpcBridge` and `server.ts`.
4.  **(Refinement) Controller Interaction:** Review if `controller.initTask` needs modification to better support `GrpcBridge` (e.g., accepting `clientId`).

## 3. Current Status

*   **Debugging gRPC:** Currently debugging a persistent `rpc error: code = Unimplemented desc = unknown service cline.task_control.TaskControlService` error occurring when the `sandbox-client` (Go) calls the `UpdateSettings` RPC.
    *   Connection from client to server is successful.
    *   Server starts and binds correctly.
    *   Various attempts to fix service registration/loading in `server.ts` (logging, simplifying proto loading, different lookup methods, delays) have not resolved the issue.
*   **Build Script Fixed:** Added missing `build` and `dev` scripts to `package.json`.
*   **Next:** Retry a full clean build and test cycle to rule out caching/build issues.

## 4. Known Issues / Blockers

*   **gRPC Service Registration:** The root cause of the "Unimplemented" error for `TaskControlService` is still unknown. Potential issues might be in `grpc-js` library behavior, proto loading/interpretation, or build inconsistencies.
*   **Incomplete Type Mapping:** `mapClineMessageToProto` and `mapExtensionStateToProto` need verification.
*   **Error Handling:** gRPC error reporting needs improvement.
*   **Controller Interaction:** `controller.initTask` might need adjustments.

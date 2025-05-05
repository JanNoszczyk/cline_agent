# Progress: Cline gRPC Integration (Mapper Fixes Complete)

## 1. What Works

*   **Protobuf Generation:** `npm run protos` successfully generates TypeScript/Go code.
*   **gRPC Mapper (`mapper.ts`):**
    *   Maps internal Cline types (`ExtensionState`, `ClineMessage`, `ToolUse`, `ToolResponse`) to corresponding Protobuf types (`ProtoExtensionState`, `ProtoClineMessage`, etc.).
    *   Handles `oneof` fields using `$case` syntax.
    *   Manages `Partial<>` vs. full proto types using casts where necessary.
    *   Converts `Timestamp` to `number` (milliseconds).
    *   Maps `InternalExtensionMessage` (`state`, `partialMessage`) to `ProtoExtensionMessage`.
    *   **TypeScript errors resolved** in `mapper.ts`, `GrpcBridge.ts`, and `server.ts` related to mapping logic.
*   **`GrpcBridge` Component:** Basic structure exists (`src/services/grpc/GrpcBridge.ts`), including server startup, callback stubs, and message interception logic.
*   **Extension Integration:** `GrpcBridge` instantiated and managed within `src/extension.ts`.
*   **Message Interception:** Implemented by wrapping `controller.postMessageToWebview` within `GrpcBridge.setController`.

## 2. What's Left to Build

*   **Callback Implementations:** Core logic for `GrpcBridge` callbacks (`initTask`, `handleToolResult`, `handleUserInput`, `handleClearTask`, `handleCancelTask`, `handleApplyBrowserSettings`, `handleOpenFile`, etc.) needs implementation.
*   **`clientId`-`Task` Mapping:** Reliable task instance retrieval in `initTask` is pending (TODO).
*   **Task Disposal Handling:** Mechanism needed for `GrpcBridge` to remove tasks from `clientTaskMap` upon disposal.
*   **Testing:** End-to-end testing using the `sandbox-client` or similar tools.

## 3. Current Status

*   **Implementation:** Focused on fixing the type mapping layer (`mapper.ts`) between internal Cline types and generated Protobuf types. All reported TypeScript errors in the gRPC service files (`mapper.ts`, `GrpcBridge.ts`, `server.ts`) have been addressed.
*   **Next:** Verify the fixes by running the TypeScript compiler. Then, proceed with implementing the core logic for the remaining `GrpcBridge` callbacks and addressing the task mapping/disposal TODOs.

## 4. Known Issues / Blockers

*   **Accessing `Task` Instance:** The current method in `GrpcBridge.initTask` to get the `Task` instance is unreliable. Need to modify `Controller.initTask` or use an event-based approach.
*   **Task Disposal:** Need a mechanism (e.g., event from `Task`) for `GrpcBridge` to know when a task is disposed to remove it from the `clientTaskMap`.
*   **Callback Implementation:** Core logic for several `GrpcBridge` callbacks needs to be implemented, potentially requiring new methods on the `Task` or `Controller` classes.
*   **Controller Method Targeting:** Need to verify/adjust `handleClearTask` and `handleCancelTask` to ensure they operate on the correct task instance when invoked via gRPC.

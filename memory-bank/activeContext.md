# Active Context: Cline gRPC Integration (Mapper Fixes)

## 1. Current Focus

Verify the recent TypeScript fixes in the gRPC mapping layer (`src/services/grpc/mapper.ts`) and ensure the `GrpcBridge` and `server` components are now type-correct. Prepare for the next steps, likely involving implementing more `GrpcBridge` callbacks or testing the existing mapping logic.

## 2. Recent Changes

*   **gRPC Proto Generation:** Successfully ran `npm run protos` to generate TypeScript/Go code from `.proto` files.
*   **Mapper Implementation:** Updated `src/services/grpc/mapper.ts` with generated types and refined mapping logic between internal Cline types (`ExtensionState`, `ClineMessage`, `ToolUse`, `ToolResponse`) and Protobuf types (`ProtoExtensionState`, `ProtoClineMessage`, etc.).
*   **TypeScript Error Resolution:** Iteratively fixed numerous TypeScript errors in `src/services/grpc/mapper.ts`, `src/services/grpc/GrpcBridge.ts`, and `src/services/grpc/server.ts`. This involved:
    *   Correcting `oneof` field handling using `$case` syntax and `any` casts where necessary.
    *   Managing `Partial<>` vs. full proto types, primarily using `Partial<>` for return types and casting (`as ProtoType`) when assigning to fields expecting the full type (especially within `mapExtensionStateToProto` and `mapExtensionMessageToProto`).
    *   Converting `Timestamp` objects to milliseconds (`number`) where required.
    *   Fixing incorrect type imports and references (e.g., `InternalExtensionMessage`).
    *   Correcting default enum values (e.g., `ProtoExtensionMessageType.UNSPECIFIED` -> `0`).
    *   Refining the `switch` statement in `mapExtensionMessageToProto` to correctly handle valid `InternalExtensionMessage` types (`state`, `partialMessage`) and access their corresponding payloads (`message.state`, `message.partialMessage`).

## 3. Next Steps

1.  **Verify Fixes:** Run the TypeScript compiler (`tsc` or via `npm run compile`) to confirm that all reported errors in `mapper.ts`, `GrpcBridge.ts`, and `server.ts` are resolved.
2.  **Implement Remaining Callbacks:** Fill in the core logic for the remaining `GrpcServerCallbacks` methods within `src/services/grpc/GrpcBridge.ts` (e.g., `handleToolResult`, `handleUserInput`, `handleClearTask`, `handleCancelTask`). This may require adding methods to `Task` or `Controller`.
3.  **Address Task Mapping/Disposal:** Resolve the TODOs related to reliably obtaining the `Task` instance in `GrpcBridge.initTask` and handling task disposal to clean up the `clientTaskMap`.
4.  **Testing:** Begin testing the gRPC communication flow, potentially using the `sandbox-client`.

## 4. Active Decisions & Considerations

*   **Mapper Strategy:** Settled on using `Partial<>` for most mapping function return types and employing `any` casts for `oneof` field assignments (`$case`) and explicit casts (`as ProtoType`) when assigning partial results to fields requiring the full type. This balances type safety with the practicalities of mapping complex, potentially incomplete objects.
*   **`mapExtensionMessageToProto` Logic:** The `switch` statement now correctly handles `state` and `partialMessage` types based on the `InternalExtensionMessage` definition. It assumes `type: "text"` from the internal message structure also uses the `message.partialMessage` field for its content.
*   **`clientId`-`Task` Mapping:** Remains a key area needing a robust solution for task retrieval and disposal handling.

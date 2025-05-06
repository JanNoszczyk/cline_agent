import { vscode } from "../utils/vscode"
import { v4 as uuidv4 } from "uuid"
import { AccountServiceService } from "@shared/proto/account"
import { BrowserServiceService } from "@shared/proto/browser"
import { CheckpointsServiceService } from "@shared/proto/checkpoints"
import { EmptyRequest } from "@shared/proto/common"
import { FileServiceService } from "@shared/proto/file"
import { McpServiceService } from "@shared/proto/mcp"
import { TaskServiceService } from "@shared/proto/task"
import { WebContentServiceService } from "@shared/proto/web_content"
// Generic type for any protobuf service definition
// This type is not strictly enforced by T extends ProtoService due to how it's used,
// but it documents the expected shape for the OLD generic-definitions output.
// We will adapt the createGrpcClient function to handle the new grpc-js output structure.
type OldProtoServiceShape = {
	name: string
	fullName: string
	methods: {
		[key: string]: {
			name: string
			requestType: any
			responseType: any
			requestStream: boolean
			responseStream: boolean
			options: any
		}
	}
}

// Define a generic type for the new service definition structure (outputServices=grpc-js)
// where methods are direct properties.
type GrpcJsServiceDefinition = {
	[methodName: string]: {
		path: string
		requestStream: boolean
		responseStream: boolean
		requestSerialize: (value: any) => Buffer
		requestDeserialize: (value: Buffer) => any
		responseSerialize: (value: any) => Buffer
		responseDeserialize: (value: Buffer) => any
		// requestType and responseType are implicitly handled by serialize/deserialize
		// but we need them for fromJSON in the client logic.
		// We'll assume the actual message type classes are available via other imports.
	}
}

// Define a generic type that extracts method signatures
// This needs to be more flexible now. The request/response types are not directly on the method definition.
// We'll rely on the actual message types being imported and used correctly.
type GrpcClientType<T extends GrpcJsServiceDefinition> = {
	[K in keyof T]: (
		request: any, // Simplified, actual type checking relies on usage
	) => Promise<any> // Simplified
}

// Create a client for any protobuf service with inferred types
function createGrpcClient<T extends GrpcJsServiceDefinition>(
	serviceDefinition: T,
	// We need a way to get the actual request/response message types for fromJSON/toJSON
	// This is a simplification; a more robust solution might involve passing a map of types.
	messageTypes: { [methodName: string]: { requestType: any; responseType: any } },
): GrpcClientType<T> {
	const client = {} as GrpcClientType<T>

	const serviceFullNameParts = Object.values(serviceDefinition)[0]?.path.split("/")
	const serviceFullName = serviceFullNameParts && serviceFullNameParts.length > 1 ? serviceFullNameParts[1] : "UnknownService"

	// For each method in the service
	Object.entries(serviceDefinition).forEach(([methodName, methodDef]) => {
		// Create a function that matches the method signature
		client[methodName as keyof GrpcClientType<T>] = ((request: any) => {
			return new Promise((resolve, reject) => {
				const requestId = uuidv4()

				// Set up one-time listener for this specific request
				const handleResponse = (event: MessageEvent) => {
					const message = event.data
					if (message.type === "grpc_response" && message.grpc_response?.request_id === requestId) {
						// Remove listener once we get our response
						window.removeEventListener("message", handleResponse)

						if (message.grpc_response.error) {
							reject(new Error(message.grpc_response.error))
						} else {
							// Convert JSON back to protobuf message
							const msgTypes = messageTypes[methodName]
							if (msgTypes && msgTypes.responseType && typeof msgTypes.responseType.fromJSON === "function") {
								const response = msgTypes.responseType.fromJSON(message.grpc_response.message)
								console.log("[DEBUG] grpc-client sending response:", response)
								resolve(response)
							} else {
								console.error(`[DEBUG] grpc-client: No responseType.fromJSON for method ${methodName}`)
								resolve(message.grpc_response.message) // Resolve with raw data if no fromJSON
							}
						}
					}
				}

				window.addEventListener("message", handleResponse)

				let encodedRequest = {}

				// Handle different types of requests
				if (request === null || request === undefined) {
					// Empty request
					encodedRequest = {}
				} else if (typeof request.toJSON === "function") {
					// Proper protobuf object
					encodedRequest = request.toJSON()
				} else if (typeof request === "object") {
					// Plain JavaScript object
					encodedRequest = { ...request }
				} else {
					// Fallback
					encodedRequest = { value: request }
				}

				// Send the request
				vscode.postMessage({
					type: "grpc_request",
					grpc_request: {
						service: serviceFullName, // Use derived serviceFullName
						method: methodName, // Use methodName from Object.entries
						message: encodedRequest, // Convert protobuf to JSON
						request_id: requestId,
					},
				})
			})
		}) as any
	})

	return client
}

// We need to provide the actual message type classes for fromJSON to work.
// This requires importing them.
import * as accountPb from "@shared/proto/account"
import * as browserPb from "@shared/proto/browser"
import * as checkpointsPb from "@shared/proto/checkpoints"
import * as commonPb from "@shared/proto/common" // For EmptyRequest etc.
import * as filePb from "@shared/proto/file"
import * as mcpPb from "@shared/proto/mcp"
import * as taskPb from "@shared/proto/task"
import * as webContentPb from "@shared/proto/web_content"

const AccountServiceClient = createGrpcClient(AccountServiceService, {
	accountLoginClicked: { requestType: commonPb.EmptyRequest, responseType: commonPb.String },
	// accountLogoutClicked and getAccountInfo methods are not in account.proto
})
const BrowserServiceClient = createGrpcClient(BrowserServiceService, {
	getBrowserConnectionInfo: { requestType: commonPb.EmptyRequest, responseType: browserPb.BrowserConnectionInfo },
	testBrowserConnection: { requestType: commonPb.StringRequest, responseType: browserPb.BrowserConnection },
	discoverBrowser: { requestType: commonPb.EmptyRequest, responseType: browserPb.BrowserConnection },
	getDetectedChromePath: { requestType: commonPb.EmptyRequest, responseType: browserPb.ChromePath },
	updateBrowserSettings: { requestType: browserPb.UpdateBrowserSettingsRequest, responseType: commonPb.Boolean },
})
const CheckpointsServiceClient = createGrpcClient(CheckpointsServiceService, {
	checkpointDiff: { requestType: commonPb.Int64Request, responseType: commonPb.Empty },
	checkpointRestore: { requestType: checkpointsPb.CheckpointRestoreRequest, responseType: commonPb.Empty },
	// getCheckpoints method is not in checkpoints.proto
})
const FileServiceClient = createGrpcClient(FileServiceService, {
	openFile: { requestType: commonPb.StringRequest, responseType: commonPb.Empty },
	// Add other methods for FileService here if used by client
})
const McpServiceClient = createGrpcClient(McpServiceService, {
	toggleMcpServer: { requestType: mcpPb.ToggleMcpServerRequest, responseType: mcpPb.McpServers },
	updateMcpTimeout: { requestType: mcpPb.UpdateMcpTimeoutRequest, responseType: mcpPb.McpServers },
	addRemoteMcpServer: { requestType: mcpPb.AddRemoteMcpServerRequest, responseType: mcpPb.McpServers },
})
const TaskServiceClient = createGrpcClient(TaskServiceService, {
	cancelTask: { requestType: commonPb.EmptyRequest, responseType: commonPb.Empty }, // Example, ensure TaskService methods are correctly mapped if used
	// Add other methods for TaskService here if used by client
})
const WebContentServiceClient = createGrpcClient(WebContentServiceService, {
	checkIsImageUrl: { requestType: commonPb.StringRequest, responseType: commonPb.Boolean }, // Example
	// Add other methods for WebContentService here
})

export {
	AccountServiceClient,
	BrowserServiceClient,
	CheckpointsServiceClient,
	FileServiceClient,
	TaskServiceClient,
	McpServiceClient,
	WebContentServiceClient,
}

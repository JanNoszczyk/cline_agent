import { vscode } from "../utils/vscode"
import { v4 as uuidv4 } from "uuid"
// Import message types from the new webview-specific path
import * as accountPb from "@shared/proto_webview_types/account"
import * as browserPb from "@shared/proto_webview_types/browser"
import * as checkpointsPb from "@shared/proto_webview_types/checkpoints"
import * as commonPb from "@shared/proto_webview_types/common"
import * as filePb from "@shared/proto_webview_types/file"
import * as mcpPb from "@shared/proto_webview_types/mcp"
import * as taskPb from "@shared/proto_webview_types/task"
import * as webContentPb from "@shared/proto_webview_types/web_content"

// Define a generic type for the client methods.
// The key is the method name (string), and the value is a function
// that takes a request object and returns a Promise of the response object.
type GrpcClientMethods = {
	[methodName: string]: (request: any) => Promise<any>
}

// Create a client for a specific gRPC service.
// serviceName: The full gRPC service name (e.g., "cline.AccountService").
// methods: An object where keys are method names and values are objects
//          containing requestType and responseType (the actual message classes).
function createGrpcClient(
	serviceName: string,
	methods: { [methodName: string]: { requestType: any; responseType: any } },
): GrpcClientMethods {
	const client = {} as GrpcClientMethods

	// For each method defined for the service
	Object.entries(methods).forEach(([methodName, methodInfo]) => {
		// Create a function for this method
		client[methodName] = (request: any) => {
			return new Promise((resolve, reject) => {
				const requestId = uuidv4()

				const handleResponse = (event: MessageEvent) => {
					const message = event.data
					if (message.type === "grpc_response" && message.grpc_response?.request_id === requestId) {
						window.removeEventListener("message", handleResponse)
						if (message.grpc_response.error) {
							reject(new Error(message.grpc_response.error))
						} else {
							if (methodInfo.responseType && typeof methodInfo.responseType.fromJSON === "function") {
								const response = methodInfo.responseType.fromJSON(message.grpc_response.message)
								resolve(response)
							} else {
								console.error(
									`[DEBUG] grpc-client: No responseType.fromJSON for method ${serviceName}.${methodName}`,
								)
								resolve(message.grpc_response.message)
							}
						}
					}
				}
				window.addEventListener("message", handleResponse)

				let encodedRequest = {}
				if (request === null || request === undefined) {
					encodedRequest = {}
				} else if (typeof request.toJSON === "function") {
					encodedRequest = request.toJSON()
				} else if (typeof request === "object") {
					encodedRequest = { ...request }
				} else {
					encodedRequest = { value: request }
				}

				vscode.postMessage({
					type: "grpc_request",
					grpc_request: {
						service: serviceName,
						method: methodName,
						message: encodedRequest,
						request_id: requestId,
					},
				})
			})
		}
	})
	return client
}

// Define clients for each service
// The first argument is the FQN of the service.
// The second argument maps method names to their request/response message types.

// Using basic types for wrappers where specific pb types are not generated/needed for webview
interface StringValue {
	value: string
}
interface BoolValue {
	value: boolean
}
interface Int64Value {
	value: string
} // Mapped to string due to forceLong=string
interface EmptyResponse {} // Simple empty object

const AccountServiceClient = createGrpcClient("cline.AccountService", {
	AccountLoginClicked: { requestType: commonPb.EmptyRequest, responseType: {} as StringValue }, // Use placeholder for type checking
	// Add other AccountService methods if they exist and are used by the webview
})

const BrowserServiceClient = createGrpcClient("cline.BrowserService", {
	GetBrowserConnectionInfo: { requestType: commonPb.EmptyRequest, responseType: browserPb.BrowserConnectionInfo },
	TestBrowserConnection: { requestType: {} as StringValue, responseType: browserPb.BrowserConnection },
	DiscoverBrowser: { requestType: commonPb.EmptyRequest, responseType: browserPb.BrowserConnection },
	GetDetectedChromePath: { requestType: commonPb.EmptyRequest, responseType: browserPb.ChromePath },
	UpdateBrowserSettings: { requestType: browserPb.UpdateBrowserSettingsRequest, responseType: {} as BoolValue },
})

const CheckpointsServiceClient = createGrpcClient("cline.CheckpointsService", {
	CheckpointDiff: { requestType: {} as Int64Value, responseType: {} as EmptyResponse },
	CheckpointRestore: { requestType: checkpointsPb.CheckpointRestoreRequest, responseType: {} as EmptyResponse },
	// Add GetCheckpoints if needed
})

const FileServiceClient = createGrpcClient("cline.FileService", {
	OpenFile: { requestType: {} as StringValue, responseType: {} as EmptyResponse },
	// Add other FileService methods
})

const McpServiceClient = createGrpcClient("cline.McpService", {
	ToggleMcpServer: { requestType: mcpPb.ToggleMcpServerRequest, responseType: mcpPb.McpServers },
	UpdateMcpTimeout: { requestType: mcpPb.UpdateMcpTimeoutRequest, responseType: mcpPb.McpServers },
	AddRemoteMcpServer: { requestType: mcpPb.AddRemoteMcpServerRequest, responseType: mcpPb.McpServers },
})

const TaskServiceClient = createGrpcClient("cline.TaskService", {
	CancelTask: { requestType: commonPb.EmptyRequest, responseType: {} as EmptyResponse },
	// Add other TaskService methods
})

const WebContentServiceClient = createGrpcClient("cline.WebContentService", {
	CheckIsImageUrl: { requestType: commonPb.StringRequest, responseType: webContentPb.IsImageUrl },
	// Add other WebContentService methods
})

// Note: The TaskControlService is primarily used by the external Go client,
// not directly by the webview UI's grpc-client.ts. If the webview needed to
// call TaskControlService methods, it would be defined here similarly.

export {
	AccountServiceClient,
	BrowserServiceClient,
	CheckpointsServiceClient,
	FileServiceClient,
	TaskServiceClient,
	McpServiceClient,
	WebContentServiceClient,
}

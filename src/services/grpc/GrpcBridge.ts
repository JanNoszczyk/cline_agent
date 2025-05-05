// Removed duplicate import block
import * as vscode from "vscode"
import { Controller } from "../../core/controller" // Assuming Controller is exported
import { Task } from "../../core/task" // Assuming Task is exported
import { WebviewMessage } from "../../shared/WebviewMessage" // Import WebviewMessage
import {
	startExternalGrpcServer,
	stopExternalGrpcServer,
	GrpcNotifier, // Corrected import: GrpcTaskNotifier -> GrpcNotifier
	// Removed imports no longer exported by server.ts
	// GrpcServerCallbacks,
	// ProtoExtensionMessageTypeConst,
	// ProtoExtensionMessageWrapper,
	// ProtoAskRequest,
} from "./server" // Import from the actual server file
import {
	ProtoExtensionState,
	// ProtoAskRequest, // Moved import from server.ts - Will import directly from proto
	mapExtensionStateToProto,
	mapClineMessageToProto,
	mapToolUseBlockToProto,
	mapToolResultBlockToProto,
	ProtoToolResultBlock, // Import the missing type
	// ProtoExtensionMessage, // Import for mapping - Will import directly from proto
	// ProtoClineMessage, // Import for mapping - Will import directly from proto
	ProtoToolUseBlock, // Import for mapping
	// Import other specific proto types if needed by mapper functions
} from "./mapper" // Import state type and mapping functions
// Import Proto types directly
import {
	// AskRequest as ProtoAskRequest, // Removed incorrect import
	ExtensionMessage as ProtoExtensionMessage, // Renamed on import
	ClineMessage as ProtoClineMessage, // Renamed on import
	ExtensionMessageType, // Import the enum
} from "../../shared/proto/task_control" // Adjust path if necessary
import { ExtensionMessage, ClineMessage } from "../../shared/ExtensionMessage" // Import ExtensionMessage for type checking
import { ToolResponse } from "../../core/task" // Import internal tool types from index
import { ToolUse } from "@core/assistant-message" // Import ToolUse type
import { mapProtoToolResultToInternal } from "./mapper" // Import the new mapper
import { formatResponse } from "@core/prompts/responses" // Import formatResponse for image blocks
import Anthropic from "@anthropic-ai/sdk" // Import Anthropic for ContentBlockParam type
import { Logger } from "@services/logging/Logger" // Import Logger
import { Timestamp } from "google-protobuf/google/protobuf/timestamp_pb" // Import Timestamp
import { updateGlobalState } from "../../core/storage/state" // Import for settings update
import { BrowserSettings } from "../../shared/BrowserSettings" // Import settings type
import { handleFileServiceRequest } from "../../core/controller/file" // Import file handler
import * as grpc from "@grpc/grpc-js" // Import grpc for types

// Define the expected signature for the postMessage function, now including taskId
type PostMessageFunc = (message: ExtensionMessage, taskId?: string) => Promise<void>

// Define the callbacks interface locally
interface GrpcServerCallbacks {
	initTask(clientId: string, text?: string, images?: string[]): Promise<void>
	handleAskResponse(clientId: string, response: WebviewMessage): Promise<void>
	handleToolResult(clientId: string, result: Partial<ProtoToolResultBlock>): Promise<void>
	handleUserInput(clientId: string, text?: string, images?: string[]): Promise<void>
	handleGenericMessage(clientId: string, message: WebviewMessage): Promise<void>
	handleClearTask(clientId: string): Promise<void>
	handleCancelTask(clientId: string): Promise<void>
	handleDeleteTaskWithId(clientId: string, taskId: string): Promise<void>
	handleApplyBrowserSettings(clientId: string, settings: any): Promise<void>
	handleOpenFile(clientId: string, filePath: string): Promise<void>
	handleClientDisconnect(clientId: string): Promise<void>
	// Add other methods implemented by GrpcBridge if needed by the server logic
}

/**
 * Bridges the external gRPC server with the internal Cline Controller and Task logic.
 */
// Restored 'implements vscode.Disposable'
export class GrpcBridge implements GrpcServerCallbacks, vscode.Disposable {
	private context: vscode.ExtensionContext
	private controller: Controller | undefined // Reference to the main Controller instance
	private grpcNotifier: GrpcNotifier | null = null // Corrected type: GrpcTaskNotifier -> GrpcNotifier
	private clientTaskMap = new Map<string, Task>() // Map external clientId to internal Task instance
	private disposables: vscode.Disposable[] = []

	private originalPostMessage?: PostMessageFunc // Store original using the updated type

	constructor(context: vscode.ExtensionContext) {
		this.context = context
		console.log("[GrpcBridge] Initializing...")
		// Server will be started in setController after controller is available
	}

	/**
	 * Sets the Controller instance, wraps its postMessage function, and starts the gRPC server.
	 * This should be called during extension activation.
	 * @param controller The main Controller instance.
	 */
	public setController(controller: Controller): void {
		this.controller = controller
		console.log("[GrpcBridge] Controller instance registered.")

		// --- Wrap postMessageToWebview ---
		if (typeof controller.postMessageToWebview === "function") {
			// Store the original function, ensuring correct 'this' context
			this.originalPostMessage = controller.postMessageToWebview.bind(controller)
			// Create the wrapped function using the original - Corrected call with 'this.'
			const wrappedPostMessage = this.getWrappedPostMessage(this.originalPostMessage)
			// Overwrite the controller's method with our wrapper
			controller.postMessageToWebview = wrappedPostMessage
			console.log("[GrpcBridge] Controller.postMessageToWebview has been wrapped.")
		} else {
			console.error("[GrpcBridge] Controller.postMessageToWebview is not a function. Wrapping failed.")
			// Consider throwing an error or notifying the user
		}
		// --- End Wrapping ---

		// --- Create Service Implementations (Placeholder - will be refined) ---
		// These need to be created properly, likely mapping bridge methods
		const serviceImplementations = {
			taskControl: this.createTaskControlImplementation(), // Call helper method
			browser: this.createBrowserImplementation(), // Call helper method
			checkpoints: this.createCheckpointsImplementation(), // Call helper method
			mcp: this.createMcpImplementation(), // Call helper method
		}

		// Start the gRPC server now that we have the controller and wrapping is set up
		// Corrected argument order and added async handling
		startExternalGrpcServer(
			this.context, // 1st arg: context
			this.controller, // 2nd arg: controller instance
			serviceImplementations, // 3rd arg: implementations
		)
			.then(({ server, notifier }) => {
				this.grpcNotifier = notifier // Assign the resolved notifier
				console.log("[GrpcBridge] gRPC server started successfully.")
				// TODO: Handle server errors/disconnects if the notifier provides events
			})
			.catch((error) => {
				console.error("[GrpcBridge] Failed to start gRPC server:", error)
				vscode.window.showErrorMessage(`Failed to start Cline gRPC Bridge server: ${error.message}`)
				this.grpcNotifier = null // Ensure notifier is null on failure
			})
	}

	// --- Placeholder for Service Implementation Creation ---
	// --- Service Implementation Creation ---
	private createTaskControlImplementation(): grpc.UntypedServiceImplementation {
		// Map TaskControlService methods to GrpcBridge callbacks
		return {
			StartTask: (call: grpc.ServerWritableStream<any, ProtoExtensionMessage>) => {
				// Server-streaming RPC
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					console.error("[GrpcBridge:StartTask] Client ID missing in metadata")
					call.emit("error", { code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
					call.end()
					return
				}

				let requestData: any = null // Assuming client sends unary request data first (adjust if client streams)

				call.on("data", (chunk) => {
					// Handle potential client streaming if needed, for now assume unary request
					if (!requestData) requestData = chunk
					else console.warn("[GrpcBridge:StartTask] Received unexpected additional data from client.")
				})

				call.on("end", async () => {
					console.log(`[GrpcBridge:StartTask] Received end signal for client ${clientId}`)
					if (!requestData) {
						console.error("[GrpcBridge:StartTask] No request data received before end.")
						// Don't emit error here as stream might already be setup for notifications
						return
					}
					try {
						await this.initTask(clientId, requestData.text, requestData.images)
						console.log(
							`[GrpcBridge:StartTask] initTask completed for client ${clientId}. Stream open for notifications.`,
						)

						// --- Listener Setup for Server -> Client Streaming ---
						const stateListener = (cId: string, state: ProtoExtensionState) => {
							if (cId === clientId && !call.writableEnded) {
								// Check if stream is still writable
								console.log(`[GrpcBridge:StartTask] Sending state update to client ${clientId}`)
								// Construct valid ProtoExtensionMessage for state
								const message: ProtoExtensionMessage = {
									// Use full type
									type: ExtensionMessageType.STATE, // Use correct enum name
									errorMessage: undefined,
									genericText: undefined,
									// Set the oneof field directly
									state: state,
									partialMessage: undefined, // Explicitly set other oneof fields to undefined
									textMessage: undefined,
									toolUse: undefined,
									toolResult: undefined,
									// ... other oneof fields ...
								}
								call.write(message)
							}
						}
						const sayListener = (cId: string, msg: ProtoClineMessage, partial: boolean) => {
							if (cId === clientId && !call.writableEnded) {
								// Check if stream is still writable
								console.log(
									`[GrpcBridge:StartTask] Sending say update to client ${clientId} (partial: ${partial})`,
								)
								// Construct valid ProtoExtensionMessage for partial/say message
								const message: ProtoExtensionMessage = {
									// Use full type
									type: ExtensionMessageType.PARTIAL_MESSAGE, // Use correct enum name
									errorMessage: undefined,
									genericText: undefined,
									state: undefined,
									partialMessage: msg, // Set the oneof field directly
									textMessage: undefined,
									toolUse: undefined,
									toolResult: undefined,
									// ... other oneof fields ...
								}
								call.write(message)
							}
						}
						const askListener = (cId: string, msg: ProtoClineMessage) => {
							if (cId === clientId && !call.writableEnded) {
								// Check if stream is still writable
								console.log(`[GrpcBridge:StartTask] Sending ask request to client ${clientId}`)
								// Construct valid ProtoExtensionMessage for partial/ask message
								const message: ProtoExtensionMessage = {
									// Use full type
									type: ExtensionMessageType.PARTIAL_MESSAGE, // Use correct enum name
									errorMessage: undefined,
									genericText: undefined,
									state: undefined,
									partialMessage: msg, // Set the oneof field directly
									textMessage: undefined,
									toolUse: undefined,
									toolResult: undefined,
									// ... other oneof fields ...
								}
								call.write(message)
							}
						}
						const errorListener = (cId: string, errorMsg: string) => {
							if (cId === clientId && !call.writableEnded) {
								// Check if stream is still writable
								console.error(`[GrpcBridge:StartTask] Sending error to client ${clientId}: ${errorMsg}`)
								// Construct valid ProtoExtensionMessage for error
								const message: ProtoExtensionMessage = {
									// Use full type
									type: ExtensionMessageType.ERROR, // Use correct enum name
									errorMessage: errorMsg, // Correct field name
									genericText: undefined,
									// Ensure all oneof fields are undefined for error type
									state: undefined,
									partialMessage: undefined,
									textMessage: undefined,
									toolUse: undefined,
									toolResult: undefined,
									// ... other oneof fields ...
								}
								call.write(message)
								// Optionally end the stream on error, depending on desired behavior
								// call.end();
							}
						}

						this.grpcNotifier?.on("stateUpdate", stateListener)
						this.grpcNotifier?.on("sayUpdate", sayListener)
						this.grpcNotifier?.on("askRequest", askListener)
						this.grpcNotifier?.on("error", errorListener)

						// Clean up listeners when the client disconnects or task ends
						const cleanupListeners = () => {
							console.log(`[GrpcBridge:StartTask] Cleaning up listeners for client ${clientId}`)
							this.grpcNotifier?.off("stateUpdate", stateListener)
							this.grpcNotifier?.off("sayUpdate", sayListener)
							this.grpcNotifier?.off("askRequest", askListener)
							this.grpcNotifier?.off("error", errorListener)
							// Also handle client disconnect from bridge perspective
							this.handleClientDisconnect(clientId)
						}

						call.on("cancelled", () => {
							console.log(`[GrpcBridge:StartTask] Client ${clientId} cancelled the stream.`)
							cleanupListeners()
						})
						call.on("error", (err: grpc.ServiceError) => {
							console.error(`[GrpcBridge:StartTask] Stream error for client ${clientId}:`, err)
							cleanupListeners()
						})
						// TODO: Need a signal from the Task/Controller when a task *completes* normally to call call.end() and cleanupListeners().
						// Maybe the GrpcNotifier can emit a 'taskCompleted' event?
					} catch (error: any) {
						console.error(`[GrpcBridge:StartTask] Error during initTask for client ${clientId}: ${error.message}`)
						call.emit("error", { code: grpc.status.INTERNAL, details: `Failed to initialize task: ${error.message}` })
						call.end() // End stream on initialization error
					}
				})

				call.on("error", (err: grpc.ServiceError) => {
					// Handle errors that occur before 'end' if client sends invalid data immediately
					console.error(`[GrpcBridge:StartTask] Initial stream error for client ${clientId}:`, err)
					call.end()
				})
			},
			SendUserInput: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					await this.handleUserInput(clientId, call.request.text, call.request.images)
					callback(null, {}) // Indicate success (empty response)
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			SubmitAskResponse: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					// Construct the WebviewMessage format expected by handleAskResponse
					const webviewMsg: WebviewMessage = {
						type: "askResponse",
						askResponse: call.request.ask_response_type, // Map from proto enum/string
						text: call.request.text,
						images: call.request.images,
					}
					await this.handleAskResponse(clientId, webviewMsg)
					callback(null, {}) // Indicate success
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			// Assuming SubmitOptionsResponse maps similarly to SubmitAskResponse but uses selected_option
			SubmitOptionsResponse: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					// Construct the WebviewMessage format expected by handleAskResponse
					const webviewMsg: WebviewMessage = {
						type: "askResponse", // Still an askResponse internally
						askResponse: "messageResponse", // Treat option selection like a message response
						text: call.request.selected_option, // Use the selected option as the text
						// images: undefined, // Options responses typically don't have images
					}
					await this.handleAskResponse(clientId, webviewMsg)
					callback(null, {}) // Indicate success
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			ClearTask: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					await this.handleClearTask(clientId)
					callback(null, {}) // Indicate success
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			CancelTask: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					await this.handleCancelTask(clientId)
					callback(null, {}) // Indicate success
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			DeleteTaskWithId: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				// Deleting history might not require a specific client mapping, but check for safety/auth if needed
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					await this.handleDeleteTaskWithId(clientId, call.request.task_id)
					callback(null, {}) // Indicate success
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			ApplyBrowserSettings: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					// Assuming call.request is the ProtoBrowserSettings object
					await this.handleApplyBrowserSettings(clientId, call.request)
					callback(null, {}) // Indicate success
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			OpenFile: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					await this.handleOpenFile(clientId, call.request.file_path) // Corrected field name
					callback(null, {}) // Indicate success
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			GetLatestState: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<ProtoExtensionState>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				// Getting state might not require a specific client mapping, but check controller existence
				if (!this.controller) {
					Logger.error("[GrpcBridge:GetLatestState] Controller not available.")
					return callback({ code: grpc.status.FAILED_PRECONDITION, details: "Controller not available" })
				}
				try {
					// Use the method designed for sending state to the webview
					const currentState = await this.controller.getStateToPostToWebview()
					const protoState = mapExtensionStateToProto(currentState)
					if (protoState) {
						callback(null, protoState)
					} else {
						// This case should ideally not happen if mapping is correct and state exists
						Logger.error("[GrpcBridge:GetLatestState] Failed to map current state to proto.")
						callback({ code: grpc.status.INTERNAL, details: "Failed to map current state" })
					}
				} catch (error: any) {
					Logger.error(`[GrpcBridge:GetLatestState] Error getting state: ${error.message}`)
					callback({ code: grpc.status.INTERNAL, details: `Error getting state: ${error.message}` })
				}
			},
			// TODO: Add mappings for other TaskControlService methods...
			// ApplyApiConfiguration, ApplyAutoApprovalSettings, ApplyChatSettings, ApplyTelemetrySetting, UpdateSettings, etc.
			// ... other methods
		}
	}
	private createBrowserImplementation(): grpc.UntypedServiceImplementation {
		// Placeholder implementation for BrowserService
		return {
			ExecuteBrowserAction: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:ExecuteBrowserAction] Not implemented.")
				callback({ code: grpc.status.UNIMPLEMENTED, details: "ExecuteBrowserAction not implemented" })
			},
			// Add other BrowserService methods here if needed
		}
	}
	private createCheckpointsImplementation(): grpc.UntypedServiceImplementation {
		// Placeholder implementation for CheckpointsService
		return {
			GetCheckpoints: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:GetCheckpoints] Not implemented.")
				callback({ code: grpc.status.UNIMPLEMENTED, details: "GetCheckpoints not implemented" })
			},
			RestoreCheckpoint: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:RestoreCheckpoint] Not implemented.")
				callback({ code: grpc.status.UNIMPLEMENTED, details: "RestoreCheckpoint not implemented" })
			},
			CompareCheckpoints: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:CompareCheckpoints] Not implemented.")
				callback({ code: grpc.status.UNIMPLEMENTED, details: "CompareCheckpoints not implemented" })
			},
			// Add other CheckpointsService methods here if needed
		}
	}
	private createMcpImplementation(): grpc.UntypedServiceImplementation {
		// Placeholder implementation for McpService
		return {
			GetMcpServers: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:GetMcpServers] Not implemented.")
				callback({ code: grpc.status.UNIMPLEMENTED, details: "GetMcpServers not implemented" })
			},
			UseMcpTool: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:UseMcpTool] Not implemented.")
				callback({ code: grpc.status.UNIMPLEMENTED, details: "UseMcpTool not implemented" })
			},
			AccessMcpResource: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:AccessMcpResource] Not implemented.")
				callback({ code: grpc.status.UNIMPLEMENTED, details: "AccessMcpResource not implemented" })
			},
			// Add other McpService methods here if needed
		}
	}
	// Removed misplaced else block from previous edit

	// --- GrpcServerCallbacks Implementation ---

	/**
	 * Initiates a new task based on a request from an external gRPC client.
	 * This is called by the gRPC server implementation when it receives a startTask request.
	 */
	async initTask(clientId: string, text?: string, images?: string[]): Promise<void> {
		console.log(`[GrpcBridge] initTask callback invoked for client ${clientId}`)
		if (!this.controller) {
			console.error("[GrpcBridge] Controller not available for initTask.")
			// TODO: Notify client of error via grpcNotifier?
			throw new Error("Controller not available")
		}

		try {
			// TODO: Modify controller.initTask to accept clientId and return the Task instance reliably.
			// This could involve returning the Task instance directly, returning its ID and looking it up,
			// Call the modified controller.initTask which now returns the Task instance
			const taskInstance = await this.controller.initTask(text, images /*, historyItem? */)

			if (taskInstance) {
				// Map the clientId to the returned Task instance
				this.clientTaskMap.set(clientId, taskInstance)
				console.log(`[GrpcBridge] Task ${taskInstance.taskId} created and mapped to client ${clientId}`)

				// Removed incorrect notifier call - Notification should happen via gRPC stream
				console.log(
					`[GrpcBridge] Task ${taskInstance.taskId} started for client ${clientId}. Notification pending implementation.`,
				)

				// Register listener for task disposal
				taskInstance.onDispose(() => {
					if (this.clientTaskMap.delete(clientId)) {
						console.log(
							`[GrpcBridge] Removed task mapping for client ${clientId} (task ${taskInstance.taskId}) upon disposal.`,
						)
					} else {
						console.warn(
							`[GrpcBridge] Attempted to remove task mapping for client ${clientId} on disposal, but it was not found in the map.`,
						)
					}
				})
			} else {
				console.error(`[GrpcBridge] Failed to get task instance after calling controller.initTask for client ${clientId}`)
				throw new Error("Task instance could not be retrieved after initialization")
			}
		} catch (error) {
			console.error(`[GrpcBridge] Error during initTask execution for client ${clientId}:`, error)
			// TODO: Notify client of error via grpcNotifier?
			throw error // Re-throw to be handled by the server's error handling
		}
	}

	/**
	 * Handles an 'ask' response received from the external gRPC client.
	 */
	async handleAskResponse(clientId: string, response: WebviewMessage): Promise<void> {
		console.log(`[GrpcBridge] handleAskResponse received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task && response.type === "askResponse") {
			// Use the existing method on Task designed for webview responses
			console.log(`[GrpcBridge] Forwarding ask response to task ${task.taskId}`)
			task.handleWebviewAskResponse(response.askResponse!, response.text, response.images)
		} else {
			if (!task) console.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleAskResponse`)
			if (response.type !== "askResponse")
				console.warn(`[GrpcBridge] Received non-askResponse message in handleAskResponse: ${response.type}`)
		}
	}

	/**
	 * Handles a tool result received from the external gRPC client.
	 * NOTE: Based on user feedback, tool execution is internal. This callback
	 * should likely not be used or should error if called unexpectedly.
	 */
	async handleToolResult(clientId: string, result: Partial<ProtoToolResultBlock>): Promise<void> {
		Logger.warn(
			`[GrpcBridge] handleToolResult received for client ${clientId}, but external tool execution is not expected. Ignoring.`,
		)
		const task = this.clientTaskMap.get(clientId)
		if (!task) {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleToolResult`)
		}
		// Do nothing, as tool results are handled internally by the Task.
		// If this function being called indicates a misunderstanding in the protocol
		// or client implementation, consider throwing an error:
		// throw new Error("handleToolResult called, but external tool execution is not supported/expected.");
	}

	/**
	 * Handles user input text/images received from the external gRPC client.
	 * This should only succeed if the Task is currently waiting for an 'ask' response.
	 */
	async handleUserInput(clientId: string, text?: string, images?: string[]): Promise<void> {
		Logger.info(`[GrpcBridge] handleUserInput received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			// Check if the task is actually waiting for an ask response.
			// We approximate this by checking if the internal askResponse property is undefined.
			// A more robust check would involve a state property on the Task class itself.
			// @ts-expect-error Accessing private property for state check
			if (task.askResponse === undefined) {
				// Task is likely not waiting for an ask response.
				Logger.warn(
					`[GrpcBridge] Received user input for task ${task.taskId} via handleUserInput, but the task is not currently waiting for an 'ask' response. Input ignored.`,
				)
				// Optionally, notify the client via gRPC error
				throw new Error("Task is not currently expecting input.")
			} else {
				// Task seems to be waiting for an ask response. Use the existing mechanism.
				// We simulate a 'messageResponse' type of ask response.
				Logger.info(`[GrpcBridge] Forwarding user input as 'messageResponse' to task ${task.taskId}`)
				task.handleWebviewAskResponse("messageResponse", text, images)
			}
		} else {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleUserInput`)
			throw new Error("Task associated with client ID not found.")
		}
	}

	/**
	 * Handles generic webview messages received from the external gRPC client.
	 */
	async handleGenericMessage(clientId: string, message: WebviewMessage): Promise<void> {
		console.log(`[GrpcBridge] handleGenericMessage received for client ${clientId}`)
		if (this.controller) {
			// The controller's handleWebviewMessage likely uses the currently active task (this.controller.task).
			// We don't need to inject taskId into the message itself.
			// Ensure the correct task is active if necessary, although handleGenericMessage might be for global actions.
			const task = this.clientTaskMap.get(clientId)
			if (task && this.controller.task?.taskId !== task.taskId) {
				console.warn(
					`[GrpcBridge] handleGenericMessage received for client ${clientId}, but controller's active task (${this.controller.task?.taskId}) doesn't match mapped task (${task.taskId}). Proceeding with controller's active task context.`,
				)
			}
			console.log(`[GrpcBridge] Forwarding generic message type ${message.type} to controller.`)
			// Use the controller's existing handler with the original message
			this.controller.handleWebviewMessage(message)
		} else {
			console.warn(`[GrpcBridge] Controller not available in handleGenericMessage`)
		}
	}

	// --- New Specific Callback Implementations ---

	async handleClearTask(clientId: string): Promise<void> {
		console.log(`[GrpcBridge] handleClearTask received for client ${clientId}. Treating as abort request.`)
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			console.log(`[GrpcBridge] Aborting task ${task.taskId} due to clearTask request from client ${clientId}.`)
			try {
				// Call abortTask directly on the specific task instance.
				// This triggers the 'dispose' event for map cleanup.
				await task.abortTask()
			} catch (error) {
				console.error(
					`[GrpcBridge] Error aborting task ${task.taskId} during handleClearTask for client ${clientId}:`,
					error,
				)
				// Optionally notify client of error
			}
		} else {
			console.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleClearTask`)
			// Optionally notify client that task was not found
		}
	}

	async handleCancelTask(clientId: string): Promise<void> {
		console.log(`[GrpcBridge] handleCancelTask received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			console.log(`[GrpcBridge] Aborting task ${task.taskId} due to cancelTask request from client ${clientId}.`)
			try {
				// Call abortTask directly on the specific task instance.
				// This triggers the 'dispose' event for map cleanup.
				await task.abortTask()
			} catch (error) {
				console.error(
					`[GrpcBridge] Error aborting task ${task.taskId} during handleCancelTask for client ${clientId}:`,
					error,
				)
				// Optionally notify client of error
			}
		} else {
			console.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleCancelTask`)
			// Optionally notify client that task was not found
		}
	}

	async handleDeleteTaskWithId(clientId: string, taskId: string): Promise<void> {
		console.log(`[GrpcBridge] handleDeleteTaskWithId received for client ${clientId}, taskId ${taskId}`)
		if (this.controller) {
			console.log(`[GrpcBridge] Deleting task ${taskId}`)
			// Controller already has a method for this
			await this.controller.deleteTaskWithId(taskId)
			// Also remove from our map if it exists
			for (const [cId, task] of this.clientTaskMap.entries()) {
				if (task.taskId === taskId) {
					this.clientTaskMap.delete(cId)
					console.log(`[GrpcBridge] Removed task mapping for deleted task ${taskId}`)
					break
				}
			}
		} else {
			console.warn(`[GrpcBridge] Controller not available in handleDeleteTaskWithId`)
		}
	}

	async handleApplyBrowserSettings(clientId: string, settings: any): Promise<void> {
		console.log(`[GrpcBridge] handleApplyBrowserSettings received for client ${clientId}`)
		// TODO: Implement logic to apply browser settings.
		// This likely involves calling updateGlobalState from '../storage/state'.
		// Need to import BrowserSettings type from '../../shared/BrowserSettings'.
		// Example:
		// import { updateGlobalState } from '../../core/storage/state';
		// import { BrowserSettings } from '../../shared/BrowserSettings';
		try {
			// Assuming the incoming 'settings' object matches the BrowserSettings structure
			await updateGlobalState(this.context, "browserSettings", settings as BrowserSettings)
			// Notify the webview (and potentially other parts of the extension) about the state change
			await this.controller?.postStateToWebview()
			console.log(`[GrpcBridge] Applied browser settings for client ${clientId}`)
		} catch (error) {
			console.error(`[GrpcBridge] Error applying browser settings for client ${clientId}:`, error)
			throw new Error(`Failed to apply browser settings: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	async handleOpenFile(clientId: string, filePath: string): Promise<void> {
		console.log(`[GrpcBridge] handleOpenFile received for client ${clientId}, path ${filePath}`)
		if (this.controller) {
			try {
				// Call the imported file service handler
				await handleFileServiceRequest(this.controller, "openFile", { value: filePath })
				console.log(`[GrpcBridge] Opened file ${filePath} for client ${clientId}`)
			} catch (error) {
				console.error(`[GrpcBridge] Error opening file ${filePath} for client ${clientId}:`, error)
				throw new Error(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`)
			}
		} else {
			console.warn(`[GrpcBridge] Controller not available in handleOpenFile`)
			throw new Error("Controller not available to handle openFile request.")
		}
	}

	/**
	 * Handles the disconnection of a gRPC client.
	 * Finds the associated task and aborts it.
	 */
	async handleClientDisconnect(clientId: string): Promise<void> {
		console.log(`[GrpcBridge] handleClientDisconnect received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			console.log(`[GrpcBridge] Aborting task ${task.taskId} due to client ${clientId} disconnection.`)
			try {
				// Calling abortTask will trigger the 'dispose' event,
				// which in turn removes the task from clientTaskMap via the listener in initTask.
				await task.abortTask()
			} catch (error) {
				console.error(`[GrpcBridge] Error aborting task ${task.taskId} for disconnected client ${clientId}:`, error)
			}
		} else {
			console.warn(`[GrpcBridge] Client ${clientId} disconnected, but no associated task found in the map.`)
		}
	}

	// --- Message Interception Logic ---

	/**
	 * Creates a wrapper around the original postMessage function to intercept messages.
	 * Creates a wrapper around the original postMessage function to intercept messages.
	 * @param originalPostMessage The original function (bound to the controller) to send messages to the webview, accepting taskId.
	 * @returns A new function that intercepts messages for gRPC tasks, matching the updated signature.
	 */
	private getWrappedPostMessage(originalPostMessage: PostMessageFunc): PostMessageFunc {
		// Return the wrapper function, now accepting taskId
		return (message: ExtensionMessage, taskId?: string): Promise<void> => {
			// Determine if this message belongs to a gRPC-controlled task using the provided taskId
			const clientId = this.findClientIdByTaskId(taskId) // Use the taskId passed from the Controller

			// If it's a gRPC task (based on the provided taskId) and the notifier is ready, intercept and process
			if (clientId && this.grpcNotifier) {
				console.log(
					`[GrpcBridge] Intercepted message type ${message?.type || "unknown"} for gRPC client ${clientId}, task ${taskId}`,
				)
				try {
					// <<< TRY starts
					// We still use the 'message' object for mapping, just the routing decision is based on activeTaskId
					const extMsg = message

					// Handle error property first, if present
					if (extMsg.error) {
						console.warn(`[GrpcBridge] Intercepted error for client ${clientId}: ${extMsg.error}`)
						// Emit an 'error' event instead of calling notifyError
						this.grpcNotifier.emit("error", clientId, extMsg.error)
						// Continue processing the main type as well
					}

					// Map based on the TOP-LEVEL ExtensionMessage type
					switch (extMsg.type) {
						case "state":
							if (extMsg.state) {
								const protoState = mapExtensionStateToProto(extMsg.state)
								if (protoState) {
									// Emit a 'stateUpdate' event instead of calling notifyState
									this.grpcNotifier.emit("stateUpdate", clientId, protoState)
									console.log(`[GrpcBridge] State update event emitted for client ${clientId}.`)
								}
							}
							break
						case "partialMessage": // Represents both partial and complete 'say', 'ask', 'tool' etc. messages from Cline
							if (extMsg.partialMessage) {
								const protoClineMsg = mapClineMessageToProto(extMsg.partialMessage)
								if (protoClineMsg) {
									// Determine the specific notification type based on the ClineMessage content
									if (extMsg.partialMessage.type === "say") {
										// Handle different 'say' types if needed, e.g., tool use vs text
										// Emit a 'sayUpdate' event for all 'say' types
										this.grpcNotifier.emit(
											"sayUpdate",
											clientId,
											protoClineMsg,
											extMsg.partialMessage.partial ?? false,
										)
										console.log(
											`[GrpcBridge] 'Say' update event emitted for client ${clientId} (type: ${extMsg.partialMessage.say}).`,
										)
									} else if (extMsg.partialMessage.type === "ask" && extMsg.partialMessage.ask) {
										// Emit an 'askRequest' event
										// The data structure previously created as askData is essentially the protoClineMsg itself
										this.grpcNotifier.emit("askRequest", clientId, protoClineMsg)
										console.log(
											`[GrpcBridge] 'Ask' request event emitted for client ${clientId} (type: ${extMsg.partialMessage.ask}).`,
										)
									}
								}
							}
							break
						// Note: 'toolUse' and 'toolResult' are not top-level ExtensionMessage types.
						// Tool usage *requests* from the AI are handled internally within the Task class.
						// Tool usage *display* in the chat comes via 'partialMessage' with say='tool'.
						// Tool *results* from the client come via handleToolResult callback.

						// Add cases for other relevant ExtensionMessage types here if needed
						// e.g., 'relinquishControl', 'workspaceUpdated', 'taskStarted' (if sent from ext->webview)
						default:
							// Only log if there wasn't an error already handled above
							if (!extMsg.error) {
								console.log(
									`[GrpcBridge] No specific gRPC mapping defined for intercepted message type: ${extMsg.type}`,
								)
							}
						// Optionally, forward unmapped messages if needed, or just ignore.
					} // <<< SWITCH ends

					// Decide whether to ALSO send to webview. For now, assume we DON'T if it's a gRPC task.
					// Indicate the message was handled (by gRPC) and prevent it from going to the webview.
					// Return an empty resolved promise to match the expected Promise<void> signature.
					return Promise.resolve()
				} catch (error) {
					// <<< CATCH starts
					console.error(`[GrpcBridge] Error mapping or sending intercepted message via gRPC:`, error)
					// If there was an error during gRPC processing, prevent the message from reaching the webview.
					// Return an empty resolved promise to match the signature.
					return Promise.resolve() // Indicate failure, message not sent to webview either.
				}
			} else {
				// Not a gRPC task (no clientId found for the taskId), or notifier not ready.
				// Call the original postMessage function, passing the message AND the taskId along.
				return originalPostMessage(message, taskId)
			}
		}
	}

	// --- Utility Methods ---

	/**
	 * Finds the external clientId associated with a given internal Cline Task ID.
	 * @param taskId The internal Cline Task ID.
	 * @returns The external clientId, or undefined if no mapping exists.
	 */
	private findClientIdByTaskId(taskId: string | undefined): string | undefined {
		if (!taskId) return undefined
		for (const [clientId, task] of this.clientTaskMap.entries()) {
			if (task.taskId === taskId) {
				return clientId
			}
		}
		return undefined // Explicitly return undefined if loop finishes
	}

	// --- vscode.Disposable Implementation ---

	dispose(): void {
		// Use void as return type for dispose
		console.log("[GrpcBridge] Disposing...")

		// Restore original postMessage on controller if wrapped
		if (this.controller && this.originalPostMessage && this.controller.postMessageToWebview !== this.originalPostMessage) {
			console.log("[GrpcBridge] Restoring original Controller.postMessageToWebview.")
			this.controller.postMessageToWebview = this.originalPostMessage
		}
		this.originalPostMessage = undefined // Clear reference

		// Stop the gRPC server
		if (this.grpcNotifier) {
			try {
				stopExternalGrpcServer()
				console.log("[GrpcBridge] gRPC server stopped.")
			} catch (error) {
				console.error("[GrpcBridge] Error stopping gRPC server:", error)
			}
			this.grpcNotifier = null // Assign null instead of undefined
		}
		// Clear task map
		this.clientTaskMap.clear()
		// Dispose other disposables
		vscode.Disposable.from(...this.disposables).dispose()
		this.disposables = []
		console.log("[GrpcBridge] Disposed.")
	}
}

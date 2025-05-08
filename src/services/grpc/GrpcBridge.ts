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
	ProtoExtensionState, // This is the correct one
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
import * as taskControlPb from "../../shared/proto/task_control" // Namespace import
import { ExtensionMessage, ClineMessage } from "../../shared/ExtensionMessage" // Import ExtensionMessage for type checking
import { ToolResponse } from "../../core/task" // Import internal tool types from index
import { ToolUse } from "@core/assistant-message" // Import ToolUse type
import { mapProtoToolResultToInternal, mapMcpServersToProto } from "./mapper" // Import the new mapper & MCP mapper
import { formatResponse } from "@core/prompts/responses" // Import formatResponse for image blocks
import Anthropic from "@anthropic-ai/sdk" // Import Anthropic for ContentBlockParam type
import { Logger } from "@services/logging/Logger" // Import Logger
import { Timestamp } from "google-protobuf/google/protobuf/timestamp_pb" // Import Timestamp
import { updateGlobalState, updateApiConfiguration, getAllExtensionState } from "../../core/storage/state" // Import for settings update & API config
import { ApiConfiguration, ApiProvider } from "../../shared/api" // Import internal ApiConfiguration type
import { buildApiHandler } from "@api/index" // Import buildApiHandler
import { BrowserSettings } from "../../shared/BrowserSettings" // Import settings type
import * as fs from "fs/promises" // Added for file operations
import { DEFAULT_MCP_TIMEOUT_SECONDS } from "@shared/mcp" // Added for default timeout
import { handleFileServiceRequest } from "../../core/controller/file" // Import file handler
import * as grpc from "@grpc/grpc-js" // Import grpc for types

// Define the expected signature for the postMessage function, now including taskId
type PostMessageFunc = (message: ExtensionMessage, taskId?: string) => Promise<void>

// Define the callbacks interface locally
interface GrpcServerCallbacks {
	initTask(clientId: string, text?: string, images?: string[]): Promise<Task | undefined> // Updated return type
	handleAskResponse(clientId: string, response: WebviewMessage): Promise<void>
	handleToolResult(clientId: string, result: Partial<ProtoToolResultBlock>): Promise<void>
	handleUserInput(clientId: string, text?: string, images?: string[]): Promise<void>
	handleGenericMessage(clientId: string, message: WebviewMessage): Promise<void>
	handleClearTask(clientId: string): Promise<void>
	handleCancelTask(clientId: string): Promise<void>
	handleDeleteTaskWithId(clientId: string, taskId: string): Promise<void>
	handleApplyBrowserSettings(clientId: string, settings: any): Promise<void>
	handleOpenFile(clientId: string, filePath: string): Promise<void>
	handleUpdateSettings(clientId: string, settings: any): Promise<void> // Added for UpdateSettings RPC
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
		Logger.info("[GrpcBridge] Initializing...") // Use static Logger
		// Server will be started in setController after controller is available
	}

	/**
	 * Sets the Controller instance, wraps its postMessage function, and starts the gRPC server.
	 * This should be called during extension activation.
	 * @param controller The main Controller instance.
	 */
	public setController(controller: Controller): void {
		this.controller = controller
		Logger.info("[GrpcBridge] Controller instance registered.") // Use static Logger

		// --- Wrap postMessageToWebview ---
		if (typeof controller.postMessageToWebview === "function") {
			// Store the original function, ensuring correct 'this' context
			this.originalPostMessage = controller.postMessageToWebview.bind(controller)
			// Create the wrapped function using the original - Corrected call with 'this.'
			const wrappedPostMessage = this.getWrappedPostMessage(this.originalPostMessage)
			// Overwrite the controller's method with our wrapper
			controller.postMessageToWebview = wrappedPostMessage
			Logger.info("[GrpcBridge] Controller.postMessageToWebview has been wrapped.") // Use static Logger
		} else {
			Logger.error("[GrpcBridge] Controller.postMessageToWebview is not a function. Wrapping failed.") // Use static Logger
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
				Logger.info("[GrpcBridge] gRPC server started successfully.") // Use static Logger
				// TODO: Handle server errors/disconnects if the notifier provides events
			})
			.catch((error) => {
				Logger.error("[GrpcBridge] Failed to start gRPC server:", error) // Use static Logger
				vscode.window.showErrorMessage(`Failed to start Cline gRPC Bridge server: ${error.message}`)
				this.grpcNotifier = null // Ensure notifier is null on failure
			})
	}

	// --- Placeholder for Service Implementation Creation ---
	// --- Service Implementation Creation ---
	private createTaskControlImplementation(): grpc.UntypedServiceImplementation {
		// Map TaskControlService methods to GrpcBridge callbacks
		return {
			startTask: (call: grpc.ServerWritableStream<taskControlPb.NewTaskRequest, taskControlPb.ExtensionMessage>) => {
				// Changed from StartTask to startTask
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					Logger.error("[GrpcBridge:StartTask] Client ID missing in metadata")
					call.emit("error", { code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
					if (!call.writableEnded) call.end()
					return
				}

				const initialRequest = call.request
				Logger.info(
					`[GrpcBridge:StartTask] Received for client ${clientId}. Text: ${initialRequest.text?.substring(0, 50)}...`,
				)
				;(async () => {
					try {
						const taskInstance = await this.initTask(
							clientId,
							initialRequest.text,
							initialRequest.chatContent?.images,
						)

						if (!taskInstance || !taskInstance.taskId) {
							Logger.error(
								`[GrpcBridge:StartTask] Failed to initialize task for client ${clientId}. Sending ERROR and closing stream.`,
							)
							const errorMessage: taskControlPb.ExtensionMessage = {
								type: taskControlPb.ExtensionMessageType.ERROR,
								errorMessage: "Failed to initialize task internally.",
							}
							if (!call.writableEnded) {
								call.write(errorMessage)
								call.end()
							}
							return
						}

						const currentTaskId = taskInstance.taskId
						const extensionVersion = this.context.extension.packageJSON.version || "unknown"
						Logger.info(
							`[GrpcBridge:StartTask] Task ${currentTaskId} initialized for client ${clientId}. Sending TASK_STARTED.`,
						)

						const taskStartedMessage: taskControlPb.ExtensionMessage = {
							type: taskControlPb.ExtensionMessageType.TASK_STARTED,
							taskStarted: { taskId: currentTaskId, version: extensionVersion },
							// errorMessage is not part of the 'payload' oneof and should not be set here unless it's an error message
						}
						Logger.info(
							`[GrpcBridge:StartTask] Constructed TASK_STARTED message for client ${clientId}: ${JSON.stringify(taskStartedMessage)}`,
						)
						if (!call.writableEnded) {
							call.write(taskStartedMessage)
						}
						Logger.info(
							`[GrpcBridge:StartTask] Sent TASK_STARTED (ID: ${currentTaskId}, Version: ${extensionVersion}) to client ${clientId}.`,
						)

						// Setup listeners for messages from this specific task
						const stateListener = (cId: string, state: ProtoExtensionState) => {
							if (cId === clientId && taskInstance.taskId === currentTaskId && !call.writableEnded) {
								Logger.info(
									`[GrpcBridge:StartTask:stateListener] Sending state update for task ${currentTaskId} to client ${clientId}`,
								)
								call.write({ type: taskControlPb.ExtensionMessageType.STATE, state: state })
							}
						}
						const sayListener = (cId: string, msg: taskControlPb.ClineMessage, partial: boolean) => {
							if (cId === clientId && taskInstance.taskId === currentTaskId && !call.writableEnded) {
								Logger.info(
									`[GrpcBridge:StartTask:sayListener] Sending say (partial: ${partial}) for task ${currentTaskId} to client ${clientId}`,
								)
								// Assuming PARTIAL_MESSAGE maps to partialMessage field in the oneof
								call.write({ type: taskControlPb.ExtensionMessageType.PARTIAL_MESSAGE, partialMessage: msg })
							}
						}
						const askListener = (cId: string, msg: taskControlPb.ClineMessage) => {
							if (cId === clientId && taskInstance.taskId === currentTaskId && !call.writableEnded) {
								Logger.info(
									`[GrpcBridge:StartTask:askListener] Sending ask for task ${currentTaskId} to client ${clientId}`,
								)
								// Assuming PARTIAL_MESSAGE is also used for ask, as per current structure
								call.write({ type: taskControlPb.ExtensionMessageType.PARTIAL_MESSAGE, partialMessage: msg })
							}
						}
						const errorListener = (cId: string, errorMsg: string) => {
							if (cId === clientId && !call.writableEnded) {
								Logger.error(
									`[GrpcBridge:StartTask:errorListener] Sending error for task ${currentTaskId} to client ${clientId}: ${errorMsg}`,
								)
								call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: errorMsg }) // errorMessage is a direct field, not in oneof
							}
						}

						this.grpcNotifier?.on("stateUpdate", stateListener)
						this.grpcNotifier?.on("sayUpdate", sayListener)
						this.grpcNotifier?.on("askRequest", askListener)
						this.grpcNotifier?.on("error", errorListener) // General error listener

						const cleanupListeners = () => {
							Logger.info(
								`[GrpcBridge:StartTask] Cleaning up listeners for task ${currentTaskId} on client ${clientId} stream.`,
							)
							this.grpcNotifier?.off("stateUpdate", stateListener)
							this.grpcNotifier?.off("sayUpdate", sayListener)
							this.grpcNotifier?.off("askRequest", askListener)
							this.grpcNotifier?.off("error", errorListener)
						}

						taskInstance.onDispose(() => {
							Logger.info(
								`[GrpcBridge:StartTask] Task ${currentTaskId} disposed. Ending stream for client ${clientId}.`,
							)
							cleanupListeners()
							if (!call.writableEnded) {
								call.end()
							}
						})

						call.on("cancelled", () => {
							Logger.info(
								`[GrpcBridge:StartTask] Stream for task ${currentTaskId} cancelled by client ${clientId}.`,
							)
							cleanupListeners()
							if (!taskInstance.isDisposed) {
								Logger.info(
									`[GrpcBridge:StartTask] Aborting task ${currentTaskId} due to client stream cancellation.`,
								)
								taskInstance
									.abortTask()
									.catch((err) =>
										Logger.error(
											`[GrpcBridge:StartTask] Error aborting task ${currentTaskId} on cancellation: ${err}`,
										),
									)
							}
							if (!call.writableEnded) {
								call.end()
							}
						})

						call.on("error", (err: grpc.ServiceError) => {
							Logger.error(
								`[GrpcBridge:StartTask] Stream error for task ${currentTaskId} on client ${clientId}:`,
								err,
							)
							cleanupListeners()
							if (!taskInstance.isDisposed) {
								Logger.info(`[GrpcBridge:StartTask] Aborting task ${currentTaskId} due to stream error.`)
								taskInstance
									.abortTask()
									.catch((e) =>
										Logger.error(
											`[GrpcBridge:StartTask] Error aborting task ${currentTaskId} on stream error: ${e}`,
										),
									)
							}
							if (!call.writableEnded) {
								call.end()
							}
						})
					} catch (error: any) {
						Logger.error(
							`[GrpcBridge:StartTask] Outer error during task setup for client ${clientId}: ${error.message} ${error.stack}`,
						)
						if (!call.writableEnded) {
							const errorMessage: taskControlPb.ExtensionMessage = {
								type: taskControlPb.ExtensionMessageType.ERROR,
								errorMessage: `Failed to set up task stream: ${error.message}`,
							}
							call.write(errorMessage)
							call.end()
						}
					}
				})()
			},
			sendUserInput: (call: grpc.ServerWritableStream<taskControlPb.InvokeRequest, taskControlPb.ExtensionMessage>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					Logger.error("[GrpcBridge:sendUserInput] Client ID missing in metadata")
					const errorResponse: taskControlPb.ExtensionMessage = {
						type: taskControlPb.ExtensionMessageType.ERROR,
						errorMessage: "Client ID missing in metadata for SendUserInput",
					}
					if (!call.writableEnded) {
						call.write(errorResponse)
						call.end()
					}
					return
				}

				const request = call.request as taskControlPb.InvokeRequest // Corrected type
				Logger.info(
					`[GrpcBridge:sendUserInput] Received for client ${clientId}. Text: ${request.text?.substring(0, 50)}...`,
				)
				;(async () => {
					try {
						await this.handleUserInput(clientId, request.text, request.images)
						// If handleUserInput completes without error, the input is accepted.
						// AI responses will be sent via the StartTask stream.
						// We can optionally send an ACK here or just end the stream.
						// For now, just end, as client isn't expecting specific message on *this* stream.
						Logger.info(`[GrpcBridge:sendUserInput] User input processed for client ${clientId}. Ending stream.`)
						if (!call.writableEnded) {
							call.end()
						}
					} catch (error: any) {
						Logger.error(
							`[GrpcBridge:sendUserInput] Error processing user input for client ${clientId}: ${error.message} ${error.stack}`,
						)
						const errorResponse: taskControlPb.ExtensionMessage = {
							type: taskControlPb.ExtensionMessageType.ERROR,
							errorMessage: `Failed to process user input: ${error.message}`,
						}
						if (!call.writableEnded) {
							call.write(errorResponse)
							call.end()
						}
					}
				})()
			},
			SubmitAskResponse: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					const webviewMsg: WebviewMessage = {
						type: "askResponse",
						askResponse: call.request.ask_response_type,
						text: call.request.text,
						images: call.request.images,
					}
					await this.handleAskResponse(clientId, webviewMsg)
					callback(null, {})
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			SubmitOptionsResponse: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					const webviewMsg: WebviewMessage = {
						type: "askResponse",
						askResponse: "messageResponse",
						text: call.request.selected_option,
					}
					await this.handleAskResponse(clientId, webviewMsg)
					callback(null, {})
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			ClearTask: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					await this.handleClearTask(clientId)
					callback(null, {})
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			CancelTask: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					await this.handleCancelTask(clientId)
					callback(null, {})
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			DeleteTaskWithId: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					await this.handleDeleteTaskWithId(clientId, call.request.task_id)
					callback(null, {})
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			ApplyBrowserSettings: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					await this.handleApplyBrowserSettings(clientId, call.request)
					callback(null, {})
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			OpenFile: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				try {
					await this.handleOpenFile(clientId, call.request.file_path)
					callback(null, {})
				} catch (error: any) {
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			GetLatestState: async (
				call: grpc.ServerUnaryCall<any, any>,
				callback: grpc.sendUnaryData<taskControlPb.ExtensionState>,
			) => {
				if (!this.controller) {
					Logger.error("[GrpcBridge:GetLatestState] Controller not available.")
					return callback({ code: grpc.status.FAILED_PRECONDITION, details: "Controller not available" })
				}
				try {
					const currentState = await this.controller.getStateToPostToWebview()
					const protoState = mapExtensionStateToProto(currentState)
					if (protoState) {
						callback(null, protoState)
					} else {
						Logger.error("[GrpcBridge:GetLatestState] Failed to map current state to proto.")
						callback({ code: grpc.status.INTERNAL, details: "Failed to map current state" })
					}
				} catch (error: any) {
					Logger.error(`[GrpcBridge:GetLatestState] Error getting state: ${error.message}`)
					callback({ code: grpc.status.INTERNAL, details: `Error getting state: ${error.message}` })
				}
			},
			updateSettings: async (
				// Changed from UpdateSettings to updateSettings
				call: grpc.ServerWritableStream<taskControlPb.UpdateSettingsRequest, taskControlPb.ExtensionMessage>,
			) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				Logger.info(
					`[GrpcBridge:updateSettings] Handler entered. Client ID: ${clientId}, Request: ${JSON.stringify(call.request)}`,
				)
				// Call the existing handleUpdateSettings method
				// Note: The original proto defines UpdateSettings as streaming, but the Go client calls it as unary.
				// The current GrpcBridge.handleUpdateSettings is async void.
				// For now, we'll adapt to send a single confirmation and end, assuming the client expects this.
				// If the client truly expects a stream, this handler and the GrpcBridge.handleUpdateSettings need adjustment.
				try {
					// Assuming the actual logic for updating settings is in this.handleUpdateSettings
					// However, the gRPC method in proto is `stream ExtensionMessage`, so we must stream.
					// The Go client seems to treat it as unary and then tries to Recv.
					// Let's call the internal handler first, then send confirmation.
					await this.handleUpdateSettings(clientId!, call.request) // Pass the request object

					const confirmationMessage: taskControlPb.ExtensionMessage = {
						type: taskControlPb.ExtensionMessageType.DID_UPDATE_SETTINGS,
					}
					Logger.info("[GrpcBridge:updateSettings] Writing DID_UPDATE_SETTINGS confirmation...")
					if (!call.writableEnded) {
						call.write(confirmationMessage)
					}
					Logger.info("[GrpcBridge:updateSettings] DID_UPDATE_SETTINGS confirmation written. Ending stream.")
					if (!call.writableEnded) {
						call.end()
					}
				} catch (e: any) {
					Logger.error(`[GrpcBridge:updateSettings] Error in updateSettings handler: ${e.message} ${e.stack}`)
					if (!call.writableEnded) {
						call.emit("error", { code: grpc.status.INTERNAL, details: `updateSettings handler error: ${e.message}` })
					}
					if (!call.writableEnded) {
						call.end()
					}
				}
			},
		}
	}
	private createBrowserImplementation(): grpc.UntypedServiceImplementation {
		return {
			getBrowserConnectionInfo: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				}
				const task = this.clientTaskMap.get(clientId)
				if (!task) {
					// If no active task, it implies no active browser session through Cline's Task
					return callback(null, { is_connected: false, is_remote: false })
				}
				try {
					const connectionInfo = task.browserSession.getConnectionInfo()
					// Map to proto (fields are already aligned: is_connected, is_remote, host)
					callback(null, connectionInfo)
				} catch (error: any) {
					Logger.error(`[GrpcBridge:getBrowserConnectionInfo] Error: ${error.message}`) // Use static Logger
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			ExecuteBrowserAction: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:ExecuteBrowserAction] Not implemented.") // Use static Logger
				callback({ code: grpc.status.UNIMPLEMENTED, details: "ExecuteBrowserAction not implemented" })
			},
			// TODO: Implement other browser service methods like testBrowserConnection, discoverBrowser, etc.
		}
	}
	private createCheckpointsImplementation(): grpc.UntypedServiceImplementation {
		return {
			checkpointDiff: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				}
				const task = this.clientTaskMap.get(clientId)
				if (!task) {
					return callback({ code: grpc.status.FAILED_PRECONDITION, details: "No active task for this client" })
				}
				try {
					const messageTs = call.request.value // Assuming Int64Request has a 'value' field for the timestamp
					if (typeof messageTs !== "number" && typeof messageTs !== "string") {
						// number for JS, string from proto if it's int64
						return callback({ code: grpc.status.INVALID_ARGUMENT, details: "Invalid message timestamp provided" })
					}
					// For now, default seeNewChangesSinceLastTaskCompletion to false.
					// This could be an additional parameter in the proto if needed.
					await task.presentMultifileDiff(Number(messageTs), false)
					callback(null, {}) // Returns Empty
				} catch (error: any) {
					Logger.error(`[GrpcBridge:checkpointDiff] Error: ${error.message}`) // Use static Logger
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			GetCheckpoints: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:GetCheckpoints] Not implemented.") // Use static Logger
				callback({ code: grpc.status.UNIMPLEMENTED, details: "GetCheckpoints not implemented" })
			},
			RestoreCheckpoint: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:RestoreCheckpoint] Not implemented.") // Use static Logger
				callback({ code: grpc.status.UNIMPLEMENTED, details: "RestoreCheckpoint not implemented" })
			},
			CompareCheckpoints: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:CompareCheckpoints] Not implemented.") // Use static Logger
				callback({ code: grpc.status.UNIMPLEMENTED, details: "CompareCheckpoints not implemented" })
			},
		}
	}
	private createMcpImplementation(): grpc.UntypedServiceImplementation {
		return {
			toggleMcpServer: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
				}
				if (!this.controller || !this.controller.mcpHub) {
					return callback({ code: grpc.status.FAILED_PRECONDITION, details: "MCPHub not available" })
				}
				try {
					Logger.info(
						`[GrpcBridge:toggleMcpServer] Raw request object for client ${clientId}: ${JSON.stringify(call.request)}`,
					)
					const { serverName, disabled } = call.request

					Logger.info(`[GrpcBridge:toggleMcpServer] Accessed serverName: '${serverName}', disabled: ${disabled}`)

					if (typeof serverName !== "string" || typeof disabled !== "boolean") {
						Logger.error(
							`[GrpcBridge:toggleMcpServer] Invalid request parameters. serverName type: ${typeof serverName}, disabled type: ${typeof disabled}`,
						)
						return callback({
							code: grpc.status.INVALID_ARGUMENT,
							details: "Invalid request parameters for toggleMcpServer",
						})
					}

					// Ensure context7 server exists in settings if it's being toggled
					if (serverName === "context7") {
						const mcpSettingsPath = await this.controller.mcpHub.getMcpSettingsFilePath()
						let settingsContent = ""
						let mcpSettings: any = { mcpServers: {} }
						try {
							settingsContent = await fs.readFile(mcpSettingsPath, "utf-8")
							mcpSettings = JSON.parse(settingsContent)
							if (!mcpSettings.mcpServers) {
								mcpSettings.mcpServers = {}
							}
						} catch (readError: any) {
							// File might not exist or be invalid, McpHub creates it if non-existent.
							// If it's a parse error, McpHub's readAndValidateMcpSettingsFile will handle it.
							// For our purpose, if we can't read/parse, we assume it's okay to let McpHub create/validate.
							Logger.warn(
								`[GrpcBridge:toggleMcpServer] Could not read/parse MCP settings file at ${mcpSettingsPath}: ${readError.message}. McpHub will attempt to handle/create it.`,
							)
						}

						if (!mcpSettings.mcpServers.context7) {
							Logger.warn(
								`[GrpcBridge:toggleMcpServer] "context7" not found in ${mcpSettingsPath}. Adding default configuration.`,
							)
							mcpSettings.mcpServers.context7 = {
								command: "npx",
								args: ["-y", "@upstash/context7-mcp@latest"],
								autoApprove: ["resolve-library-id", "get-library-docs"],
								disabled: false, // Initial state, will be toggled by the RPC call
								timeout: DEFAULT_MCP_TIMEOUT_SECONDS,
							}
							try {
								await fs.writeFile(mcpSettingsPath, JSON.stringify(mcpSettings, null, 2))
								Logger.info(
									`[GrpcBridge:toggleMcpServer] Added default "context7" config to ${mcpSettingsPath} and saved.`,
								)
								// Force McpHub to reload its connections from the updated file
								// The mcpSettings object here contains all servers from the file
								Logger.info(
									`[GrpcBridge:toggleMcpServer] Forcing McpHub to update connections after adding context7 to file.`,
								)
								await this.controller.mcpHub.updateServerConnections(mcpSettings.mcpServers)
							} catch (writeError: any) {
								Logger.error(
									`[GrpcBridge:toggleMcpServer] Failed to write updated MCP settings with default context7: ${writeError.message}`,
								)
								// Proceeding, McpHub might still error if it can't read the file or context7 is still missing.
							}
						} else if (mcpSettings.mcpServers.context7) {
							// If context7 exists, but we want to ensure McpHub is sync with any other potential changes
							// This might be redundant if the file watcher is reliable, but can help ensure consistency
							// before the toggle RPC which relies on McpHub's internal state.
							// However, only do this if a write didn't just happen to avoid double-processing.
							// For now, let's assume the watcher handles general sync and focus on the "just added" case.
						}
					}

					const updatedServers = await this.controller.mcpHub.toggleServerDisabledRPC(serverName, disabled)
					const protoMcpServers = mapMcpServersToProto(updatedServers)
					callback(null, protoMcpServers)
				} catch (error: any) {
					Logger.error(`[GrpcBridge:toggleMcpServer] Error: ${error.message} ${error.stack}`)
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			GetMcpServers: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:GetMcpServers] Not implemented.") // Use static Logger
				callback({ code: grpc.status.UNIMPLEMENTED, details: "GetMcpServers not implemented" })
			},
			UseMcpTool: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:UseMcpTool] Not implemented.") // Use static Logger
				callback({ code: grpc.status.UNIMPLEMENTED, details: "UseMcpTool not implemented" })
			},
			AccessMcpResource: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:AccessMcpResource] Not implemented.") // Use static Logger
				callback({ code: grpc.status.UNIMPLEMENTED, details: "AccessMcpResource not implemented" })
			},
			// TODO: Implement other MCP service methods like updateMcpTimeout, addRemoteMcpServer
		}
	}

	async initTask(clientId: string, text?: string, images?: string[]): Promise<Task | undefined> {
		Logger.info(`[GrpcBridge:initTask] Callback invoked for client ${clientId}`) // Use static Logger
		if (!this.controller) {
			Logger.error("[GrpcBridge:initTask] Controller not available.") // Use static Logger
			return undefined
		}
		try {
			const taskInstance = await this.controller.initTask(text, images)
			if (taskInstance && taskInstance.taskId) {
				this.clientTaskMap.set(clientId, taskInstance)
				Logger.info(`[GrpcBridge:initTask] Task ${taskInstance.taskId} created and mapped to client ${clientId}`) // Use static Logger
				taskInstance.onDispose(() => {
					if (this.clientTaskMap.delete(clientId)) {
						Logger.info(
							// Use static Logger
							`[GrpcBridge:initTask] Removed task mapping for client ${clientId} (task ${taskInstance.taskId}) upon disposal.`,
						)
					} else {
						Logger.warn(
							// Use static Logger
							`[GrpcBridge:initTask] Attempted to remove task mapping for client ${clientId} on disposal, but it was not found in the map.`,
						)
					}
				})
				Logger.info(`[GrpcBridge:initTask] Task instance ${taskInstance.taskId} prepared for client ${clientId}.`) // Use static Logger
				return taskInstance
			} else {
				Logger.error(
					// Use static Logger
					`[GrpcBridge:initTask] Failed to get task instance or task ID after calling controller.initTask for client ${clientId}`,
				)
				return undefined
			}
		} catch (error: any) {
			Logger.error(
				`[GrpcBridge:initTask] Error during initTask execution for client ${clientId}: ${error?.message} \nStack: ${error?.stack}`,
				error,
			) // Use static Logger
			return undefined
		}
	}

	async handleUpdateSettings(clientId: string, settings: taskControlPb.UpdateSettingsRequest): Promise<void> {
		Logger.info(`[GrpcBridge] handleUpdateSettings received for client ${clientId}`) // Use static Logger
		if (!this.controller) {
			Logger.error("[GrpcBridge] Controller not available for handleUpdateSettings.") // Use static Logger
			throw new Error("Controller not available")
		}
		try {
			const updates: Partial<ApiConfiguration> = {}
			const protoApiConfig = settings.apiConfiguration

			if (protoApiConfig) {
				// Map ApiProvider enum from proto to internal string type
				let internalApiProvider: ApiProvider | undefined
				switch (protoApiConfig.apiProvider) {
					case taskControlPb.ApiProvider.ANTHROPIC:
						internalApiProvider = "anthropic"
						break
					case taskControlPb.ApiProvider.OPENROUTER:
						internalApiProvider = "openrouter"
						break
					case taskControlPb.ApiProvider.BEDROCK:
						internalApiProvider = "bedrock"
						break
					case taskControlPb.ApiProvider.VERTEX:
						internalApiProvider = "vertex"
						break
					case taskControlPb.ApiProvider.OPENAI:
						internalApiProvider = "openai"
						break
					case taskControlPb.ApiProvider.OLLAMA:
						internalApiProvider = "ollama"
						break
					case taskControlPb.ApiProvider.LMSTUDIO:
						internalApiProvider = "lmstudio"
						break
					case taskControlPb.ApiProvider.GEMINI:
						internalApiProvider = "gemini"
						break
					case taskControlPb.ApiProvider.OPENAI_NATIVE:
						internalApiProvider = "openai-native"
						break
					case taskControlPb.ApiProvider.REQUESTY:
						internalApiProvider = "requesty"
						break
					case taskControlPb.ApiProvider.TOGETHER:
						internalApiProvider = "together"
						break
					case taskControlPb.ApiProvider.DEEPSEEK:
						internalApiProvider = "deepseek"
						break
					case taskControlPb.ApiProvider.QWEN:
						internalApiProvider = "qwen"
						break
					case taskControlPb.ApiProvider.DOUBAO:
						internalApiProvider = "doubao"
						break
					case taskControlPb.ApiProvider.MISTRAL:
						internalApiProvider = "mistral"
						break
					case taskControlPb.ApiProvider.VSCODE_LM:
						internalApiProvider = "vscode-lm"
						break
					case taskControlPb.ApiProvider.CLINE:
						internalApiProvider = "cline"
						break
					case taskControlPb.ApiProvider.LITELLM:
						internalApiProvider = "litellm"
						break
					case taskControlPb.ApiProvider.ASKSAGE:
						internalApiProvider = "asksage"
						break
					case taskControlPb.ApiProvider.XAI:
						internalApiProvider = "xai"
						break
					case taskControlPb.ApiProvider.SAMBANOVA:
						internalApiProvider = "sambanova"
						break
					// Add other mappings as needed
				}

				if (internalApiProvider) {
					updates.apiProvider = internalApiProvider
					Logger.info(`[GrpcBridge:handleUpdateSettings] Mapped provider: ${internalApiProvider}`)

					// Map relevant fields based on the provider
					switch (internalApiProvider) {
						case "anthropic":
							updates.apiKey = protoApiConfig.apiKey // Map from proto's apiKey
							updates.apiModelId = protoApiConfig.apiModelId
							break
						case "openai":
							updates.openAiApiKey = protoApiConfig.apiKey // Map from proto's apiKey
							updates.openAiModelId = protoApiConfig.apiModelId
							updates.openAiBaseUrl = protoApiConfig.openAiBaseUrl
							break
						case "openrouter":
							updates.openRouterApiKey = protoApiConfig.apiKey // Map from proto's apiKey
							updates.openRouterModelId = protoApiConfig.apiModelId
							break
						// Add cases for other providers as needed, mapping proto fields to internal fields
						default:
							Logger.warn(
								`[GrpcBridge:handleUpdateSettings] Provider ${internalApiProvider} specific field mapping not fully implemented.`,
							)
							// Generic mapping attempt (might not be correct for all fields)
							updates.apiModelId = protoApiConfig.apiModelId
							// Assuming proto's 'apiKey' maps to the primary key for other providers if not handled specifically
							if (protoApiConfig.apiKey) {
								// This is a guess, might need refinement per provider
								updates.apiKey = protoApiConfig.apiKey
							}
							break
					}
					updates.favoritedModelIds = protoApiConfig.favoritedModelIds || []
					// Map other common fields if they exist in the proto definition
					// updates.openAiHeaders = protoApiConfig.openAiHeaders ? JSON.parse(protoApiConfig.openAiHeaders) : undefined; // Example if headers were a JSON string
				} else {
					Logger.warn(
						`[GrpcBridge:handleUpdateSettings] Unknown or unmapped ApiProvider enum value: ${protoApiConfig.apiProvider}`,
					)
				}

				// Persist the mapped updates
				if (Object.keys(updates).length > 0) {
					Logger.info(
						`[GrpcBridge:handleUpdateSettings] Persisting API configuration updates: ${JSON.stringify(updates)}`,
					)
					await updateApiConfiguration(this.context, updates)

					// Update the current task's API handler if a task exists
					const task = this.clientTaskMap.get(clientId)
					if (task) {
						const fullUpdatedConfig = { ...(await getAllExtensionState(this.context)).apiConfiguration, ...updates }
						task.api = buildApiHandler(fullUpdatedConfig)
						Logger.info(`[GrpcBridge:handleUpdateSettings] Updated active task's (${task.taskId}) API handler.`)
					}
				} else {
					Logger.warn("[GrpcBridge:handleUpdateSettings] No API configuration updates to persist.")
				}
			} else {
				Logger.warn("[GrpcBridge:handleUpdateSettings] Received request without apiConfiguration field.")
			}

			// Handle chat settings update (if needed, currently warns)
			if (settings.chatSettings) {
				Logger.warn("[GrpcBridge] Chat Settings update via gRPC UpdateSettings not fully implemented.")
				// TODO: Map chatSettings proto to internal ChatSettings and persist if needed
				// const internalChatSettings = mapProtoChatSettingsToInternal(settings.chatSettings);
				// await updateGlobalState(this.context, "chatSettings", internalChatSettings);
			}

			// Refresh state in webview after updates
			await this.controller.postStateToWebview()
			Logger.info(`[GrpcBridge] Finished processing settings update from client ${clientId}`)
		} catch (error: any) {
			Logger.error(
				`[GrpcBridge] Error applying settings update for client ${clientId}: ${error.message} ${error.stack}`,
				error,
			)
			throw new Error(`Failed to apply settings update: ${error.message}`)
		}
	}

	async handleAskResponse(clientId: string, response: WebviewMessage): Promise<void> {
		Logger.info(`[GrpcBridge] handleAskResponse received for client ${clientId}`) // Use static Logger
		const task = this.clientTaskMap.get(clientId)
		if (task && response.type === "askResponse") {
			Logger.info(`[GrpcBridge] Forwarding ask response to task ${task.taskId}`) // Use static Logger
			task.handleWebviewAskResponse(response.askResponse!, response.text, response.images)
		} else {
			if (!task) Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleAskResponse`) // Use static Logger
			if (response.type !== "askResponse")
				Logger.warn(`[GrpcBridge] Received non-askResponse message in handleAskResponse: ${response.type}`) // Use static Logger
		}
	}

	async handleToolResult(clientId: string, result: Partial<ProtoToolResultBlock>): Promise<void> {
		Logger.warn(
			// Use static Logger
			`[GrpcBridge] handleToolResult received for client ${clientId}, but external tool execution is not expected. Ignoring.`,
		)
		const task = this.clientTaskMap.get(clientId)
		if (!task) {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleToolResult`) // Use static Logger
		}
	}

	async handleUserInput(clientId: string, text?: string, images?: string[]): Promise<void> {
		Logger.info(`[GrpcBridge] handleUserInput received for client ${clientId} with text: "${text?.substring(0, 30)}..."`) // Use static Logger
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			Logger.info(`[GrpcBridge] Forwarding user input as 'messageResponse' to task ${task.taskId}`) // Use static Logger
			// The Task's main loop should be able to pick up this input when it's ready
			// by calling handleWebviewAskResponse, which sets the necessary properties for the loop.
			task.handleWebviewAskResponse("messageResponse", text, images)
		} else {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleUserInput`) // Use static Logger
			throw new Error("Task associated with client ID not found.")
		}
	}

	async handleGenericMessage(clientId: string, message: WebviewMessage): Promise<void> {
		Logger.info(`[GrpcBridge] handleGenericMessage received for client ${clientId}`) // Use static Logger
		if (this.controller) {
			const task = this.clientTaskMap.get(clientId)
			if (task && this.controller.task?.taskId !== task.taskId) {
				Logger.warn(
					// Use static Logger
					`[GrpcBridge] handleGenericMessage received for client ${clientId}, but controller's active task (${this.controller.task?.taskId}) doesn't match mapped task (${task.taskId}). Proceeding with controller's active task context.`,
				)
			}
			Logger.info(`[GrpcBridge] Forwarding generic message type ${message.type} to controller.`) // Use static Logger
			this.controller.handleWebviewMessage(message)
		} else {
			Logger.warn(`[GrpcBridge] Controller not available in handleGenericMessage`) // Use static Logger
		}
	}

	async handleClearTask(clientId: string): Promise<void> {
		Logger.info(`[GrpcBridge] handleClearTask received for client ${clientId}. Treating as abort request.`) // Use static Logger
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			Logger.info(`[GrpcBridge] Aborting task ${task.taskId} due to clearTask request from client ${clientId}.`) // Use static Logger
			try {
				await task.abortTask()
			} catch (error) {
				Logger.error(
					// Use static Logger
					`[GrpcBridge] Error aborting task ${task.taskId} during handleClearTask for client ${clientId}:`,
					error,
				)
			}
		} else {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleClearTask`) // Use static Logger
		}
	}

	async handleCancelTask(clientId: string): Promise<void> {
		Logger.info(`[GrpcBridge] handleCancelTask received for client ${clientId}`) // Use static Logger
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			Logger.info(`[GrpcBridge] Aborting task ${task.taskId} due to cancelTask request from client ${clientId}.`) // Use static Logger
			try {
				await task.abortTask()
			} catch (error) {
				Logger.error(
					// Use static Logger
					`[GrpcBridge] Error aborting task ${task.taskId} during handleCancelTask for client ${clientId}:`,
					error,
				)
			}
		} else {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleCancelTask`) // Use static Logger
		}
	}

	async handleDeleteTaskWithId(clientId: string, taskId: string): Promise<void> {
		Logger.info(`[GrpcBridge] handleDeleteTaskWithId received for client ${clientId}, taskId ${taskId}`) // Use static Logger
		if (this.controller) {
			Logger.info(`[GrpcBridge] Deleting task ${taskId}`) // Use static Logger
			await this.controller.deleteTaskWithId(taskId)
			for (const [cId, task] of this.clientTaskMap.entries()) {
				if (task.taskId === taskId) {
					this.clientTaskMap.delete(cId)
					Logger.info(`[GrpcBridge] Removed task mapping for deleted task ${taskId}`) // Use static Logger
					break
				}
			}
		} else {
			Logger.warn(`[GrpcBridge] Controller not available in handleDeleteTaskWithId`) // Use static Logger
		}
	}

	async handleApplyBrowserSettings(clientId: string, settings: any): Promise<void> {
		Logger.info(`[GrpcBridge] handleApplyBrowserSettings received for client ${clientId}`) // Use static Logger
		try {
			await updateGlobalState(this.context, "browserSettings", settings as BrowserSettings)
			await this.controller?.postStateToWebview()
			Logger.info(`[GrpcBridge] Applied browser settings for client ${clientId}`) // Use static Logger
		} catch (error) {
			Logger.error(`[GrpcBridge] Error applying browser settings for client ${clientId}:`, error) // Use static Logger
			throw new Error(`Failed to apply browser settings: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	async handleOpenFile(clientId: string, filePath: string): Promise<void> {
		Logger.info(`[GrpcBridge] handleOpenFile received for client ${clientId}, path ${filePath}`) // Use static Logger
		if (this.controller) {
			try {
				await handleFileServiceRequest(this.controller, "openFile", { value: filePath })
				Logger.info(`[GrpcBridge] Opened file ${filePath} for client ${clientId}`) // Use static Logger
			} catch (error) {
				Logger.error(`[GrpcBridge] Error opening file ${filePath} for client ${clientId}:`, error) // Use static Logger
				throw new Error(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`)
			}
		} else {
			Logger.warn(`[GrpcBridge] Controller not available in handleOpenFile`) // Use static Logger
			throw new Error("Controller not available to handle openFile request.")
		}
	}

	async handleClientDisconnect(clientId: string): Promise<void> {
		Logger.info(`[GrpcBridge] handleClientDisconnect received for client ${clientId}`) // Use static Logger
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			Logger.info(`[GrpcBridge] Aborting task ${task.taskId} due to client ${clientId} disconnection.`) // Use static Logger
			try {
				await task.abortTask()
			} catch (error) {
				Logger.error(`[GrpcBridge] Error aborting task ${task.taskId} for disconnected client ${clientId}:`, error) // Use static Logger
			}
		} else {
			Logger.warn(`[GrpcBridge] Client ${clientId} disconnected, but no associated task found in the map.`) // Use static Logger
		}
	}

	private getWrappedPostMessage(originalPostMessage: PostMessageFunc): PostMessageFunc {
		return (message: ExtensionMessage, taskId?: string): Promise<void> => {
			Logger.debug(
				`[WRAPPER_TRACE] Entry. TaskId: ${taskId}, MessageType: ${message?.type}, ClientTaskMap size: ${this.clientTaskMap.size}`,
			)
			const clientId = this.findClientIdByTaskId(taskId)
			Logger.debug(`[WRAPPER_TRACE] Found clientId: ${clientId} for taskId: ${taskId}`)

			if (clientId && this.grpcNotifier) {
				Logger.info(
					`[WRAPPER_TRACE] GRPC_ROUTE: Intercepted message type ${message?.type || "unknown"} for gRPC client ${clientId}, task ${taskId}. Notifier exists: ${!!this.grpcNotifier}`,
				)
				try {
					const extMsg = message
					Logger.debug(
						`[WRAPPER_TRACE] GRPC_ROUTE: Processing message for client ${clientId}, taskId ${taskId}: type='${extMsg.type}', content='${JSON.stringify(extMsg).substring(0, 100)}...'`,
					)

					if (extMsg.error) {
						Logger.warn(`[WRAPPER_TRACE] GRPC_ROUTE: Intercepted ERROR for client ${clientId}: ${extMsg.error}`)
						this.grpcNotifier.emit("error", clientId, extMsg.error)
						// Also send as a generic ExtensionMessage of type ERROR if not already handled by specific listeners
						const errorProtoMsg = mapClineMessageToProto({
							type: "say",
							say: "error",
							text: extMsg.error,
						} as ClineMessage) // Map to a say message for now
						if (errorProtoMsg) {
							// This might be redundant if the 'error' event on notifier handles it,
							// but ensures an ExtensionMessage is sent.
							// Consider if a specific ERROR type ExtensionMessage is better.
							// For now, we assume the 'error' event on notifier is primary.
						}
					}

					// Always attempt to map and send, even if it's an error,
					// as some listeners might expect an ExtensionMessage.
					// The primary path for AI text responses is through 'partialMessage'.
					let successfullySentToGrpc = false
					switch (extMsg.type) {
						case "state":
							if (extMsg.state) {
								const protoState = mapExtensionStateToProto(extMsg.state)
								if (protoState) {
									Logger.info(`[WRAPPER_TRACE] GRPC_ROUTE: Emitting stateUpdate for client ${clientId}.`)
									this.grpcNotifier.emit("stateUpdate", clientId, protoState)
									successfullySentToGrpc = true // Assuming emit means it's handled by gRPC path
								} else {
									Logger.warn(
										`[WRAPPER_TRACE] GRPC_ROUTE: Failed to map 'state' to proto for client ${clientId}.`,
									)
								}
							}
							break
						case "partialMessage": // This is the key path for AI text responses
							if (extMsg.partialMessage) {
								const protoClineMsg = mapClineMessageToProto(extMsg.partialMessage)
								if (protoClineMsg) {
									// Determine if it's an 'ask' or 'say' based on internal ClineMessage structure
									if (extMsg.partialMessage.type === "say") {
										Logger.info(
											`[WRAPPER_TRACE] GRPC_ROUTE: Emitting sayUpdate for client ${clientId} (type: ${extMsg.partialMessage.say}, partial: ${extMsg.partialMessage.partial}, text len: ${extMsg.partialMessage.text?.length}).`,
										)
										this.grpcNotifier.emit(
											"sayUpdate", // This should trigger call.write in StartTask
											clientId,
											protoClineMsg,
											extMsg.partialMessage.partial ?? false,
										)
										successfullySentToGrpc = true
									} else if (extMsg.partialMessage.type === "ask" && extMsg.partialMessage.ask) {
										Logger.info(
											`[WRAPPER_TRACE] GRPC_ROUTE: Emitting askRequest for client ${clientId} (type: ${extMsg.partialMessage.ask}).`,
										)
										this.grpcNotifier.emit("askRequest", clientId, protoClineMsg)
										successfullySentToGrpc = true
									} else {
										Logger.warn(
											`[WRAPPER_TRACE] GRPC_ROUTE: 'partialMessage' for client ${clientId} is neither 'say' nor 'ask'. Type: ${extMsg.partialMessage.type}`,
										)
									}
								} else {
									Logger.warn(
										`[WRAPPER_TRACE] GRPC_ROUTE: Failed to map 'partialMessage' to proto for client ${clientId}.`,
									)
								}
							}
							break
						// Add other cases like tool_use, tool_result if they are expected to be routed
						// For now, focusing on text (partialMessage) and state.
						default:
							if (!extMsg.error) {
								// Avoid double logging if it was an error message already handled
								Logger.debug(
									`[WRAPPER_TRACE] GRPC_ROUTE: No specific gRPC mapping for intercepted message type: ${extMsg.type}. Not sending to gRPC client ${clientId} via this path.`,
								)
							}
					}

					// If the message was specifically handled and sent via gRPC notifier, we might not want to send it to webview.
					// However, the original logic was to return Promise.resolve() which effectively stops it from going to originalPostMessage.
					// Let's maintain that: if successfullySentToGrpc is true, we assume it's handled.
					if (successfullySentToGrpc) {
						Logger.debug(
							`[WRAPPER_TRACE] GRPC_ROUTE: Message type ${extMsg.type} handled by gRPC path for client ${clientId}. Returning.`,
						)
						return Promise.resolve()
					} else {
						Logger.debug(
							`[WRAPPER_TRACE] GRPC_ROUTE: Message type ${extMsg.type} not explicitly sent to gRPC for client ${clientId}. May fall through to webview.`,
						)
						// If not sent to gRPC, it will fall through to originalPostMessage below.
					}
				} catch (error) {
					Logger.error(
						`[WRAPPER_TRACE] GRPC_ROUTE_ERROR: Error mapping or sending intercepted message via gRPC for client ${clientId}:`,
						error,
					)
					// Fall through to originalPostMessage to ensure webview still gets it if gRPC path fails.
				}
			} else {
				if (taskId) {
					// Only log if taskId was present but conditions for gRPC routing weren't met
					Logger.debug(
						`[WRAPPER_TRACE] WEBVIEW_ROUTE: Not routing to gRPC for taskId ${taskId}. ClientId: ${clientId}, Notifier exists: ${!!this.grpcNotifier}. Passing to original webview handler.`,
					)
				} else {
					Logger.debug(`[WRAPPER_TRACE] WEBVIEW_ROUTE: No taskId. Passing to original webview handler.`)
				}
			}

			// If not routed to gRPC (no clientId, no notifier, or error in gRPC path, or not a gRPC-handled type)
			// call the original function.
			Logger.debug(
				`[WRAPPER_TRACE] Calling original postMessageToWebview for message type ${message?.type}, taskId ${taskId}`,
			)
			return originalPostMessage(message, taskId)
		}
	}

	private findClientIdByTaskId(taskId: string | undefined): string | undefined {
		if (!taskId) return undefined
		for (const [clientId, task] of this.clientTaskMap.entries()) {
			if (task.taskId === taskId) {
				return clientId
			}
		}
		return undefined
	}

	dispose(): void {
		Logger.info("[GrpcBridge] Disposing...") // Use static Logger
		if (this.controller && this.originalPostMessage && this.controller.postMessageToWebview !== this.originalPostMessage) {
			Logger.info("[GrpcBridge] Restoring original Controller.postMessageToWebview.") // Use static Logger
			this.controller.postMessageToWebview = this.originalPostMessage
		}
		this.originalPostMessage = undefined
		if (this.grpcNotifier) {
			try {
				stopExternalGrpcServer()
				Logger.info("[GrpcBridge] gRPC server stopped.") // Use static Logger
			} catch (error) {
				Logger.error("[GrpcBridge] Error stopping gRPC server:", error) // Use static Logger
			}
			this.grpcNotifier = null
		}
		this.clientTaskMap.clear()
		vscode.Disposable.from(...this.disposables).dispose()
		this.disposables = []
		Logger.info("[GrpcBridge] Disposed.") // Use static Logger
	}
}

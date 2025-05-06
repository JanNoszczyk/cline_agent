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
			StartTask: (call: grpc.ServerWritableStream<taskControlPb.NewTaskRequest, taskControlPb.ExtensionMessage>) => {
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
						}
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
			UpdateSettings: async (
				call: grpc.ServerWritableStream<taskControlPb.UpdateSettingsRequest, taskControlPb.ExtensionMessage>,
			) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				Logger.info(
					`[GrpcBridge:UpdateSettings] Handler entered. Client ID: ${clientId}, Request: ${JSON.stringify(call.request)}`,
				)
				try {
					const confirmationMessage: taskControlPb.ExtensionMessage = {
						type: taskControlPb.ExtensionMessageType.DID_UPDATE_SETTINGS,
						// No payload needed for DID_UPDATE_SETTINGS as per proto
					}
					Logger.info("[GrpcBridge:UpdateSettings] Writing DID_UPDATE_SETTINGS confirmation...")
					if (!call.writableEnded) {
						call.write(confirmationMessage)
					}
					Logger.info("[GrpcBridge:UpdateSettings] DID_UPDATE_SETTINGS confirmation written. Ending stream.")
					if (!call.writableEnded) {
						call.end()
					}
				} catch (e: any) {
					Logger.error(`[GrpcBridge:UpdateSettings] Error in UpdateSettings handler: ${e.message} ${e.stack}`)
					if (!call.writableEnded) {
						call.emit("error", { code: grpc.status.INTERNAL, details: `UpdateSettings handler error: ${e.message}` })
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
			ExecuteBrowserAction: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:ExecuteBrowserAction] Not implemented.")
				callback({ code: grpc.status.UNIMPLEMENTED, details: "ExecuteBrowserAction not implemented" })
			},
		}
	}
	private createCheckpointsImplementation(): grpc.UntypedServiceImplementation {
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
		}
	}
	private createMcpImplementation(): grpc.UntypedServiceImplementation {
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
		}
	}

	async initTask(clientId: string, text?: string, images?: string[]): Promise<Task | undefined> {
		Logger.info(`[GrpcBridge:initTask] Callback invoked for client ${clientId}`)
		if (!this.controller) {
			Logger.error("[GrpcBridge:initTask] Controller not available.")
			return undefined
		}
		try {
			const taskInstance = await this.controller.initTask(text, images)
			if (taskInstance && taskInstance.taskId) {
				this.clientTaskMap.set(clientId, taskInstance)
				Logger.info(`[GrpcBridge:initTask] Task ${taskInstance.taskId} created and mapped to client ${clientId}`)
				taskInstance.onDispose(() => {
					if (this.clientTaskMap.delete(clientId)) {
						Logger.info(
							`[GrpcBridge:initTask] Removed task mapping for client ${clientId} (task ${taskInstance.taskId}) upon disposal.`,
						)
					} else {
						Logger.warn(
							`[GrpcBridge:initTask] Attempted to remove task mapping for client ${clientId} on disposal, but it was not found in the map.`,
						)
					}
				})
				Logger.info(`[GrpcBridge:initTask] Task instance ${taskInstance.taskId} prepared for client ${clientId}.`)
				return taskInstance
			} else {
				Logger.error(
					`[GrpcBridge:initTask] Failed to get task instance or task ID after calling controller.initTask for client ${clientId}`,
				)
				return undefined
			}
		} catch (error) {
			Logger.error(`[GrpcBridge:initTask] Error during initTask execution for client ${clientId}:`, error)
			return undefined
		}
	}

	async handleUpdateSettings(clientId: string, settings: taskControlPb.UpdateSettingsRequest): Promise<void> {
		Logger.info(`[GrpcBridge] handleUpdateSettings received for client ${clientId}`)
		if (!this.controller) {
			Logger.error("[GrpcBridge] Controller not available for handleUpdateSettings.")
			throw new Error("Controller not available")
		}
		try {
			if (settings.apiConfiguration) {
				Logger.warn("[GrpcBridge] API Config update via gRPC UpdateSettings not fully implemented.")
			}
			if (settings.chatSettings) {
				Logger.warn("[GrpcBridge] Chat Settings update via gRPC UpdateSettings not fully implemented.")
			}
			await this.controller.postStateToWebview()
			Logger.info(`[GrpcBridge] Applied settings update from client ${clientId}`)
		} catch (error) {
			Logger.error(`[GrpcBridge] Error applying settings update for client ${clientId}:`, error)
			throw new Error(`Failed to apply settings update: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	async handleAskResponse(clientId: string, response: WebviewMessage): Promise<void> {
		console.log(`[GrpcBridge] handleAskResponse received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task && response.type === "askResponse") {
			console.log(`[GrpcBridge] Forwarding ask response to task ${task.taskId}`)
			task.handleWebviewAskResponse(response.askResponse!, response.text, response.images)
		} else {
			if (!task) console.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleAskResponse`)
			if (response.type !== "askResponse")
				console.warn(`[GrpcBridge] Received non-askResponse message in handleAskResponse: ${response.type}`)
		}
	}

	async handleToolResult(clientId: string, result: Partial<ProtoToolResultBlock>): Promise<void> {
		Logger.warn(
			`[GrpcBridge] handleToolResult received for client ${clientId}, but external tool execution is not expected. Ignoring.`,
		)
		const task = this.clientTaskMap.get(clientId)
		if (!task) {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleToolResult`)
		}
	}

	async handleUserInput(clientId: string, text?: string, images?: string[]): Promise<void> {
		Logger.info(`[GrpcBridge] handleUserInput received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			// @ts-expect-error Accessing private property for state check
			if (task.askResponse === undefined) {
				Logger.warn(
					`[GrpcBridge] Received user input for task ${task.taskId} via handleUserInput, but the task is not currently waiting for an 'ask' response. Input ignored.`,
				)
				throw new Error("Task is not currently expecting input.")
			} else {
				Logger.info(`[GrpcBridge] Forwarding user input as 'messageResponse' to task ${task.taskId}`)
				task.handleWebviewAskResponse("messageResponse", text, images)
			}
		} else {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleUserInput`)
			throw new Error("Task associated with client ID not found.")
		}
	}

	async handleGenericMessage(clientId: string, message: WebviewMessage): Promise<void> {
		console.log(`[GrpcBridge] handleGenericMessage received for client ${clientId}`)
		if (this.controller) {
			const task = this.clientTaskMap.get(clientId)
			if (task && this.controller.task?.taskId !== task.taskId) {
				console.warn(
					`[GrpcBridge] handleGenericMessage received for client ${clientId}, but controller's active task (${this.controller.task?.taskId}) doesn't match mapped task (${task.taskId}). Proceeding with controller's active task context.`,
				)
			}
			console.log(`[GrpcBridge] Forwarding generic message type ${message.type} to controller.`)
			this.controller.handleWebviewMessage(message)
		} else {
			console.warn(`[GrpcBridge] Controller not available in handleGenericMessage`)
		}
	}

	async handleClearTask(clientId: string): Promise<void> {
		console.log(`[GrpcBridge] handleClearTask received for client ${clientId}. Treating as abort request.`)
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			console.log(`[GrpcBridge] Aborting task ${task.taskId} due to clearTask request from client ${clientId}.`)
			try {
				await task.abortTask()
			} catch (error) {
				console.error(
					`[GrpcBridge] Error aborting task ${task.taskId} during handleClearTask for client ${clientId}:`,
					error,
				)
			}
		} else {
			console.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleClearTask`)
		}
	}

	async handleCancelTask(clientId: string): Promise<void> {
		console.log(`[GrpcBridge] handleCancelTask received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			console.log(`[GrpcBridge] Aborting task ${task.taskId} due to cancelTask request from client ${clientId}.`)
			try {
				await task.abortTask()
			} catch (error) {
				console.error(
					`[GrpcBridge] Error aborting task ${task.taskId} during handleCancelTask for client ${clientId}:`,
					error,
				)
			}
		} else {
			console.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleCancelTask`)
		}
	}

	async handleDeleteTaskWithId(clientId: string, taskId: string): Promise<void> {
		console.log(`[GrpcBridge] handleDeleteTaskWithId received for client ${clientId}, taskId ${taskId}`)
		if (this.controller) {
			console.log(`[GrpcBridge] Deleting task ${taskId}`)
			await this.controller.deleteTaskWithId(taskId)
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
		try {
			await updateGlobalState(this.context, "browserSettings", settings as BrowserSettings)
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

	async handleClientDisconnect(clientId: string): Promise<void> {
		console.log(`[GrpcBridge] handleClientDisconnect received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			console.log(`[GrpcBridge] Aborting task ${task.taskId} due to client ${clientId} disconnection.`)
			try {
				await task.abortTask()
			} catch (error) {
				console.error(`[GrpcBridge] Error aborting task ${task.taskId} for disconnected client ${clientId}:`, error)
			}
		} else {
			console.warn(`[GrpcBridge] Client ${clientId} disconnected, but no associated task found in the map.`)
		}
	}

	private getWrappedPostMessage(originalPostMessage: PostMessageFunc): PostMessageFunc {
		return (message: ExtensionMessage, taskId?: string): Promise<void> => {
			const clientId = this.findClientIdByTaskId(taskId)
			if (clientId && this.grpcNotifier) {
				console.log(
					`[GrpcBridge] Intercepted message type ${message?.type || "unknown"} for gRPC client ${clientId}, task ${taskId}`,
				)
				try {
					const extMsg = message
					if (extMsg.error) {
						console.warn(`[GrpcBridge] Intercepted error for client ${clientId}: ${extMsg.error}`)
						this.grpcNotifier.emit("error", clientId, extMsg.error)
					}
					switch (extMsg.type) {
						case "state":
							if (extMsg.state) {
								const protoState = mapExtensionStateToProto(extMsg.state)
								if (protoState) {
									this.grpcNotifier.emit("stateUpdate", clientId, protoState)
									console.log(`[GrpcBridge] State update event emitted for client ${clientId}.`)
								}
							}
							break
						case "partialMessage":
							if (extMsg.partialMessage) {
								const protoClineMsg = mapClineMessageToProto(extMsg.partialMessage)
								if (protoClineMsg) {
									if (extMsg.partialMessage.type === "say") {
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
										this.grpcNotifier.emit("askRequest", clientId, protoClineMsg)
										console.log(
											`[GrpcBridge] 'Ask' request event emitted for client ${clientId} (type: ${extMsg.partialMessage.ask}).`,
										)
									}
								}
							}
							break
						default:
							if (!extMsg.error) {
								console.log(
									`[GrpcBridge] No specific gRPC mapping defined for intercepted message type: ${extMsg.type}`,
								)
							}
					}
					return Promise.resolve()
				} catch (error) {
					console.error(`[GrpcBridge] Error mapping or sending intercepted message via gRPC:`, error)
					return Promise.resolve()
				}
			} else {
				return originalPostMessage(message, taskId)
			}
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
		console.log("[GrpcBridge] Disposing...")
		if (this.controller && this.originalPostMessage && this.controller.postMessageToWebview !== this.originalPostMessage) {
			console.log("[GrpcBridge] Restoring original Controller.postMessageToWebview.")
			this.controller.postMessageToWebview = this.originalPostMessage
		}
		this.originalPostMessage = undefined
		if (this.grpcNotifier) {
			try {
				stopExternalGrpcServer()
				console.log("[GrpcBridge] gRPC server stopped.")
			} catch (error) {
				console.error("[GrpcBridge] Error stopping gRPC server:", error)
			}
			this.grpcNotifier = null
		}
		this.clientTaskMap.clear()
		vscode.Disposable.from(...this.disposables).dispose()
		this.disposables = []
		console.log("[GrpcBridge] Disposed.")
	}
}

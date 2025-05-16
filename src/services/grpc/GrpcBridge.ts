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
	mapBrowserSettingsToProto as mapInternalBrowserSettingsToProto, // Renamed for clarity
} from "./mapper" // Import state type and mapping functions
// Import Proto types directly
import * as taskControlPb from "../../shared/proto/task_control" // Namespace import
import * as browserPb from "../../shared/proto/browser" // Import browser proto messages
import * as commonPb from "../../shared/proto/common" // Import common proto messages
import { ExtensionMessage, ClineMessage, ClineSay, ClineAsk } from "../../shared/ExtensionMessage" // Import ExtensionMessage for type checking
import { ToolResponse } from "../../core/task" // Import internal tool types from index
import { ToolUse } from "@core/assistant-message" // Import ToolUse type
import { mapProtoToolResultToInternal, mapMcpServersToProto } from "./mapper" // Import the new mapper & MCP mapper
import { formatResponse } from "@core/prompts/responses" // Import formatResponse for image blocks
import Anthropic from "@anthropic-ai/sdk" // Import Anthropic for ContentBlockParam type
import { Logger } from "@services/logging/Logger" // Import Logger
import { BrowserSession } from "@services/browser/BrowserSession" // Import BrowserSession
import { Timestamp } from "google-protobuf/google/protobuf/timestamp_pb" // Import Timestamp
import { updateGlobalState, updateApiConfiguration, getAllExtensionState } from "../../core/storage/state" // Import for settings update & API config
import { ApiConfiguration, ApiProvider } from "../../shared/api" // Import internal ApiConfiguration type
import { buildApiHandler } from "@api/index" // Import buildApiHandler
import { BrowserSettings } from "../../shared/BrowserSettings" // Import settings type
import { ChatSettings } from "../../shared/ChatSettings" // Import ChatSettings type
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
	private readonly sentMessagesTracker = new Map<string, Set<string>>() // Tracks sent messages {taskId -> Set<message.ts>}
	private grpcPartialMessageBuffer = new Map<string, Map<string, ClineMessage>>() // taskId -> messageTs -> assembled ClineMessage
	private disposables: vscode.Disposable[] = []

	private originalPostMessage?: PostMessageFunc // Store original using the updated type

	constructor(context: vscode.ExtensionContext) {
		console.log("[DEBUG] GrpcBridge constructor called.")
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
		console.log("[DEBUG] GrpcBridge initialize called.") // Corresponds to old initialize()
		console.log("[DEBUG] Attempting to start gRPC server in GrpcBridge...")
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
			// Method names are camelCase, matching gRPC-JS conventions for service implementation objects.
			// Signatures match proto definitions (unary vs. server-streaming).

			startTask: (call: grpc.ServerWritableStream<taskControlPb.NewTaskRequest, taskControlPb.ExtensionMessage>) => {
				console.log("[RAW_CONSOLE_LOG GrpcBridge:startTask] Method invoked.") // RAW CONSOLE LOG
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				console.log(`[RAW_CONSOLE_LOG GrpcBridge:startTask] Client ID from metadata: ${clientId}`) // RAW CONSOLE LOG
				if (!clientId) {
					Logger.error("[GrpcBridge:startTask] Client ID missing in metadata")
					console.error("[RAW_CONSOLE_LOG GrpcBridge:startTask] Client ID missing in metadata") // RAW CONSOLE LOG
					call.emit("error", { code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
					if (!call.writableEnded) call.end()
					return
				}
				const initialRequest = call.request
				Logger.info(
					`[GrpcBridge:startTask] Received for client ${clientId}. Text: ${initialRequest.text?.substring(0, 50)}...`,
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
								`[GrpcBridge:startTask] Failed to initialize task for client ${clientId}. Sending ERROR.`,
							)
							if (!call.writableEnded) {
								call.write({
									type: taskControlPb.ExtensionMessageType.ERROR,
									errorMessage: "Failed to initialize task internally.",
								})
								call.end()
							}
							return
						}
						const currentTaskId = taskInstance.taskId
						const extensionVersion = this.context.extension.packageJSON.version || "unknown"
						Logger.info(
							`[GrpcBridge:startTask] Task ${currentTaskId} initialized for client ${clientId}. Sending TASK_STARTED.`,
						)
						if (!call.writableEnded) {
							call.write({
								type: taskControlPb.ExtensionMessageType.TASK_STARTED,
								taskStarted: { taskId: currentTaskId, version: extensionVersion },
							})
						}

						const stateListener = (cId: string, state: ProtoExtensionState) => {
							if (cId === clientId && taskInstance.taskId === currentTaskId && !call.writableEnded) {
								call.write({ type: taskControlPb.ExtensionMessageType.STATE, state: state })
							}
						}
						const sayListener = (cId: string, msg: taskControlPb.ClineMessage, partial: boolean) => {
							if (cId === clientId && taskInstance.taskId === currentTaskId && !call.writableEnded) {
								call.write({ type: taskControlPb.ExtensionMessageType.PARTIAL_MESSAGE, partialMessage: msg })
							}
						}
						const askListener = (cId: string, msg: taskControlPb.ClineMessage) => {
							if (cId === clientId && taskInstance.taskId === currentTaskId && !call.writableEnded) {
								call.write({ type: taskControlPb.ExtensionMessageType.PARTIAL_MESSAGE, partialMessage: msg })
							}
						}
						const errorListener = (cId: string, errorMsg: string) => {
							if (cId === clientId && !call.writableEnded) {
								call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: errorMsg })
							}
						}
						const newChatMessageListener = (cId: string, tId: string, msg: taskControlPb.ClineMessage) => {
							// Ensure this message is for the current client and task, and stream is writable
							if (cId === clientId && tId === currentTaskId && !call.writableEnded) {
								Logger.info(
									`[GrpcBridge:startTask:newChatMessageListener] Writing newChatMessage (ts: ${msg.ts}) to gRPC stream for client ${clientId}, task ${currentTaskId}.`,
								)
								call.write({
									type: taskControlPb.ExtensionMessageType.EXTENSION_MESSAGE_TYPE_UNSPECIFIED,
									newChatMessage: msg,
								})
							}
						}
						this.grpcNotifier?.on("stateUpdate", stateListener)
						this.grpcNotifier?.on("sayUpdate", sayListener)
						this.grpcNotifier?.on("askRequest", askListener)
						this.grpcNotifier?.on("error", errorListener)
						this.grpcNotifier?.on("newChatMessage", newChatMessageListener) // Add listener for new event
						const cleanupListeners = () => {
							this.grpcNotifier?.off("stateUpdate", stateListener)
							this.grpcNotifier?.off("sayUpdate", sayListener)
							this.grpcNotifier?.off("askRequest", askListener)
							this.grpcNotifier?.off("error", errorListener)
							this.grpcNotifier?.off("newChatMessage", newChatMessageListener) // Remove listener
						}
						taskInstance.onDispose(() => {
							Logger.info(
								`[GrpcBridge:startTask] Task ${currentTaskId} disposed. Ending stream for client ${clientId}.`,
							)
							cleanupListeners()
							if (!call.writableEnded) call.end()
						})
						call.on("cancelled", () => {
							Logger.info(
								`[GrpcBridge:startTask] Stream for task ${currentTaskId} cancelled by client ${clientId}.`,
							)
							cleanupListeners()
							if (!taskInstance.isDisposed) taskInstance.abortTask().catch(Logger.error)
							if (!call.writableEnded) call.end()
						})
						call.on("error", (err: grpc.ServiceError) => {
							Logger.error(
								`[GrpcBridge:startTask] Stream error for task ${currentTaskId} on client ${clientId}:`,
								err,
							)
							cleanupListeners()
							if (!taskInstance.isDisposed) taskInstance.abortTask().catch(Logger.error)
							if (!call.writableEnded) call.end()
						})
					} catch (error: any) {
						Logger.error(`[GrpcBridge:startTask] Outer error for client ${clientId}: ${error.message} ${error.stack}`)
						if (!call.writableEnded) {
							call.write({
								type: taskControlPb.ExtensionMessageType.ERROR,
								errorMessage: `Task setup failed: ${error.message}`,
							})
							call.end()
						}
					}
				})()
			},
			sendUserInput: (call: grpc.ServerWritableStream<taskControlPb.InvokeRequest, taskControlPb.ExtensionMessage>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					Logger.error("[GrpcBridge:sendUserInput] Client ID missing")
					if (!call.writableEnded) {
						call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: "Client ID missing" })
						call.end()
					}
					return
				}
				const request = call.request
				Logger.info(`[GrpcBridge:sendUserInput] Received for client ${clientId}.`)
				;(async () => {
					try {
						await this.handleUserInput(clientId, request.text, request.images)
						Logger.info(`[GrpcBridge:sendUserInput] Processed for client ${clientId}. Ending stream.`)
						if (!call.writableEnded) call.end()
					} catch (error: any) {
						Logger.error(`[GrpcBridge:sendUserInput] Error for client ${clientId}: ${error.message}`)
						if (!call.writableEnded) {
							call.write({
								type: taskControlPb.ExtensionMessageType.ERROR,
								errorMessage: `Input failed: ${error.message}`,
							})
							call.end()
						}
					}
				})()
			},
			submitAskResponse: (
				call: grpc.ServerWritableStream<taskControlPb.AskResponseRequest, taskControlPb.ExtensionMessage>,
			) => {
				console.log("[RAW_CONSOLE_LOG GrpcBridge:submitAskResponse] Method invoked.") // RAW CONSOLE LOG
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				console.log(`[RAW_CONSOLE_LOG GrpcBridge:submitAskResponse] Client ID from metadata: ${clientId}`) // RAW CONSOLE LOG
				if (!clientId) {
					Logger.error("[GrpcBridge:submitAskResponse] Client ID missing")
					console.error("[RAW_CONSOLE_LOG GrpcBridge:submitAskResponse] Client ID missing") // RAW CONSOLE LOG
					if (!call.writableEnded) {
						call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: "Client ID missing" })
						call.end()
					}
					return
				}
				const request = call.request
				Logger.info(`[GrpcBridge:submitAskResponse] Received for client ${clientId}.`)
				;(async () => {
					try {
						const webviewMsg: WebviewMessage = {
							type: "askResponse",
							askResponse:
								request.askResponseType === taskControlPb.AskResponseType.MESSAGE_RESPONSE
									? "messageResponse"
									: request.askResponseType === taskControlPb.AskResponseType.YES_BUTTON_CLICKED
										? "yesButtonClicked"
										: "noButtonClicked",
							text: request.text,
						}
						await this.handleAskResponse(clientId, webviewMsg)
						Logger.info(`[GrpcBridge:submitAskResponse] Processed for client ${clientId}. Ending stream.`)
						if (!call.writableEnded) call.end()
					} catch (error: any) {
						Logger.error(`[GrpcBridge:submitAskResponse] Error for client ${clientId}: ${error.message}`)
						if (!call.writableEnded) {
							call.write({
								type: taskControlPb.ExtensionMessageType.ERROR,
								errorMessage: `AskResponse failed: ${error.message}`,
							})
							call.end()
						}
					}
				})()
			},
			submitOptionsResponse: async (
				call: grpc.ServerWritableStream<taskControlPb.OptionsResponseRequest, taskControlPb.ExtensionMessage>,
			) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					Logger.error("[GrpcBridge:submitOptionsResponse] Client ID missing")
					if (!call.writableEnded) {
						call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: "Client ID missing" })
						call.end()
					}
					return
				}
				try {
					const webviewMsg: WebviewMessage = {
						type: "askResponse",
						askResponse: "messageResponse",
						text: call.request.selectedOption, // Corrected to camelCase
					}
					await this.handleAskResponse(clientId, webviewMsg)
					Logger.info(`[GrpcBridge:submitOptionsResponse] Processed for client ${clientId}. Ending stream.`)
					if (!call.writableEnded) call.end()
				} catch (error: any) {
					Logger.error(`[GrpcBridge:submitOptionsResponse] Error for client ${clientId}: ${error.message}`)
					if (!call.writableEnded) {
						call.write({
							type: taskControlPb.ExtensionMessageType.ERROR,
							errorMessage: `OptionsResponse failed: ${error.message}`,
						})
						call.end()
					}
				}
			},
			clearTask: async (call: grpc.ServerWritableStream<commonPb.EmptyRequest, taskControlPb.ExtensionMessage>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					Logger.error("[GrpcBridge:clearTask] Client ID missing")
					if (!call.writableEnded) {
						call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: "Client ID missing" })
						call.end()
					}
					return
				}
				try {
					await this.handleClearTask(clientId)
					Logger.info(`[GrpcBridge:clearTask] Processed for client ${clientId}. Ending stream.`)
					if (!call.writableEnded) call.end()
				} catch (error: any) {
					Logger.error(`[GrpcBridge:clearTask] Error for client ${clientId}: ${error.message}`)
					if (!call.writableEnded) {
						call.write({
							type: taskControlPb.ExtensionMessageType.ERROR,
							errorMessage: `ClearTask failed: ${error.message}`,
						})
						call.end()
					}
				}
			},
			cancelTask: async (call: grpc.ServerWritableStream<commonPb.EmptyRequest, taskControlPb.ExtensionMessage>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					Logger.error("[GrpcBridge:cancelTask] Client ID missing")
					if (!call.writableEnded) {
						call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: "Client ID missing" })
						call.end()
					}
					return
				}
				try {
					await this.handleCancelTask(clientId)
					Logger.info(`[GrpcBridge:cancelTask] Processed for client ${clientId}. Ending stream.`)
					if (!call.writableEnded) call.end()
				} catch (error: any) {
					Logger.error(`[GrpcBridge:cancelTask] Error for client ${clientId}: ${error.message}`)
					if (!call.writableEnded) {
						call.write({
							type: taskControlPb.ExtensionMessageType.ERROR,
							errorMessage: `CancelTask failed: ${error.message}`,
						})
						call.end()
					}
				}
			},
			deleteTaskWithId: async (
				call: grpc.ServerWritableStream<taskControlPb.DeleteTaskWithIdRequest, taskControlPb.ExtensionMessage>,
			) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					Logger.error("[GrpcBridge:deleteTaskWithId] Client ID missing")
					if (!call.writableEnded) {
						call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: "Client ID missing" })
						call.end()
					}
					return
				}
				try {
					await this.handleDeleteTaskWithId(clientId, call.request.taskId) // Corrected to camelCase
					Logger.info(`[GrpcBridge:deleteTaskWithId] Processed for client ${clientId}. Ending stream.`)
					if (!call.writableEnded) call.end()
				} catch (error: any) {
					Logger.error(`[GrpcBridge:deleteTaskWithId] Error for client ${clientId}: ${error.message}`)
					if (!call.writableEnded) {
						call.write({
							type: taskControlPb.ExtensionMessageType.ERROR,
							errorMessage: `DeleteTaskWithId failed: ${error.message}`,
						})
						call.end()
					}
				}
			},
			applyBrowserSettings: async (
				call: grpc.ServerWritableStream<taskControlPb.ApplyBrowserSettingsRequest, taskControlPb.ExtensionMessage>,
			) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					Logger.error("[GrpcBridge:applyBrowserSettings] Client ID missing")
					if (!call.writableEnded) {
						call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: "Client ID missing" })
						call.end()
					}
					return
				}
				try {
					await this.handleApplyBrowserSettings(clientId, call.request.settings) // Pass settings from request
					Logger.info(`[GrpcBridge:applyBrowserSettings] Processed for client ${clientId}. Ending stream.`)
					if (!call.writableEnded) call.end()
				} catch (error: any) {
					Logger.error(`[GrpcBridge:applyBrowserSettings] Error for client ${clientId}: ${error.message}`)
					if (!call.writableEnded) {
						call.write({
							type: taskControlPb.ExtensionMessageType.ERROR,
							errorMessage: `ApplyBrowserSettings failed: ${error.message}`,
						})
						call.end()
					}
				}
			},
			openFile: async (call: grpc.ServerWritableStream<taskControlPb.OpenFileRequest, taskControlPb.ExtensionMessage>) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					Logger.error("[GrpcBridge:openFile] Client ID missing")
					if (!call.writableEnded) {
						call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: "Client ID missing" })
						call.end()
					}
					return
				}
				try {
					await this.handleOpenFile(clientId, call.request.filePath) // Corrected to camelCase
					Logger.info(`[GrpcBridge:openFile] Processed for client ${clientId}. Ending stream.`)
					if (!call.writableEnded) call.end()
				} catch (error: any) {
					Logger.error(`[GrpcBridge:openFile] Error for client ${clientId}: ${error.message}`)
					if (!call.writableEnded) {
						call.write({
							type: taskControlPb.ExtensionMessageType.ERROR,
							errorMessage: `OpenFile failed: ${error.message}`,
						})
						call.end()
					}
				}
			},
			getLatestState: async (call: grpc.ServerWritableStream<commonPb.EmptyRequest, taskControlPb.ExtensionMessage>) => {
				if (!this.controller) {
					Logger.error("[GrpcBridge:getLatestState] Controller not available.")
					if (!call.writableEnded) {
						call.write({
							type: taskControlPb.ExtensionMessageType.ERROR,
							errorMessage: "Controller not available",
						})
						call.end()
					}
					return
				}
				try {
					const currentState = await this.controller.getStateToPostToWebview()
					const protoState = mapExtensionStateToProto(currentState)
					if (protoState) {
						if (!call.writableEnded) {
							call.write({ type: taskControlPb.ExtensionMessageType.STATE, state: protoState })
						}
					} else {
						Logger.error("[GrpcBridge:getLatestState] Failed to map current state to proto.")
						if (!call.writableEnded) {
							call.write({
								type: taskControlPb.ExtensionMessageType.ERROR,
								errorMessage: "Failed to map current state",
							})
						}
					}
					if (!call.writableEnded) call.end()
				} catch (error: any) {
					Logger.error(`[GrpcBridge:getLatestState] Error: ${error.message}`)
					if (!call.writableEnded) {
						call.write({
							type: taskControlPb.ExtensionMessageType.ERROR,
							errorMessage: `GetLatestState failed: ${error.message}`,
						})
						call.end()
					}
				}
			},
			updateSettings: async (
				call: grpc.ServerWritableStream<taskControlPb.UpdateSettingsRequest, taskControlPb.ExtensionMessage>,
			) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				Logger.info(
					`[GrpcBridge:updateSettings] Handler entered. Client ID: ${clientId}, Request: ${JSON.stringify(call.request)}`,
				)
				try {
					await this.handleUpdateSettings(clientId!, call.request)
					if (!call.writableEnded) {
						call.write({ type: taskControlPb.ExtensionMessageType.DID_UPDATE_SETTINGS })
						call.end()
					}
				} catch (e: any) {
					Logger.error(`[GrpcBridge:updateSettings] Error: ${e.message} ${e.stack}`)
					if (!call.writableEnded) {
						call.write({
							type: taskControlPb.ExtensionMessageType.ERROR,
							errorMessage: `updateSettings failed: ${e.message}`,
						})
						call.end()
					}
				}
			},
		}
	}
	private createBrowserImplementation(): grpc.UntypedServiceImplementation {
		const getDetectedChromePathHandler: grpc.handleUnaryCall<commonPb.EmptyRequest, browserPb.ChromePath> = (
			call: grpc.ServerUnaryCall<commonPb.EmptyRequest, browserPb.ChromePath>,
			callback: grpc.sendUnaryData<browserPb.ChromePath>,
		) => {
			// Minimal diagnostic version
			try {
				const hardcodedResponse: browserPb.ChromePath = browserPb.ChromePath.create({
					path: "test/path",
					isBundled: false,
				})
				callback(null, hardcodedResponse)
			} catch (error: any) {
				Logger.error(`[GrpcBridge:getDetectedChromePath] Minimal Error: ${error.message}`)
				callback({ code: grpc.status.INTERNAL, details: error.message } as grpc.ServiceError, null)
			}
		}

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
			testBrowserConnection: async (
				call: grpc.ServerUnaryCall<commonPb.StringRequest, browserPb.BrowserConnection>,
				callback: grpc.sendUnaryData<browserPb.BrowserConnection>,
			) => {
				const endpoint = call.request.value
				if (!endpoint) {
					return callback({ code: grpc.status.INVALID_ARGUMENT, details: "Endpoint missing in StringRequest" })
				}
				try {
					const currentSettings = (await getAllExtensionState(this.context)).browserSettings
					const browserSession = new BrowserSession(this.context, currentSettings)
					const result = await browserSession.testConnection(endpoint)
					callback(null, { success: result.success, message: result.message, endpoint: result.endpoint ?? undefined })
				} catch (error: any) {
					Logger.error(`[GrpcBridge:testBrowserConnection] Error: ${error.message}`)
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			discoverBrowser: async (
				call: grpc.ServerUnaryCall<commonPb.EmptyRequest, browserPb.BrowserConnection>,
				callback: grpc.sendUnaryData<browserPb.BrowserConnection>,
			) => {
				try {
					const currentSettings = (await getAllExtensionState(this.context)).browserSettings
					const browserSession = new BrowserSession(this.context, currentSettings)
					const path = await browserSession.getDetectedChromePath()
					if (path) {
						// Attempt to test connection to the discovered browser if possible, or just confirm path found
						// For simplicity, we'll assume finding the path is success for now.
						// A more robust implementation might try to launch and connect.
						callback(null, { success: true, message: `Discovered browser at: ${path}`, endpoint: undefined })
					} else {
						callback(null, { success: false, message: "Compatible browser not found.", endpoint: undefined })
					}
				} catch (error: any) {
					Logger.error(`[GrpcBridge:discoverBrowser] Error: ${error.message}`)
					callback({ code: grpc.status.INTERNAL, details: error.message })
				}
			},
			getDetectedChromePath: getDetectedChromePathHandler,
			updateBrowserSettings: async (
				call: grpc.ServerUnaryCall<browserPb.UpdateBrowserSettingsRequest, commonPb.Boolean>,
				callback: grpc.sendUnaryData<commonPb.Boolean>,
			) => {
				try {
					const req = call.request
					const newSettings: BrowserSettings = {
						viewport: {
							width: req.viewport?.width ?? 900,
							height: req.viewport?.height ?? 600,
						},
						remoteBrowserHost: req.remoteBrowserHost ?? undefined,
						remoteBrowserEnabled: req.remoteBrowserEnabled ?? false,
					}
					await updateGlobalState(this.context, "browserSettings", newSettings)
					await this.controller?.postStateToWebview() // Notify webview of changes
					Logger.info(`[GrpcBridge] Updated browser settings.`)
					callback(null, { value: true })
				} catch (error: any) {
					Logger.error(`[GrpcBridge:updateBrowserSettings] Error: ${error.message}`)
					callback({ code: grpc.status.INTERNAL, details: error.message }, null)
				}
			},
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
				// Initialize tracker for this new task
				if (!this.sentMessagesTracker.has(taskInstance.taskId)) {
					this.sentMessagesTracker.set(taskInstance.taskId, new Set<string>())
					Logger.info(`[GrpcBridge:initTask] Initialized sentMessagesTracker for task ${taskInstance.taskId}`)
				}
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
					// Clean up sentMessagesTracker for the disposed task
					if (this.sentMessagesTracker.delete(taskInstance.taskId!)) {
						Logger.info(
							`[GrpcBridge:initTask] Cleaned up sentMessagesTracker for disposed task ${taskInstance.taskId}`,
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

			// Handle chat settings update
			if (settings.chatSettings) {
				const protoChatSettings = settings.chatSettings as taskControlPb.ChatSettings // Cast for type safety
				const internalChatSettingsUpdate: Partial<ChatSettings> = {}

				switch (protoChatSettings.mode) {
					case taskControlPb.ChatMode.PLAN:
						internalChatSettingsUpdate.mode = "plan"
						break
					case taskControlPb.ChatMode.ACT:
						internalChatSettingsUpdate.mode = "act"
						break
					case taskControlPb.ChatMode.CHAT_MODE_UNSPECIFIED:
						// Do nothing or log a warning if unspecified is not expected
						Logger.info(
							"[GrpcBridge:handleUpdateSettings] Received CHAT_MODE_UNSPECIFIED for chatSettings.mode. No update applied for mode.",
						)
						break
					default:
						Logger.warn(`[GrpcBridge:handleUpdateSettings] Unknown ChatMode enum value: ${protoChatSettings.mode}`)
						break
				}

				if (internalChatSettingsUpdate.mode) {
					Logger.info(
						`[GrpcBridge:handleUpdateSettings] Persisting ChatSettings update: ${JSON.stringify(internalChatSettingsUpdate)}`,
					)
					// Assuming ChatSettings are stored under a specific key in global state, e.g., "chatSettings"
					// Adjust the key if it's different or part of a larger settings object.
					const currentChatSettings = (await getAllExtensionState(this.context)).chatSettings || {}
					const newChatSettings = { ...currentChatSettings, ...internalChatSettingsUpdate }
					await updateGlobalState(this.context, "chatSettings", newChatSettings)
					Logger.info(`[GrpcBridge:handleUpdateSettings] ChatSettings updated in global state.`)

					// If the controller has a direct way to update its chat mode, call it.
					// Otherwise, postStateToWebview will eventually update it.
					if (this.controller && internalChatSettingsUpdate.mode) {
						// This assumes controller might have a method like this, or it's handled by general state update
						// For now, relying on postStateToWebview to propagate the change.
						// If a more direct update method exists in Controller, it could be called here.
						// e.g., await this.controller.setChatMode(internalChatSettingsUpdate.mode);
					}
				}
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
		console.log(`[RAW_CONSOLE_LOG GrpcBridge:handleAskResponse] Method invoked for client ${clientId}.`) // RAW CONSOLE LOG
		Logger.info(`[GrpcBridge] handleAskResponse received for client ${clientId}`) // Use static Logger
		const task = this.clientTaskMap.get(clientId)
		if (task && response.type === "askResponse") {
			Logger.info(`[GrpcBridge] Forwarding ask response to task ${task.taskId}`) // Use static Logger
			console.log(`[RAW_CONSOLE_LOG GrpcBridge:handleAskResponse] Forwarding ask response to task ${task.taskId}`) // RAW CONSOLE LOG
			task.handleWebviewAskResponse(response.askResponse!, response.text, response.images)
		} else {
			if (!task) {
				Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleAskResponse`)
				console.warn(`[RAW_CONSOLE_LOG GrpcBridge:handleAskResponse] Task not found for clientId ${clientId}`) // RAW CONSOLE LOG
			} // Use static Logger
			if (response.type !== "askResponse") {
				Logger.warn(`[GrpcBridge] Received non-askResponse message in handleAskResponse: ${response.type}`)
			} // Use static Logger
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
							if (extMsg.state && taskId) {
								// Ensure taskId is available for tracking
								const activeTaskMessages = extMsg.state.clineMessages || []
								let newMessagesSentCount = 0
								if (!this.sentMessagesTracker.has(taskId)) {
									this.sentMessagesTracker.set(taskId, new Set<string>())
									Logger.info(
										`[WRAPPER_TRACE] GRPC_ROUTE: Initialized sentMessagesTracker for task ${taskId} during state processing.`,
									)
								}
								const taskSentMessageIds = this.sentMessagesTracker.get(taskId)!

								for (const chatMessage of activeTaskMessages) {
									const isComplete = chatMessage.partial === undefined || chatMessage.partial === false
									if (isComplete && chatMessage.ts && !taskSentMessageIds.has(chatMessage.ts.toString())) {
										const protoChatMessage = mapClineMessageToProto(chatMessage)
										if (protoChatMessage) {
											Logger.info(
												`[WRAPPER_TRACE] GRPC_ROUTE: Emitting newChatMessage for client ${clientId}, task ${taskId}, msgTs ${chatMessage.ts}.`,
											)
											this.grpcNotifier.emit("newChatMessage", clientId, taskId, protoChatMessage)
											taskSentMessageIds.add(chatMessage.ts.toString())
											newMessagesSentCount++
										} else {
											Logger.warn(
												`[WRAPPER_TRACE] GRPC_ROUTE: Failed to map individual ClineMessage (ts: ${chatMessage.ts}) to proto for client ${clientId}.`,
											)
										}
									}
								}
								if (newMessagesSentCount > 0) {
									successfullySentToGrpc = true // Indicate that gRPC path handled these messages
									Logger.info(
										`[WRAPPER_TRACE] GRPC_ROUTE: Sent ${newMessagesSentCount} new complete messages for task ${taskId} via newChatMessage.`,
									)
								} else {
									// If no new messages were sent, we might still want to send a stateUpdate for other state changes,
									// or decide to suppress it if only message history is the concern.
									// For now, let's assume if new messages were sent, that's the primary update.
									// If not, the original stateUpdate logic could run, or be suppressed.
									// Current goal: avoid resending full history. So if newMessagesSentCount is 0, we don't emit stateUpdate for messages.
									// However, other parts of the state might need updating.
									// For now, if new messages are sent, we consider it handled.
									// If no new messages, we might still need to send the state for non-message updates.
									// This part needs careful consideration of what `stateUpdate` is for beyond messages.
									// Let's log if we are *not* sending a full state update due to this new logic.
									Logger.debug(
										`[WRAPPER_TRACE] GRPC_ROUTE: No new *complete* messages to send for task ${taskId}. Original stateUpdate for other state parts would have occurred here.`,
									)
								}
								// To prevent the original full stateUpdate from always firing and resending history:
								// We've handled new complete messages. If other parts of 'state' are critical for gRPC
								// and are not covered by other events, a separate mechanism or a stripped-down stateUpdate
								// might be needed. For now, if newMessagesSentCount > 0, we consider the message history part handled.
								// If the goal is *only* to send new messages and *never* the full state for message history,
								// then `successfullySentToGrpc = true` should be set if any processing happened here,
								// effectively bypassing the original full `stateUpdate` for messages.
								// Let's assume for now that if we are in the 'state' case, and we've processed messages,
								// we don't want the old `stateUpdate` to also fire with the full message list.
								// So, if taskId was present, we consider this path as "handling" the message part of the state.
								successfullySentToGrpc = true
							} else {
								Logger.warn(
									`[WRAPPER_TRACE] GRPC_ROUTE: 'state' message received but taskId is undefined or extMsg.state is missing. Cannot process for newChatMessage. ClientId: ${clientId}`,
								)
								// Fallback to original behavior if critical info is missing for new logic
								const protoState = extMsg.state ? mapExtensionStateToProto(extMsg.state) : null
								if (protoState) {
									Logger.info(
										`[WRAPPER_TRACE] GRPC_ROUTE: Fallback - Emitting full stateUpdate for client ${clientId}.`,
									)
									this.grpcNotifier.emit("stateUpdate", clientId, protoState)
									successfullySentToGrpc = true
								} else {
									Logger.warn(
										`[WRAPPER_TRACE] GRPC_ROUTE: Fallback - Failed to map 'state' to proto for client ${clientId}.`,
									)
								}
							}
							break
						case "partialMessage":
							if (clientId && this.grpcNotifier && extMsg.partialMessage) {
								const currentPartialMsg = extMsg.partialMessage
								// Handle 'say: "error"' separately and immediately
								if (
									currentPartialMsg.type === "say" &&
									currentPartialMsg.say === "error" &&
									currentPartialMsg.text
								) {
									Logger.warn(
										`[WRAPPER_TRACE] GRPC_ROUTE: Intercepted SAY_ERROR for client ${clientId}: ${currentPartialMsg.text}`,
									)
									this.grpcNotifier.emit("error", clientId, currentPartialMsg.text)
									successfullySentToGrpc = true
								} else if (currentPartialMsg.ts && taskId) {
									// Proceed with buffering only if not an immediate error and ts/taskId are present
									const taskBufferMap =
										this.grpcPartialMessageBuffer.get(taskId) ?? new Map<string, ClineMessage>()
									this.grpcPartialMessageBuffer.set(taskId, taskBufferMap)

									const messageTs = currentPartialMsg.ts.toString()
									let bufferedMessage = taskBufferMap.get(messageTs)

									if (!bufferedMessage) {
										// First time seeing this message.ts, clone it.
										bufferedMessage = JSON.parse(JSON.stringify(currentPartialMsg)) as ClineMessage
									} else {
										// Append content to existing buffered message
										if (bufferedMessage.type === currentPartialMsg.type) {
											if (currentPartialMsg.text) {
												// Common text field
												bufferedMessage.text = (bufferedMessage.text || "") + currentPartialMsg.text
											}

											if (bufferedMessage.type === "say" && currentPartialMsg.type === "say") {
												// Properties 'say' are guaranteed to exist due to the type check above
												if (bufferedMessage.say === currentPartialMsg.say) {
													if (bufferedMessage.say === "tool_code") {
														// Explicitly cast to a type that includes tool_code specific fields
														const bmToolCode = bufferedMessage as ClineMessage & {
															toolInput?: string
															toolName?: string
															toolArgs?: string
														}
														const cpToolCode = currentPartialMsg as ClineMessage & {
															toolInput?: string
															toolName?: string
															toolArgs?: string
														}
														if (cpToolCode.toolInput) {
															bmToolCode.toolInput =
																(bmToolCode.toolInput || "") + cpToolCode.toolInput
														}
														if (cpToolCode.toolName) bmToolCode.toolName = cpToolCode.toolName
														if (cpToolCode.toolArgs) bmToolCode.toolArgs = cpToolCode.toolArgs
													}
													// Other 'say' subtypes (like 'text' for tool_use XML) are handled by common text appending
												} else {
													Logger.warn(
														`[WRAPPER_TRACE] GRPC_ROUTE: Mismatch in 'say' subtype for partial message ts ${messageTs}. Buffered: ${bufferedMessage.say}, Incoming: ${currentPartialMsg.say}. Not appending specific content.`,
													)
												}
											} else if (bufferedMessage.type === "ask" && currentPartialMsg.type === "ask") {
												// Properties 'ask' are guaranteed to exist
												if (bufferedMessage.ask === currentPartialMsg.ask) {
													// Append ask-specific streamable fields if any (text is common, handled above)
												} else {
													Logger.warn(
														`[WRAPPER_TRACE] GRPC_ROUTE: Mismatch in 'ask' subtype for partial message ts ${messageTs}. Buffered: ${bufferedMessage.ask}, Incoming: ${currentPartialMsg.ask}. Not appending specific content.`,
													)
												}
											}
											// No 'else if (bufferedMessage.type === "tool_use")' because ClineMessage.type is only "say" or "ask".
											// A tool_use by AI is type: "say", say: "text" (XML in text field).
										} else {
											Logger.warn(
												`[WRAPPER_TRACE] GRPC_ROUTE: Mismatch in top-level type for partial message ts ${messageTs}. Buffered: ${bufferedMessage.type}, Incoming: ${currentPartialMsg.type}. Not appending content.`,
											)
										}
										// Always update to the latest partial status
										bufferedMessage.partial = currentPartialMsg.partial
									}

									// Ensure bufferedMessage is defined before proceeding
									if (bufferedMessage) {
										taskBufferMap.set(messageTs, bufferedMessage) // Store updated/new message in buffer

										if (bufferedMessage.partial === false || bufferedMessage.partial === undefined) {
											// Message is complete
											const protoClineMsg = mapClineMessageToProto(bufferedMessage)
											if (protoClineMsg) {
												Logger.info(
													`[WRAPPER_TRACE] GRPC_ROUTE: Emitting buffered newChatMessage for client ${clientId}, task ${taskId}, msgTs ${messageTs}. Type: ${bufferedMessage.type}`,
												)
												this.grpcNotifier.emit("newChatMessage", clientId, taskId, protoClineMsg)

												const taskSentMessageIds =
													this.sentMessagesTracker.get(taskId) ?? new Set<string>()
												taskSentMessageIds.add(messageTs)
												this.sentMessagesTracker.set(taskId, taskSentMessageIds)

												taskBufferMap.delete(messageTs)
												if (taskBufferMap.size === 0) {
													this.grpcPartialMessageBuffer.delete(taskId)
												}
											} else {
												Logger.warn(
													`[WRAPPER_TRACE] GRPC_ROUTE: Failed to map buffered 'partialMessage' (ts: ${messageTs}) to proto for client ${clientId}.`,
												)
											}
										}
									}
									successfullySentToGrpc = true // Indicate gRPC path handled this (either buffered or sent)
								} else {
									// Not an error, but no timestamp or taskId, or other condition not met for buffering.
									// Let it fall through if not explicitly handled.
									Logger.debug(
										`[WRAPPER_TRACE] GRPC_ROUTE: Partial message for client ${clientId} not buffered (no ts or taskId, or other). Type: ${currentPartialMsg.type}`,
									)
								}
							}
							break
						// Add other cases like tool_result if they are expected to be routed
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
		if (!taskId) {
			return undefined
		}
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
		this.sentMessagesTracker.clear() // Clear the tracker on dispose
		this.grpcPartialMessageBuffer.clear() // Clear the partial message buffer
		Logger.info("[GrpcBridge] Cleared clientTaskMap, sentMessagesTracker, and grpcPartialMessageBuffer.")
		vscode.Disposable.from(...this.disposables).dispose()
		this.disposables = []
		Logger.info("[GrpcBridge] Disposed.") // Use static Logger
	}
}

import * as grpc from "@grpc/grpc-js"
import * as protoLoader from "@grpc/proto-loader"
import * as path from "path"
import { Timestamp } from "google-protobuf/google/protobuf/timestamp_pb" // Keep for now, check installation later if error persists
import { Controller } from "../../core/controller" // Correct path
import { Logger } from "../../services/logging/Logger"
import { discoverChromeInstances, testBrowserConnection } from "../../services/browser/BrowserDiscovery"
import { WebviewMessage } from "../../shared/WebviewMessage"
import { ExtensionMessage, ExtensionState } from "../../shared/ExtensionMessage"
import { mapExtensionStateToProto, ProtoExtensionState, ProtoToolResultBlock, ProtoToolUseBlock } from "./mapper" // Correct path, Import ProtoToolResultBlock & ProtoToolUseBlock
// Import the generated enum type and message type for ClineMessage
import {
	ClineMessage_Type as ProtoClineMessageType,
	ClineMessage as GeneratedProtoClineMessage, // Import the generated message type
} from "../../shared/proto/task_control"

// --- Proto Message Type Definitions ---
const ProtoExtensionMessageType = {
	EXTENSION_MESSAGE_TYPE_UNSPECIFIED: 0,
	STATE: 1,
	PARTIAL_MESSAGE: 2,
	TEXT: 3,
	ASK_REQUEST: 4,
	TOOL_USE: 5,
	TOOL_RESULT: 6,
	TASK_STARTED: 39,
	ERROR: 99,
}

interface ProtoTaskStartedInfo {
	task_id: string
	version: string
}

export interface ProtoAskRequest {
	// Add export
	ask_type: string
	text?: string
	partial?: boolean
	ts?: Timestamp | undefined
}

// Removed redundant manual ProtoClineMessage interface
// Removed redundant ProtoToolUseBlockDefinition interface
// Removed redundant ProtoToolResultBlockDefinition interface

// Wrapper matching the 'oneof payload' structure in task_control.proto
export interface ProtoExtensionMessageWrapper {
	type: number // Corresponds to ProtoExtensionMessageType enum values
	state?: ProtoExtensionState
	partialMessage?: GeneratedProtoClineMessage // Use the imported generated type
	askRequest?: ProtoAskRequest
	taskStarted?: ProtoTaskStartedInfo
	textMessage?: GeneratedProtoClineMessage // Use the imported generated type
	toolUse?: Partial<ProtoToolUseBlock> // Use Partial<ProtoToolUseBlock> here
	toolResult?: Partial<ProtoToolResultBlock> // Use Partial<ProtoToolResultBlock> here
	error?: string
}

export const ProtoExtensionMessageTypeConst = ProtoExtensionMessageType

// --- Callback and Notifier Definitions ---

/** Callbacks provided TO ExternalGrpcServer for handling incoming client messages */
export interface GrpcServerCallbacks {
	/** Handles the response to an 'ask' request */
	handleAskResponse: (clientId: string, response: WebviewMessage) => Promise<void>
	/** Handles the result of a tool execution provided by the client */
	handleToolResult: (clientId: string, result: Partial<ProtoToolResultBlock>) => Promise<void> // Use Partial<ProtoToolResultBlock>
	/** Handles generic user input */
	handleUserInput: (clientId: string, text?: string, images?: string[]) => Promise<void>
	/** Handles other webview-like messages forwarded from gRPC */
	handleGenericMessage: (clientId: string, message: WebviewMessage) => Promise<void>
	/** Initiates a new task */
	initTask: (clientId: string, text?: string, images?: string[]) => Promise<void>
	/** Clears the current task associated with the client (or globally if no specific task) */
	handleClearTask: (clientId: string) => Promise<void>
	/** Cancels the current task associated with the client */
	handleCancelTask: (clientId: string) => Promise<void>
	/** Deletes a specific task by ID */
	handleDeleteTaskWithId: (clientId: string, taskId: string) => Promise<void>
	/** Applies browser settings */
	handleApplyBrowserSettings: (clientId: string, settings: any) => Promise<void> // Use 'any' for now, replace with actual BrowserSettings type if available
	/** Opens a file */
	handleOpenFile: (clientId: string, filePath: string) => Promise<void>
	/** Handles client disconnection */
	handleClientDisconnect: (clientId: string) => Promise<void> // Added this line
	// Add other specific handlers as needed...
}

/** Interface returned BY ExternalGrpcServer for sending messages TO the client */
export interface GrpcTaskNotifier {
	notifySay: (clientId: string, message: Partial<GeneratedProtoClineMessage>, isPartial: boolean) => void // Use Partial<GeneratedProtoClineMessage>
	notifyAsk: (clientId: string, request: ProtoAskRequest) => void
	notifyToolUse: (clientId: string, toolUse: Partial<ProtoToolUseBlock>) => void // Use Partial<ProtoToolUseBlock>
	notifyState: (clientId: string, state: ProtoExtensionState) => void
	notifyError: (clientId: string, error: string) => void
	notifyTaskStarted: (clientId: string, info: ProtoTaskStartedInfo) => void
}

// --- Server State ---
let server: grpc.Server | null = null
const activeStreams = new Map<string, grpc.ServerWritableStream<any, any>>()
let grpcNotifier: GrpcTaskNotifier | null = null // Hold the notifier instance

// --- Helper Functions ---
function generateClientId(): string {
	return `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`
}

// Modified to accept callbacks
function registerClientStream(stream: grpc.ServerWritableStream<any, any>, callbacks: GrpcServerCallbacks): string {
	const clientId = generateClientId()
	activeStreams.set(clientId, stream)

	const handleDisconnect = () => {
		if (activeStreams.delete(clientId)) {
			Logger.info(`[External GRPC] Client ${clientId} stream disconnected/ended.`)
			// Call the callback to handle disconnection logic (e.g., abort task)
			callbacks.handleClientDisconnect(clientId).catch((err: Error) => {
				// Added ': Error' type annotation
				Logger.error(
					`[gRPC-Error: Server:registerClientStream] Error during handleClientDisconnect for ${clientId}: ${err.message}`,
				)
			})
		}
	}

	stream.on("end", () => {
		Logger.debug(`[gRPC-Debug: Server:registerClientStream] Stream ended event for client ${clientId}`)
		handleDisconnect()
	})
	stream.on("error", (error: Error) => {
		Logger.error(`[gRPC-Debug: Server:registerClientStream] Stream error event for client ${clientId}: ${error.message}`)
		handleDisconnect() // Treat stream errors as disconnections
	})
	// Also handle cancellation explicitly if possible (often overlaps with 'error' or 'end')
	stream.on("cancelled", () => {
		Logger.debug(`[gRPC-Debug: Server:registerClientStream] Stream cancelled event for client ${clientId}`)
		handleDisconnect()
	})

	Logger.info(`[External GRPC] Registered new client stream with ID ${clientId}`)
	return clientId
}

// --- Notifier Implementation ---

/** Sends a message object to a specific client stream */
function postMessageToSpecificClientInternal(clientId: string, message: ProtoExtensionMessageWrapper): void {
	Logger.trace(
		`[gRPC-Trace: Server:postMessageInternal] Attempting to send message to client ${clientId}. Type: ${message.type}`,
	)
	const stream = activeStreams.get(clientId)
	if (stream && !stream.destroyed) {
		try {
			const messageSummary = `type: ${message.type}${message.state ? ", state included" : ""}${message.partialMessage ? ", partial included" : ""}${message.askRequest ? ", ask included" : ""}`
			Logger.trace(
				`[gRPC-Trace: Server:postMessageInternal] Sending data summary to client ${clientId}: { ${messageSummary} }`,
			)
			if (message.type === ProtoExtensionMessageTypeConst.STATE && message.state) {
				Logger.trace(
					`[gRPC-Trace: Server:postMessageInternal] Preparing STATE message for client ${clientId}. currentTaskItem.id: ${message.state.currentTaskItem?.id}`,
				)
			}
			stream.write(message) // gRPC library handles serialization
			Logger.info(`[External GRPC] Sent direct message to client ${clientId}, type: ${message.type}`)
		} catch (error: any) {
			Logger.error(
				`[gRPC-Debug: Server:postMessageInternal] Error sending direct message to client ${clientId}: ${error.message}`,
			)
			activeStreams.delete(clientId) // Remove stream on write error
		}
	} else {
		Logger.debug(
			`[gRPC-Debug: Server:postMessageInternal] Attempted send to non-existent/destroyed stream for client ${clientId}`,
		)
		if (activeStreams.has(clientId)) {
			activeStreams.delete(clientId) // Clean up map if entry exists but stream is bad
			Logger.info(`[External GRPC] Cleaned up non-existent/destroyed stream entry for client ${clientId}`)
		}
	}
}

function createGrpcNotifier(): GrpcTaskNotifier {
	return {
		notifySay: (clientId: string, message: Partial<GeneratedProtoClineMessage>, isPartial: boolean) => {
			// Use Partial<GeneratedProtoClineMessage>
			const wrapper: ProtoExtensionMessageWrapper = {
				type: isPartial ? ProtoExtensionMessageTypeConst.PARTIAL_MESSAGE : ProtoExtensionMessageTypeConst.TEXT,
				// Ensure the property name matches the oneof field in ProtoExtensionMessageWrapper
				[isPartial ? "partialMessage" : "textMessage"]: message as GeneratedProtoClineMessage, // Cast Partial to full for assignment
			}
			postMessageToSpecificClientInternal(clientId, wrapper)
		},
		notifyAsk: (clientId: string, request: ProtoAskRequest) => {
			const wrapper: ProtoExtensionMessageWrapper = {
				type: ProtoExtensionMessageTypeConst.ASK_REQUEST,
				askRequest: request,
			}
			postMessageToSpecificClientInternal(clientId, wrapper)
		},
		notifyToolUse: (clientId: string, toolUse: Partial<ProtoToolUseBlock>) => {
			// Use Partial<ProtoToolUseBlock>
			const wrapper: ProtoExtensionMessageWrapper = {
				type: ProtoExtensionMessageTypeConst.TOOL_USE,
				toolUse: toolUse, // Assign the Partial type
			}
			postMessageToSpecificClientInternal(clientId, wrapper)
		},
		notifyState: (clientId: string, state: ProtoExtensionState) => {
			const wrapper: ProtoExtensionMessageWrapper = {
				type: ProtoExtensionMessageTypeConst.STATE,
				state: state,
			}
			postMessageToSpecificClientInternal(clientId, wrapper)
		},
		notifyError: (clientId: string, error: string) => {
			const wrapper: ProtoExtensionMessageWrapper = {
				type: ProtoExtensionMessageTypeConst.ERROR,
				error: error,
			}
			postMessageToSpecificClientInternal(clientId, wrapper)
		},
		notifyTaskStarted: (clientId: string, info: ProtoTaskStartedInfo) => {
			const wrapper: ProtoExtensionMessageWrapper = {
				type: ProtoExtensionMessageTypeConst.TASK_STARTED,
				taskStarted: info,
			}
			postMessageToSpecificClientInternal(clientId, wrapper)
		},
	}
}

// --- Main Server Function ---

/**
 * Starts the external gRPC server.
 * @param controller The main controller instance (used for some services like MCP/Browser).
 * @param callbacks Callbacks for handling incoming gRPC messages related to task execution.
 * @param extensionPath Path to the extension's root directory.
 * @param port Port number to listen on.
 * @returns The GrpcTaskNotifier interface for sending messages back to clients, or null if server fails to start.
 */
export function startExternalGrpcServer(
	controller: Controller,
	callbacks: GrpcServerCallbacks, // Accept callbacks
	extensionPath: string,
	port: number = 50051,
): GrpcTaskNotifier | null {
	try {
		Logger.info("[External GRPC] Starting startExternalGrpcServer function...")
		const PROTO_DIR = path.join(extensionPath, "dist", "proto") // Assuming protos are copied to dist/proto during build
		if (server) {
			Logger.warn("[External GRPC] Server instance already exists.")
			return grpcNotifier
		} // Return existing notifier

		Logger.info("[External GRPC] Loading proto definitions...")
		const packageDefinition = protoLoader.loadSync(
			[
				path.join(PROTO_DIR, "browser.proto"),
				path.join(PROTO_DIR, "checkpoints.proto"),
				path.join(PROTO_DIR, "mcp.proto"),
				path.join(PROTO_DIR, "common.proto"),
				path.join(PROTO_DIR, "task_control.proto"),
			],
			{ keepCase: true, longs: String, enums: String, defaults: true, oneofs: true, includeDirs: [PROTO_DIR] },
		)
		const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any
		Logger.info("[External GRPC] Proto definitions loaded.")

		server = new grpc.Server()
		grpcNotifier = createGrpcNotifier() // Create the notifier instance
		Logger.info("[External GRPC] gRPC server instance and notifier created.")

		if (!protoDescriptor || !protoDescriptor.cline) throw new Error("Failed to load 'cline' package.")

		// --- Service Implementations (Browser, Checkpoints, MCP - Simplified for brevity) ---
		// These services might still need direct access to the controller or its components
		if (protoDescriptor.cline.BrowserService) {
			const browserServiceImpl = {
				getBrowserConnectionInfo: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
					/* ... uses controller.task.browserSession ... */
				},
				testBrowserConnection: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
					/* ... uses testBrowserConnection utility ... */
				},
				discoverBrowser: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
					/* ... uses discoverChromeInstances utility ... */
				},
			}
			server.addService(protoDescriptor.cline.BrowserService.service, browserServiceImpl)
			Logger.info("[External GRPC] Registered BrowserService.")
		} else {
			Logger.warn("[External GRPC] BrowserService definition not found.")
		}

		if (protoDescriptor.cline.CheckpointsService) {
			const checkpointsServiceImpl = {
				checkpointDiff: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
					/* ... uses controller.task.getCheckpointDiffSet ... */
				},
			}
			server.addService(protoDescriptor.cline.CheckpointsService.service, checkpointsServiceImpl)
			Logger.info("[External GRPC] Registered CheckpointsService.")
		} else {
			Logger.warn("[External GRPC] CheckpointsService definition not found.")
		}

		if (protoDescriptor.cline.McpService) {
			const mcpServiceImpl = {
				toggleMcpServer: async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
					/* ... uses controller.mcpHub ... */
				},
			}
			server.addService(protoDescriptor.cline.McpService.service, mcpServiceImpl)
			Logger.info("[External GRPC] Registered McpService.")
		} else {
			Logger.warn("[External GRPC] McpService definition not found.")
		}

		// --- TaskControlService Implementation (Using Callbacks) ---
		if (protoDescriptor.cline?.task_control?.TaskControlService) {
			Logger.info("[External GRPC] TaskControlService Definition found.")
			try {
				const taskControlServiceImpl: any = {}

				// startTask: Calls the initTask callback
				taskControlServiceImpl.startTask = (call: grpc.ServerWritableStream<any, any>) => {
					let clientId: string | null = null
					try {
						const request = call.request
						Logger.trace(`[gRPC-Trace: Server:startTask] Received request: ${JSON.stringify(request)}`)
						// Pass callbacks to registerClientStream
						clientId = registerClientStream(call, callbacks)
						const currentClientId = clientId // Capture for use in async blocks
						Logger.info(`[External GRPC] Handling startTask for new client ${currentClientId}`)

						// Use the initTask callback provided during server start
						callbacks
							.initTask(currentClientId, request.text || undefined, request.chat_content?.images || undefined)
							.then(() => {
								Logger.info(
									`[External GRPC] initTask callback completed successfully for client ${currentClientId}.`,
								)
								// Task should send its own state via the notifier now.
							})
							.catch((error: Error) => {
								Logger.error(
									`[gRPC-Error: Server:startTask] Error from initTask callback for ${currentClientId}: ${error.message}`,
								)
								if (grpcNotifier && currentClientId) {
									grpcNotifier.notifyError(
										currentClientId,
										`Failed during task initialization: ${error.message}`,
									)
								}
								if (currentClientId) activeStreams.delete(currentClientId) // Cleanup stream map
								if (!call.destroyed) call.end() // End the gRPC call on error
							})

						// Stream event handlers are now inside registerClientStream
					} catch (error: any) {
						Logger.error(`[GRPC Err] Setup startTask stream: ${error.message}`)
						if (grpcNotifier && clientId)
							grpcNotifier.notifyError(clientId, `Failed to set up task stream: ${error.message}`)
						try {
							if (!call.destroyed) call.end()
						} catch (e) {}
						if (clientId) activeStreams.delete(clientId)
					}
				}

				// Helper for methods that map to a specific callback
				const createUnaryCallbackForwardingMethod = (
					methodName: string,
					// The specific callback method from GrpcServerCallbacks to invoke
					specificCallback: (clientId: string, request: any) => Promise<void>,
				) => {
					return (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
						try {
							const request = call.request
							Logger.trace(`[gRPC-Trace: Server:${methodName}] Received unary request: ${JSON.stringify(request)}`)
							// For unary calls, we don't register a stream.
							// We need a way to associate this request with a task/client if necessary.
							// Using a placeholder ID for now, assuming the callback implementation can handle it
							// (e.g., by operating on the globally active task or using info in the request).
							const targetClientId = request.client_id || "unary_call" // Use client_id from request if provided, else placeholder

							specificCallback(targetClientId, request)
								.then(() => {
									Logger.info(
										`[External GRPC] ${methodName} handled successfully for client ${targetClientId}.`,
									)
									callback(null, { success: true }) // Send success response
								})
								.catch((error: Error) => {
									Logger.error(
										`[gRPC-Error: Server:${methodName}] Error from specific callback: ${error.message}`,
									)
									callback(
										{
											code: grpc.status.INTERNAL,
											details: `Failed to handle ${methodName}: ${error.message}`,
										},
										null,
									)
								})
						} catch (error: any) {
							Logger.error(`[GRPC Err] Setup ${methodName} unary handler: ${error.message}`)
							callback(
								{
									code: grpc.status.INTERNAL,
									details: `Error setting up ${methodName} handler: ${error.message}`,
								},
								null,
							)
						}
					}
				}

				// Helper for methods that map to the generic message handler
				const createGenericHandlerForwardingMethod = (
					methodName: string,
					// Map request to WebviewMessage
					requestToWebviewMessage: (request: any) => WebviewMessage | null,
				) => {
					return createUnaryCallbackForwardingMethod(methodName, (clientId, request) => {
						const webviewMessage = requestToWebviewMessage(request)
						if (webviewMessage) {
							return callbacks.handleGenericMessage(clientId, webviewMessage)
						} else {
							Logger.warn(
								`[gRPC-Warn: Server:${methodName}] Could not map request to WebviewMessage for generic handler.`,
							)
							return Promise.reject(new Error("Invalid request mapping"))
						}
					})
				}

				// --- Assign TaskControlService methods ---

				// Methods using specific callbacks
				taskControlServiceImpl.submitAskResponse = createUnaryCallbackForwardingMethod(
					"submitAskResponse",
					(clientId, request) => {
						let askResponse: "yesButtonClicked" | "noButtonClicked" | "messageResponse"
						switch (request.ask_response_type) {
							case "YES_BUTTON_CLICKED":
							case 1:
								askResponse = "yesButtonClicked"
								break
							case "NO_BUTTON_CLICKED":
							case 2:
								askResponse = "noButtonClicked"
								break
							default:
								askResponse = "messageResponse"
								break
						}
						const webviewMsg: WebviewMessage = {
							type: "askResponse",
							askResponse,
							text: request.text || undefined,
							images: request.images || undefined,
						}
						// Assuming handleAskResponse can identify the target task via clientId if needed
						return callbacks.handleAskResponse(clientId, webviewMsg)
					},
				)
				taskControlServiceImpl.sendUserInput = createUnaryCallbackForwardingMethod(
					"sendUserInput",
					// Assuming handleUserInput can identify the target task via clientId if needed
					(clientId, request) =>
						callbacks.handleUserInput(clientId, request.text || undefined, request.images || undefined),
				)
				// TODO: submitToolResult likely needs to be client-streaming or bi-di, not unary.
				// Placeholder using specific callback:
				// TODO: submitToolResult likely needs to be client-streaming or bi-di, not unary.
				// Placeholder using specific callback:
				taskControlServiceImpl.submitToolResult = createUnaryCallbackForwardingMethod(
					"submitToolResult",
					(clientId, request) => callbacks.handleToolResult(clientId, request.result as Partial<ProtoToolResultBlock>), // Cast request.result
				)
				taskControlServiceImpl.clearTask = createUnaryCallbackForwardingMethod(
					"clearTask",
					(clientId, request) => callbacks.handleClearTask(clientId), // Pass clientId
				)
				taskControlServiceImpl.cancelTask = createUnaryCallbackForwardingMethod(
					"cancelTask",
					(clientId, request) => callbacks.handleCancelTask(clientId), // Pass clientId
				)
				taskControlServiceImpl.deleteTaskWithId = createUnaryCallbackForwardingMethod(
					"deleteTaskWithId",
					(clientId, request) => callbacks.handleDeleteTaskWithId(clientId, request.task_id), // Pass clientId and taskId
				)
				taskControlServiceImpl.applyBrowserSettings = createUnaryCallbackForwardingMethod(
					"applyBrowserSettings",
					(clientId, request) => callbacks.handleApplyBrowserSettings(clientId, request.settings), // Pass clientId and settings
				)
				taskControlServiceImpl.openFile = createUnaryCallbackForwardingMethod(
					"openFile",
					(clientId, request) => callbacks.handleOpenFile(clientId, request.file_path), // Pass clientId and filePath
				)

				// Methods mapping to generic WebviewMessage handler
				taskControlServiceImpl.submitOptionsResponse = createGenericHandlerForwardingMethod(
					"submitOptionsResponse",
					(request) => ({ type: "optionsResponse", text: request.selected_option || undefined }),
				)
				taskControlServiceImpl.getLatestState = createGenericHandlerForwardingMethod("getLatestState", () => ({
					type: "getLatestState",
				})) // Still needs refactor in controller likely
				taskControlServiceImpl.resetState = createGenericHandlerForwardingMethod("resetState", () => ({
					type: "resetState",
				}))
				taskControlServiceImpl.showTaskWithId = createGenericHandlerForwardingMethod("showTaskWithId", (request) => ({
					type: "showTaskWithId",
					text: request.task_id || undefined,
				}))
				taskControlServiceImpl.exportCurrentTask = createGenericHandlerForwardingMethod("exportCurrentTask", () => ({
					type: "exportCurrentTask",
				}))
				taskControlServiceImpl.exportTaskWithId = createGenericHandlerForwardingMethod("exportTaskWithId", (request) => ({
					type: "exportTaskWithId",
					text: request.task_id || undefined,
				}))
				taskControlServiceImpl.clearAllTaskHistory = createGenericHandlerForwardingMethod("clearAllTaskHistory", () => ({
					type: "clearAllTaskHistory",
				}))
				taskControlServiceImpl.requestTotalTasksSize = createGenericHandlerForwardingMethod(
					"requestTotalTasksSize",
					() => ({ type: "requestTotalTasksSize" }),
				)
				taskControlServiceImpl.applyApiConfiguration = createGenericHandlerForwardingMethod(
					"applyApiConfiguration",
					(request) => ({ type: "apiConfiguration", apiConfiguration: request }),
				) // Assumes proto matches
				taskControlServiceImpl.applyAutoApprovalSettings = createGenericHandlerForwardingMethod(
					"applyAutoApprovalSettings",
					(request) => ({ type: "autoApprovalSettings", autoApprovalSettings: request.settings }),
				) // Assumes proto matches
				// applyBrowserSettings moved to specific callback
				taskControlServiceImpl.applyChatSettings = createGenericHandlerForwardingMethod(
					"applyChatSettings",
					(request) => ({ type: "togglePlanActMode", chatSettings: request }),
				) // Assumes proto matches
				taskControlServiceImpl.applyTelemetrySetting = createGenericHandlerForwardingMethod(
					"applyTelemetrySetting",
					(request) => ({ type: "telemetrySetting", telemetrySetting: request.setting }),
				) // Assumes proto matches
				taskControlServiceImpl.updateSettings = createGenericHandlerForwardingMethod("updateSettings", (request) => ({
					type: "updateSettings",
					apiConfiguration: request.api_configuration,
					customInstructionsSetting: request.custom_instructions_setting,
					telemetrySetting: request.telemetry_setting,
					planActSeparateModelsSetting: request.plan_act_separate_models_setting,
				})) // Assumes proto matches
				taskControlServiceImpl.togglePlanActMode = createGenericHandlerForwardingMethod(
					"togglePlanActMode",
					(request) => ({ type: "togglePlanActMode", chatSettings: request.chat_settings || { mode: "act" } }),
				) // Assumes proto matches
				// ... map remaining relevant unary methods similarly using callbacks.handleGenericMessage ...

				// Register the service
				const taskControlServiceDefinition = protoDescriptor.cline.task_control.TaskControlService.service
				if (!taskControlServiceDefinition) {
					throw new Error("TaskControlService definition not found or invalid.")
				}
				server.addService(taskControlServiceDefinition, taskControlServiceImpl)
				Logger.info("[External GRPC] Successfully registered TaskControlService.")
			} catch (taskControlError: any) {
				Logger.error(`[External GRPC] FAILED TO REGISTER TaskControlService: ${taskControlError.message}`)
				throw taskControlError // Re-throw to be caught by outer try-catch
			}
		} else {
			Logger.warn("[External GRPC] TaskControlService definition structure not found.")
		}

		// --- Server Binding ---
		Logger.info("[External GRPC] Finished service registration.")
		server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err: Error | null, boundPort: number) => {
			Logger.info("[External GRPC] bindAsync callback executed.")
			if (err) {
				Logger.error(`[External GRPC] Server FAILED to bind on port ${port}. Message: ${err.message}`)
				server = null
				grpcNotifier = null // Nullify notifier on bind error
				return
			}
			Logger.info(`[External GRPC] Server bound successfully to port ${boundPort}. Attempting to start server...`)
			try {
				server?.start()
				Logger.info(`[External GRPC] Server started successfully after binding, listening on 0.0.0.0:${boundPort}`)
			} catch (startErr: any) {
				Logger.error(`[External GRPC] Server FAILED to start after binding: ${startErr.message}`)
				server = null
				grpcNotifier = null // Nullify notifier on start error
			}
		})
		Logger.info("[External GRPC] bindAsync initiated. Waiting for callback...")

		return grpcNotifier // Return the created notifier
	} catch (setupError: any) {
		Logger.error(`[External GRPC] CRITICAL SETUP ERROR in startExternalGrpcServer: ${setupError.message}`)
		server = null
		grpcNotifier = null // Nullify notifier on setup error
		return null // Return null on error
	}
}

/**
 * Stops the external gRPC server if it's running.
 */
export function stopExternalGrpcServer(): void {
	// Keep implementation as before
	if (server) {
		Logger.info("[External GRPC] Stopping server...")
		server.tryShutdown((error) => {
			if (error) {
				Logger.error(`[External GRPC] Server shutdown error: ${error.message}`)
			} else {
				Logger.info("[External GRPC] Server stopped successfully.")
			}
			server = null
			grpcNotifier = null // Clear notifier on shutdown
			activeStreams.clear() // Clear active streams
		})
	} else {
		Logger.info("[External GRPC] Server is not running.")
	}
}

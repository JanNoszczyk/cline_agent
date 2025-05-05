// Removed duplicate import block
import * as vscode from "vscode"
import { Controller } from "../../core/controller" // Assuming Controller is exported
import { Task } from "../../core/task" // Assuming Task is exported
import { WebviewMessage } from "../../shared/WebviewMessage" // Import WebviewMessage
import {
	startExternalGrpcServer,
	stopExternalGrpcServer,
	GrpcNotifier, // Corrected import: GrpcTaskNotifier -> GrpcNotifier
} from "./server" // Import from the actual server file
import {
	ProtoExtensionState, // This is the correct one
	mapExtensionStateToProto,
	mapClineMessageToProto,
	mapToolUseBlockToProto,
	mapToolResultBlockToProto,
	ProtoToolResultBlock, // Import the missing type
	ProtoToolUseBlock, // Import for mapping
	mapBrowserSettingsToProto as mapInternalBrowserSettingsToProto, // Renamed for clarity
} from "./mapper" // Import state type and mapping functions
import { ClineAskResponse } from "../../shared/WebviewMessage" // Import ClineAskResponse
// Import Proto types directly
import * as taskControlPb from "../../shared/proto/task_control" // Namespace import
import * as browserPb from "../../shared/proto/browser" // Import browser proto messages
import * as commonPb from "../../shared/proto/common" // Import common proto messages
import * as checkpointsPb from "../../shared/proto/checkpoints" // Import checkpoints proto messages
import * as mcpPb from "../../shared/proto/mcp" // Import MCP proto messages
import { ExtensionMessage, ClineMessage, ClineSay, ClineAsk } from "../../shared/ExtensionMessage" // Import ExtensionMessage for type checking
import { ToolResponse } from "../../core/task" // Import internal tool types from index
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
import { checkpointRestore as handleCheckpointRestore } from "../../core/controller/checkpoints/checkpointRestore" // Import checkpointRestore
import * as grpc from "@grpc/grpc-js" // Import grpc for types
import { ToolUse } from "@core/assistant-message" // Required for askPayload.toolUse

// Define the expected signature for the postMessage function, now including taskId
type PostMessageFunc = (message: ExtensionMessage, taskId?: string) => Promise<void>

// Define the callbacks interface locally
interface GrpcServerCallbacks {
	initTask(clientId: string, text?: string, images?: string[]): Promise<Task | undefined> // Updated return type
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
}

/**
 * Bridges the external gRPC server with the internal Cline Controller and Task logic.
 */
export class GrpcBridge implements GrpcServerCallbacks, vscode.Disposable {
	private context: vscode.ExtensionContext
	private controller: Controller | undefined
	private webviewProvider: any | undefined // WebviewProvider reference
	private grpcNotifier: GrpcNotifier | null = null
	private clientTaskMap = new Map<string, Task>()
	private readonly sentMessagesTracker = new Map<string, Set<string>>()
	private grpcCleanMessageAggregator: Map<
		string, // clientId
		Map<
			string, // taskId
			Map<
				number, // messageTimestamp (original ClineMessage.ts)
				{
					firstChunkPayload: ClineMessage // Store the first chunk (contains all metadata)
					cleanAccumulatedText: string // Stores de-duplicated text
				}
			>
		>
	> = new Map()
	private lastToolAskIdForTask = new Map<string, string>()
	private disposables: vscode.Disposable[] = []
	private originalPostMessage?: PostMessageFunc

	constructor(context: vscode.ExtensionContext) {
		Logger.debug("[GrpcBridge] GrpcBridge constructor called.")
		this.context = context
		Logger.info("[GrpcBridge] Initializing...")
	}

	public setController(controller: Controller, webviewProvider?: any): void {
		this.controller = controller
		this.webviewProvider = webviewProvider
		Logger.info("[GrpcBridge] Controller instance registered.")

		if (typeof controller.postMessageToWebview === "function") {
			this.originalPostMessage = controller.postMessageToWebview.bind(controller)
			const wrappedPostMessage = this.getWrappedPostMessage(this.originalPostMessage)
			controller.postMessageToWebview = wrappedPostMessage
			Logger.info("[GrpcBridge] Controller.postMessageToWebview has been wrapped.")
		} else {
			Logger.error("[GrpcBridge] Controller.postMessageToWebview is not a function. Wrapping failed.")
		}

		const serviceImplementations = {
			taskControl: this.createTaskControlImplementation(),
			browser: this.createBrowserImplementation(),
			checkpoints: this.createCheckpointsImplementation(),
			mcp: this.createMcpImplementation(),
			file: this.createFileImplementation(), // Added
			task: this.createTaskImplementation(), // Added
			webContent: this.createWebContentImplementation(), // Added
			account: this.createAccountImplementation(), // Added
		}

		Logger.debug("[GrpcBridge] Attempting to start gRPC server in GrpcBridge...")
		startExternalGrpcServer(this.context, this.controller, serviceImplementations)
			.then(({ server, notifier }) => {
				this.grpcNotifier = notifier
				Logger.info("[GrpcBridge] gRPC server started successfully.")
			})
			.catch((error) => {
				Logger.error("[GrpcBridge] Failed to start gRPC server:", error)
				vscode.window.showErrorMessage(`Failed to start Cline gRPC Bridge server: ${error.message}`)
				this.grpcNotifier = null
			})
	}

	private createTaskControlImplementation(): grpc.UntypedServiceImplementation {
		return {
			startTask: (call: grpc.ServerWritableStream<taskControlPb.NewTaskRequest, taskControlPb.ExtensionMessage>) => {
				Logger.debug("[GrpcBridge:startTask] Method invoked.")
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				Logger.debug(`[GrpcBridge:startTask] Client ID from metadata: ${clientId}`)
				if (!clientId) {
					Logger.error("[GrpcBridge:startTask] Client ID missing in metadata")
					call.emit("error", { code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
					if (!call.writableEnded) {
						call.end()
					}
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

						const newChatMessageListener = (cId: string, tId: string, msg: taskControlPb.ClineMessage) => {
							if (cId === clientId && tId === currentTaskId && !call.writableEnded) {
								Logger.info(
									`[GrpcBridge:startTask:newChatMessageListener] Writing newChatMessage (ts: ${msg.ts}) to gRPC stream for client ${clientId}, task ${currentTaskId}.`,
								)
								call.write({
									type: taskControlPb.ExtensionMessageType.EXTENSION_MESSAGE_TYPE_UNSPECIFIED, // Ensure this is the correct enum for a wrapper
									newChatMessage: msg,
								})
							}
						}
						const errorListener = (cId: string, errorMsg: string) => {
							if (cId === clientId && !call.writableEnded) {
								Logger.warn(
									`[GrpcBridge:startTask:errorListener] Writing ERROR to gRPC stream for client ${clientId}, task ${currentTaskId}: ${errorMsg}`,
								)
								call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: errorMsg })
							}
						}

						this.grpcNotifier?.on("newChatMessage", newChatMessageListener)
						this.grpcNotifier?.on("error", errorListener)

						const cleanupListeners = () => {
							this.grpcNotifier?.off("newChatMessage", newChatMessageListener)
							this.grpcNotifier?.off("error", errorListener)
						}

						taskInstance.onDispose(() => {
							Logger.info(
								`[GrpcBridge:startTask] Task ${currentTaskId} disposed. Ending stream for client ${clientId}.`,
							)
							cleanupListeners()
							if (!call.writableEnded) {
								call.end()
							}
						})
						call.on("cancelled", () => {
							Logger.info(
								`[GrpcBridge:startTask] Stream for task ${currentTaskId} cancelled by client ${clientId}.`,
							)
							cleanupListeners()
							if (!taskInstance.isDisposed) {
								taskInstance.abortTask().catch(Logger.error)
							}
							if (!call.writableEnded) {
								call.end()
							}
						})
						call.on("error", (err: grpc.ServiceError) => {
							Logger.error(
								`[GrpcBridge:startTask] Stream error for task ${currentTaskId} on client ${clientId}:`,
								err,
							)
							cleanupListeners()
							if (!taskInstance.isDisposed) {
								taskInstance.abortTask().catch(Logger.error)
							}
							if (!call.writableEnded) {
								call.end()
							}
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
			resumeLatestTask: (call: grpc.ServerWritableStream<commonPb.EmptyRequest, taskControlPb.ExtensionMessage>) => {
				Logger.debug("[GrpcBridge:resumeLatestTask] Method invoked.")
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				Logger.debug(`[GrpcBridge:resumeLatestTask] Client ID from metadata: ${clientId}`)

				if (!clientId) {
					Logger.error("[GrpcBridge:resumeLatestTask] Client ID missing in metadata")
					call.emit("error", { code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" })
					if (!call.writableEnded) {
						call.end()
					}
					return
				}

				if (!this.controller) {
					Logger.error("[GrpcBridge:resumeLatestTask] Controller not available.")
					if (!call.writableEnded) {
						call.write({
							type: taskControlPb.ExtensionMessageType.ERROR,
							errorMessage: "Controller not available to resume task.",
						})
						call.end()
					}
					return
				}

				Logger.info(`[GrpcBridge:resumeLatestTask] Received for client ${clientId}.`)
				;(async () => {
					try {
						// Ensure the webview is visible before resuming the task
						Logger.info(`[GrpcBridge:resumeLatestTask] Attempting to focus sidebar for client ${clientId}`)
						try {
							// First, try to reveal the sidebar view
							await vscode.commands.executeCommand("workbench.view.extension.claude-dev-ActivityBar")
							Logger.info(`[GrpcBridge:resumeLatestTask] Revealed extension sidebar`)

							// Then focus the specific provider
							await vscode.commands.executeCommand("claude-dev.SidebarProvider.focus")
							Logger.info(`[GrpcBridge:resumeLatestTask] Successfully focused sidebar`)

							// In headless environments, we may need to force the webview to resolve
							// Check if the webview provider has a webview instance
							const webviewProvider = this.webviewProvider
							if (webviewProvider && !webviewProvider.view) {
								Logger.info(
									`[GrpcBridge:resumeLatestTask] Webview not yet resolved, waiting for initialization...`,
								)
								// Give the webview more time to initialize after focus
								await new Promise((resolve) => setTimeout(resolve, 1000))

								// If still not resolved, log a warning
								if (!webviewProvider.view) {
									Logger.warn(
										`[GrpcBridge:resumeLatestTask] Webview still not resolved after waiting. This may cause display issues.`,
									)
								}
							} else if (webviewProvider && webviewProvider.view) {
								Logger.info(`[GrpcBridge:resumeLatestTask] Webview is already resolved and ready`)
								// Force a state update to ensure the webview content is rendered
								try {
									Logger.info(`[GrpcBridge:resumeLatestTask] Forcing state update to webview...`)
									await this.controller?.postStateToWebview()
									Logger.info(`[GrpcBridge:resumeLatestTask] State update to webview completed`)
								} catch (e) {
									Logger.error(`[GrpcBridge:resumeLatestTask] Error updating webview state: ${e}`)
								}
							}
						} catch (focusError) {
							Logger.warn(`[GrpcBridge:resumeLatestTask] Failed to focus sidebar: ${focusError}`)
						}
						// Add a small delay to ensure the webview is fully initialized
						await new Promise((resolve) => setTimeout(resolve, 200))

						await this.controller!.resumeLatestTaskFromHistory() // Call the controller method

						const taskInstance = this.controller!.task // Get the resumed task instance from the controller
						if (!taskInstance || !taskInstance.taskId) {
							Logger.error(
								`[GrpcBridge:resumeLatestTask] Failed to resume or get task ID for client ${clientId}. Sending ERROR.`,
							)
							if (!call.writableEnded) {
								call.write({
									type: taskControlPb.ExtensionMessageType.ERROR,
									errorMessage: "Failed to resume task internally.",
								})
								call.end()
							}
							return
						}

						// Map the resumed task to the client ID
						this.clientTaskMap.set(clientId, taskInstance)
						Logger.info(
							`[GrpcBridge:resumeLatestTask] Task ${taskInstance.taskId} (resumed) mapped to client ${clientId}`,
						)
						if (!this.sentMessagesTracker.has(taskInstance.taskId)) {
							this.sentMessagesTracker.set(taskInstance.taskId, new Set<string>())
							Logger.info(
								`[GrpcBridge:resumeLatestTask] Initialized sentMessagesTracker for resumed task ${taskInstance.taskId}`,
							)
						}

						// Ensure the webview receives the current state after resuming
						Logger.info(
							`[GrpcBridge:resumeLatestTask] Posting current state to webview for resumed task ${taskInstance.taskId}`,
						)
						await this.controller!.postStateToWebview(taskInstance.taskId)

						const currentTaskId = taskInstance.taskId
						const extensionVersion = this.context.extension.packageJSON.version || "unknown"
						Logger.info(
							`[GrpcBridge:resumeLatestTask] Resumed task ${currentTaskId} for client ${clientId}. Sending TASK_STARTED.`,
						)
						if (!call.writableEnded) {
							call.write({
								type: taskControlPb.ExtensionMessageType.TASK_STARTED,
								taskStarted: { taskId: currentTaskId, version: extensionVersion },
							})
						}

						const newChatMessageListener = (cId: string, tId: string, msg: taskControlPb.ClineMessage) => {
							if (cId === clientId && tId === currentTaskId && !call.writableEnded) {
								Logger.info(
									`[GrpcBridge:resumeLatestTask:newChatMessageListener] Writing newChatMessage (ts: ${msg.ts}) to gRPC stream for client ${clientId}, task ${currentTaskId}.`,
								)
								call.write({
									type: taskControlPb.ExtensionMessageType.EXTENSION_MESSAGE_TYPE_UNSPECIFIED,
									newChatMessage: msg,
								})
							}
						}
						const errorListener = (cId: string, errorMsg: string) => {
							if (cId === clientId && !call.writableEnded) {
								Logger.warn(
									`[GrpcBridge:resumeLatestTask:errorListener] Writing ERROR to gRPC stream for client ${clientId}, task ${currentTaskId}: ${errorMsg}`,
								)
								call.write({ type: taskControlPb.ExtensionMessageType.ERROR, errorMessage: errorMsg })
							}
						}

						this.grpcNotifier?.on("newChatMessage", newChatMessageListener)
						this.grpcNotifier?.on("error", errorListener)

						const cleanupListeners = () => {
							this.grpcNotifier?.off("newChatMessage", newChatMessageListener)
							this.grpcNotifier?.off("error", errorListener)
						}

						taskInstance.onDispose(() => {
							Logger.info(
								`[GrpcBridge:resumeLatestTask] Resumed task ${currentTaskId} disposed. Ending stream for client ${clientId}.`,
							)
							cleanupListeners()
							if (this.clientTaskMap.delete(clientId)) {
								Logger.info(
									`[GrpcBridge:resumeLatestTask:onDispose] Removed task mapping for client ${clientId} (task ${currentTaskId}).`,
								)
							}
							if (this.sentMessagesTracker.delete(currentTaskId)) {
								Logger.info(
									`[GrpcBridge:resumeLatestTask:onDispose] Cleaned up sentMessagesTracker for task ${currentTaskId}.`,
								)
							}
							this.clearBuffersForTask(clientId, currentTaskId)
							if (!call.writableEnded) {
								call.end()
							}
						})
						call.on("cancelled", () => {
							Logger.info(
								`[GrpcBridge:resumeLatestTask] Stream for resumed task ${currentTaskId} cancelled by client ${clientId}.`,
							)
							cleanupListeners()
							if (!taskInstance.isDisposed) {
								taskInstance.abortTask().catch(Logger.error)
							}
							if (!call.writableEnded) {
								call.end()
							}
						})
						call.on("error", (err: grpc.ServiceError) => {
							Logger.error(
								`[GrpcBridge:resumeLatestTask] Stream error for resumed task ${currentTaskId} on client ${clientId}:`,
								err,
							)
							cleanupListeners()
							if (!taskInstance.isDisposed) {
								taskInstance.abortTask().catch(Logger.error)
							}
							if (!call.writableEnded) {
								call.end()
							}
						})
					} catch (error: any) {
						Logger.error(
							`[GrpcBridge:resumeLatestTask] Outer error for client ${clientId}: ${error.message} ${error.stack}`,
						)
						if (!call.writableEnded) {
							call.write({
								type: taskControlPb.ExtensionMessageType.ERROR,
								errorMessage: `Task resumption failed: ${error.message}`,
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
						if (!call.writableEnded) {
							call.end()
						} // End stream after processing
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
				Logger.debug("[GrpcBridge:submitAskResponse] Method invoked.")
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				Logger.debug(`[GrpcBridge:submitAskResponse] Client ID from metadata: ${clientId}`)
				if (!clientId) {
					Logger.error("[GrpcBridge:submitAskResponse] Client ID missing")
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
						const task = this.clientTaskMap.get(clientId)
						if (task) {
							const askResponseValue: ClineAskResponse =
								request.askResponseType === taskControlPb.AskResponseType.MESSAGE_RESPONSE
									? "messageResponse"
									: request.askResponseType === taskControlPb.AskResponseType.YES_BUTTON_CLICKED
										? "yesButtonClicked"
										: "noButtonClicked"
							const responseText = request.text
							Logger.info(
								`[GrpcBridge:submitAskResponse] Forwarding to task ${task.taskId}. Response: ${askResponseValue}, Text: ${responseText}`,
							)
							task.handleWebviewAskResponse(askResponseValue, responseText, undefined) // Assuming images are not part of this gRPC call
							Logger.info(`[GrpcBridge:submitAskResponse] Processed for client ${clientId}.`)
						} else {
							Logger.warn(
								`[GrpcBridge:submitAskResponse] Client '${clientId}' attempted action but has no active task mapped. Cline may be user-controlled or this is an inactive/invalid gRPC session.`,
							)
							throw new Error(
								"Task not found for client. Cline may be user-controlled or gRPC session is inactive.",
							)
						}

						if (!call.writableEnded) {
							const ackClineMsg = taskControlPb.ClineMessage.create()
							ackClineMsg.type = taskControlPb.ClineMessage_Type.SAY
							ackClineMsg.actualSayType = taskControlPb.ClineSayType.SAY_TEXT
							ackClineMsg.text = "ACK_SUBMIT_ASK_RESPONSE"
							ackClineMsg.ts = Date.now()
							const ackExtMsg = taskControlPb.ExtensionMessage.create()
							ackExtMsg.newChatMessage = ackClineMsg // Use new_chat_message for individual messages
							call.write(ackExtMsg)
							// Add a small delay before ending to see if it helps client-side context cancellation
							setTimeout(() => {
								if (!call.writableEnded) {
									call.end()
								}
							}, 100) // 100ms delay
						}
					} catch (error: any) {
						Logger.error(
							`[GrpcBridge:submitAskResponse] Outer error for client ${clientId}: ${error.message} ${error.stack}`,
						)
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
					const task = this.clientTaskMap.get(clientId)
					if (task) {
						const askResponseValue: ClineAskResponse = "messageResponse"
						const responseText = call.request.selectedOption
						Logger.info(
							`[GrpcBridge:submitOptionsResponse] Forwarding to task ${task.taskId}. Response: ${askResponseValue}, Text: ${responseText}`,
						)
						task.handleWebviewAskResponse(askResponseValue, responseText, undefined)
						Logger.info(`[GrpcBridge:submitOptionsResponse] Processed for client ${clientId}. Ending stream.`)
					} else {
						Logger.warn(
							`[GrpcBridge:submitOptionsResponse] Client '${clientId}' attempted action but has no active task mapped. Cline may be user-controlled or this is an inactive/invalid gRPC session.`,
						)
						throw new Error("Task not found for client. Cline may be user-controlled or gRPC session is inactive.")
					}
					if (!call.writableEnded) {
						call.end()
					}
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
					if (!call.writableEnded) {
						call.end()
					}
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
					if (!call.writableEnded) {
						call.end()
					}
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
					await this.handleDeleteTaskWithId(clientId, call.request.taskId)
					Logger.info(`[GrpcBridge:deleteTaskWithId] Processed for client ${clientId}. Ending stream.`)
					if (!call.writableEnded) {
						call.end()
					}
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
					await this.handleApplyBrowserSettings(clientId, call.request.settings)
					Logger.info(`[GrpcBridge:applyBrowserSettings] Processed for client ${clientId}. Ending stream.`)
					if (!call.writableEnded) {
						call.end()
					}
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
					await this.handleOpenFile(clientId, call.request.filePath)
					Logger.info(`[GrpcBridge:openFile] Processed for client ${clientId}. Ending stream.`)
					if (!call.writableEnded) {
						call.end()
					}
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
					if (!call.writableEnded) {
						call.end()
					}
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
					return callback(null, { is_connected: false, is_remote: false })
				}
				try {
					const connectionInfo = task.browserSession.getConnectionInfo()
					callback(null, connectionInfo)
				} catch (error: any) {
					Logger.error(`[GrpcBridge:getBrowserConnectionInfo] Error: ${error.message}`)
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
					await this.controller?.postStateToWebview()
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
			checkpointDiff: async (
				call: grpc.ServerUnaryCall<commonPb.Int64Request, commonPb.Empty>,
				callback: grpc.sendUnaryData<commonPb.Empty>,
			) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					return callback({
						code: grpc.status.UNAUTHENTICATED,
						details: "Client ID missing",
					} as grpc.ServiceError)
				}
				const task = this.clientTaskMap.get(clientId)
				if (!task) {
					return callback({
						code: grpc.status.FAILED_PRECONDITION,
						details: "No active task for this client",
					} as grpc.ServiceError)
				}
				try {
					const messageTs = call.request.value
					if (messageTs === undefined || messageTs === null) {
						return callback({
							code: grpc.status.INVALID_ARGUMENT,
							details: "Invalid message timestamp provided (undefined or null)",
						} as grpc.ServiceError)
					}
					// The method presentMultifileDiff expects a number.
					// Int64Request.value is a string | number in protobuf.js, ensure it's a number.
					const tsNumber = typeof messageTs === "string" ? parseInt(messageTs, 10) : messageTs
					if (isNaN(tsNumber)) {
						return callback({
							code: grpc.status.INVALID_ARGUMENT,
							details: "Invalid message timestamp provided (not a number)",
						} as grpc.ServiceError)
					}

					await task.presentMultifileDiff(tsNumber, false) // false for not readOnly
					callback(null, commonPb.Empty.create())
				} catch (error: any) {
					Logger.error(`[GrpcBridge:checkpointDiff] Error: ${error.message}`)
					callback({ code: grpc.status.INTERNAL, details: error.message } as grpc.ServiceError)
				}
			},
			checkpointRestore: async (
				call: grpc.ServerUnaryCall<checkpointsPb.CheckpointRestoreRequest, commonPb.Empty>,
				callback: grpc.sendUnaryData<commonPb.Empty>,
			) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					return callback({
						code: grpc.status.UNAUTHENTICATED,
						details: "Client ID missing",
					} as grpc.ServiceError)
				}
				const task = this.clientTaskMap.get(clientId)
				if (!task || !this.controller) {
					return callback({
						code: grpc.status.FAILED_PRECONDITION,
						details: "No active task or controller for this client",
					} as grpc.ServiceError)
				}
				try {
					const request = call.request
					const checkpointNumber = typeof request.number === "string" ? parseInt(request.number, 10) : request.number
					const offset = typeof request.offset === "string" ? parseInt(request.offset, 10) : request.offset

					if (isNaN(checkpointNumber)) {
						return callback({
							code: grpc.status.INVALID_ARGUMENT,
							details: "Invalid checkpoint number",
						} as grpc.ServiceError)
					}
					if (request.offset !== undefined && request.offset !== null && isNaN(offset as number)) {
						return callback({
							code: grpc.status.INVALID_ARGUMENT,
							details: "Invalid offset number",
						} as grpc.ServiceError)
					}

					await handleCheckpointRestore(this.controller, {
						metadata: request.metadata, // Pass along metadata if needed by the handler
						number: checkpointNumber,
						restoreType: request.restoreType,
						offset: offset,
					} as checkpointsPb.CheckpointRestoreRequest)
					callback(null, commonPb.Empty.create())
				} catch (error: any) {
					Logger.error(`[GrpcBridge:checkpointRestore] Error: ${error.message}`)
					callback({ code: grpc.status.INTERNAL, details: error.message } as grpc.ServiceError)
				}
			},
			// GetCheckpoints and CompareCheckpoints remain not implemented as per previous state
			GetCheckpoints: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:GetCheckpoints] Not implemented.")
				callback({ code: grpc.status.UNIMPLEMENTED, details: "GetCheckpoints not implemented" })
			},
			CompareCheckpoints: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
				Logger.warn("[GrpcBridge:CompareCheckpoints] Not implemented.")
				callback({ code: grpc.status.UNIMPLEMENTED, details: "CompareCheckpoints not implemented" })
			},
		}
	}
	private createMcpImplementation(): grpc.UntypedServiceImplementation {
		return {
			toggleMcpServer: async (
				call: grpc.ServerUnaryCall<mcpPb.ToggleMcpServerRequest, mcpPb.McpServers>,
				callback: grpc.sendUnaryData<mcpPb.McpServers>,
			) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" } as grpc.ServiceError)
				}
				if (!this.controller || !this.controller.mcpHub) {
					return callback({
						code: grpc.status.FAILED_PRECONDITION,
						details: "MCPHub not available",
					} as grpc.ServiceError)
				}
				try {
					const { serverName, disabled } = call.request
					Logger.info(
						`[GrpcBridge:toggleMcpServer] Request for client ${clientId}: serverName='${serverName}', disabled=${disabled}`,
					)

					if (typeof serverName !== "string" || typeof disabled !== "boolean") {
						return callback({
							code: grpc.status.INVALID_ARGUMENT,
							details: "Invalid request parameters for toggleMcpServer",
						} as grpc.ServiceError)
					}

					// The context7 specific logic seems to be handled inside toggleServerDisabledRPC now,
					// so we can directly call it.
					const updatedServers = await this.controller.mcpHub.toggleServerDisabledRPC(serverName, disabled)
					const protoMcpServers = mapMcpServersToProto(updatedServers)
					if (!protoMcpServers) {
						throw new Error("Failed to map McpServers to proto")
					}
					callback(null, protoMcpServers as mcpPb.McpServers)
				} catch (error: any) {
					Logger.error(`[GrpcBridge:toggleMcpServer] Error: ${error.message} ${error.stack}`)
					callback({ code: grpc.status.INTERNAL, details: error.message } as grpc.ServiceError)
				}
			},
			updateMcpTimeout: async (
				call: grpc.ServerUnaryCall<mcpPb.UpdateMcpTimeoutRequest, mcpPb.McpServers>,
				callback: grpc.sendUnaryData<mcpPb.McpServers>,
			) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" } as grpc.ServiceError)
				}
				if (!this.controller || !this.controller.mcpHub) {
					return callback({
						code: grpc.status.FAILED_PRECONDITION,
						details: "MCPHub not available",
					} as grpc.ServiceError)
				}
				try {
					const { serverName, timeout } = call.request
					Logger.info(
						`[GrpcBridge:updateMcpTimeout] Request for client ${clientId}: serverName='${serverName}', timeout=${timeout}`,
					)

					if (typeof serverName !== "string" || typeof timeout !== "number") {
						return callback({
							code: grpc.status.INVALID_ARGUMENT,
							details: "Invalid request parameters for updateMcpTimeout",
						} as grpc.ServiceError)
					}

					const updatedServers = await this.controller.mcpHub.updateServerTimeoutRPC(serverName, timeout)
					const protoMcpServers = mapMcpServersToProto(updatedServers)
					if (!protoMcpServers) {
						throw new Error("Failed to map McpServers to proto")
					}
					callback(null, protoMcpServers as mcpPb.McpServers)
				} catch (error: any) {
					Logger.error(`[GrpcBridge:updateMcpTimeout] Error: ${error.message} ${error.stack}`)
					callback({ code: grpc.status.INTERNAL, details: error.message } as grpc.ServiceError)
				}
			},
			addRemoteMcpServer: async (
				call: grpc.ServerUnaryCall<mcpPb.AddRemoteMcpServerRequest, mcpPb.McpServers>,
				callback: grpc.sendUnaryData<mcpPb.McpServers>,
			) => {
				const clientId = call.metadata.get("client-id")?.[0]?.toString()
				if (!clientId) {
					return callback({ code: grpc.status.UNAUTHENTICATED, details: "Client ID missing" } as grpc.ServiceError)
				}
				if (!this.controller || !this.controller.mcpHub) {
					return callback({
						code: grpc.status.FAILED_PRECONDITION,
						details: "MCPHub not available",
					} as grpc.ServiceError)
				}
				try {
					const { serverName, serverUrl } = call.request
					Logger.info(
						`[GrpcBridge:addRemoteMcpServer] Request for client ${clientId}: serverName='${serverName}', serverUrl='${serverUrl}'`,
					)

					if (typeof serverName !== "string" || typeof serverUrl !== "string") {
						return callback({
							code: grpc.status.INVALID_ARGUMENT,
							details: "Invalid request parameters for addRemoteMcpServer",
						} as grpc.ServiceError)
					}

					const updatedServers = await this.controller.mcpHub.addRemoteServer(serverName, serverUrl)
					const protoMcpServers = mapMcpServersToProto(updatedServers)
					if (!protoMcpServers) {
						throw new Error("Failed to map McpServers to proto")
					}
					callback(null, protoMcpServers as mcpPb.McpServers)
				} catch (error: any) {
					Logger.error(`[GrpcBridge:addRemoteMcpServer] Error: ${error.message} ${error.stack}`)
					callback({ code: grpc.status.INTERNAL, details: error.message } as grpc.ServiceError)
				}
			},
		}
	}
	// Placeholder implementations for the new services
	private createFileImplementation(): grpc.UntypedServiceImplementation {
		Logger.warn("[GrpcBridge] createFileImplementation returning placeholder.")
		return {} // Replace with actual implementation
	}
	private createTaskImplementation(): grpc.UntypedServiceImplementation {
		Logger.warn("[GrpcBridge] createTaskImplementation returning placeholder.")
		return {} // Replace with actual implementation
	}
	private createWebContentImplementation(): grpc.UntypedServiceImplementation {
		Logger.warn("[GrpcBridge] createWebContentImplementation returning placeholder.")
		return {} // Replace with actual implementation
	}
	private createAccountImplementation(): grpc.UntypedServiceImplementation {
		Logger.warn("[GrpcBridge] createAccountImplementation returning placeholder.")
		return {} // Replace with actual implementation
	}

	async initTask(clientId: string, text?: string, images?: string[]): Promise<Task | undefined> {
		Logger.info(`[GrpcBridge:initTask] Callback invoked for client ${clientId}`)
		if (!this.controller) {
			Logger.error("[GrpcBridge:initTask] Controller not available.")
			return undefined
		}
		try {
			// Ensure the webview is visible before creating the task
			Logger.info(`[GrpcBridge:initTask] Attempting to focus sidebar for client ${clientId}`)
			try {
				// First, try to reveal the sidebar view
				await vscode.commands.executeCommand("workbench.view.extension.claude-dev-ActivityBar")
				Logger.info(`[GrpcBridge:initTask] Revealed extension sidebar`)

				// Then focus the specific provider
				await vscode.commands.executeCommand("claude-dev.SidebarProvider.focus")
				Logger.info(`[GrpcBridge:initTask] Successfully focused sidebar`)

				// In headless environments, we may need to force the webview to resolve
				// Check if the webview provider has a webview instance
				const webviewProvider = this.webviewProvider
				if (webviewProvider && !webviewProvider.view) {
					Logger.info(`[GrpcBridge:initTask] Webview not yet resolved, waiting for initialization...`)
					// Give the webview more time to initialize after focus
					await new Promise((resolve) => setTimeout(resolve, 1000))

					// If still not resolved, log a warning
					if (!webviewProvider.view) {
						Logger.warn(
							`[GrpcBridge:initTask] Webview still not resolved after waiting. This may cause display issues.`,
						)
					}
				} else if (webviewProvider && webviewProvider.view) {
					Logger.info(`[GrpcBridge:initTask] Webview is already resolved and ready`)
					// Force a state update to ensure the webview content is rendered
					try {
						Logger.info(`[GrpcBridge:initTask] Forcing state update to webview...`)
						await this.controller?.postStateToWebview()
						Logger.info(`[GrpcBridge:initTask] State update to webview completed`)
					} catch (e) {
						Logger.error(`[GrpcBridge:initTask] Error updating webview state: ${e}`)
					}
				}
			} catch (focusError) {
				Logger.warn(`[GrpcBridge:initTask] Failed to focus sidebar: ${focusError}`)
			}
			// Add a small delay to ensure the webview is fully initialized
			await new Promise((resolve) => setTimeout(resolve, 200))

			const taskInstance = await this.controller.initTask(text, images)
			if (taskInstance && taskInstance.taskId) {
				this.clientTaskMap.set(clientId, taskInstance)
				Logger.info(`[GrpcBridge:initTask] Task ${taskInstance.taskId} created and mapped to client ${clientId}`)
				if (!this.sentMessagesTracker.has(taskInstance.taskId)) {
					this.sentMessagesTracker.set(taskInstance.taskId, new Set<string>())
					Logger.info(`[GrpcBridge:initTask] Initialized sentMessagesTracker for task ${taskInstance.taskId}`)
				}

				// Ensure the webview receives the initial state
				// Add a delay to ensure the webview React app is ready
				Logger.info(`[GrpcBridge:initTask] Waiting for webview to be ready before posting state...`)
				await new Promise((resolve) => setTimeout(resolve, 1500))
				Logger.info(`[GrpcBridge:initTask] Posting initial state to webview for task ${taskInstance.taskId}`)
				await this.controller.postStateToWebview(taskInstance.taskId)
				taskInstance.onDispose(() => {
					Logger.info(
						`[GrpcBridge:initTask:onDispose] Task ${taskInstance.taskId} disposed for client ${clientId}. Cleaning up resources.`,
					)
					if (this.clientTaskMap.delete(clientId)) {
						Logger.info(
							`[GrpcBridge:initTask:onDispose] Removed task mapping for client ${clientId} (task ${taskInstance.taskId}).`,
						)
					} else {
						Logger.warn(
							`[GrpcBridge:initTask:onDispose] Attempted to remove task mapping for client ${clientId} on disposal, but it was not found in the map.`,
						)
					}
					if (this.sentMessagesTracker.delete(taskInstance.taskId!)) {
						Logger.info(
							`[GrpcBridge:initTask:onDispose] Cleaned up sentMessagesTracker for task ${taskInstance.taskId}.`,
						)
					}
					this.clearBuffersForTask(clientId, taskInstance.taskId!)
				})
				Logger.info(`[GrpcBridge:initTask] Task instance ${taskInstance.taskId} prepared for client ${clientId}.`)
				return taskInstance
			} else {
				Logger.error(
					`[GrpcBridge:initTask] Failed to get task instance or task ID after calling controller.initTask for client ${clientId}`,
				)
				return undefined
			}
		} catch (error: any) {
			Logger.error(
				`[GrpcBridge:initTask] Error during initTask execution for client ${clientId}: ${error?.message} \nStack: ${error?.stack}`,
				error,
			)
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
			const updates: Partial<ApiConfiguration> = {}
			const protoApiConfig = settings.apiConfiguration

			if (protoApiConfig) {
				let internalApiProvider: ApiProvider | undefined
				switch (protoApiConfig.apiProvider) {
					case taskControlPb.ApiProvider.ANTHROPIC:
						internalApiProvider = "anthropic"
						break
					case taskControlPb.ApiProvider.OPENROUTER:
						internalApiProvider = "openrouter"
						break
					// ... other provider mappings ...
					default:
						Logger.warn(
							`[GrpcBridge:handleUpdateSettings] Unknown or unmapped ApiProvider enum value: ${protoApiConfig.apiProvider}`,
						)
				}

				if (internalApiProvider) {
					updates.apiProvider = internalApiProvider
					Logger.info(`[GrpcBridge:handleUpdateSettings] Mapped provider: ${internalApiProvider}`)
					// ... map provider specific fields ...
					updates.favoritedModelIds = protoApiConfig.favoritedModelIds || []
				}

				if (Object.keys(updates).length > 0) {
					Logger.info(
						`[GrpcBridge:handleUpdateSettings] Persisting API configuration updates: ${JSON.stringify(updates)}`,
					)
					await updateApiConfiguration(this.context, updates)
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

			if (settings.chatSettings) {
				const protoChatSettings = settings.chatSettings as taskControlPb.ChatSettings
				const internalChatSettingsUpdate: Partial<ChatSettings> = {}
				switch (protoChatSettings.mode) {
					case taskControlPb.ChatMode.PLAN:
						internalChatSettingsUpdate.mode = "plan"
						break
					case taskControlPb.ChatMode.ACT:
						internalChatSettingsUpdate.mode = "act"
						break
					default:
						Logger.info("[GrpcBridge:handleUpdateSettings] Received CHAT_MODE_UNSPECIFIED for chatSettings.mode.")
				}
				if (internalChatSettingsUpdate.mode) {
					Logger.info(
						`[GrpcBridge:handleUpdateSettings] Persisting ChatSettings update: ${JSON.stringify(internalChatSettingsUpdate)}`,
					)
					const currentChatSettings = (await getAllExtensionState(this.context)).chatSettings || {}
					const newChatSettings = { ...currentChatSettings, ...internalChatSettingsUpdate }
					await updateGlobalState(this.context, "chatSettings", newChatSettings)
					Logger.info(`[GrpcBridge:handleUpdateSettings] ChatSettings updated in global state.`)
				}
			}
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

	async handleToolResult(clientId: string, result: Partial<ProtoToolResultBlock>): Promise<void> {
		Logger.warn(
			`[GrpcBridge:handleToolResult] Client '${clientId}' attempted action but has no active task mapped. Cline may be user-controlled or this is an inactive/invalid gRPC session. External tool execution is not expected. Ignoring.`,
		)
		// Original logic for task check was minimal, keeping it that way as the primary action is to ignore.
		const task = this.clientTaskMap.get(clientId)
		if (!task) {
			Logger.warn(`[GrpcBridge:handleToolResult] Further detail: Task not found for clientId ${clientId}.`)
		}
	}

	async handleUserInput(clientId: string, text?: string, images?: string[]): Promise<void> {
		Logger.info(`[GrpcBridge:handleUserInput] Received for client ${clientId} with text: "${text?.substring(0, 30)}..."`)
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			Logger.info(`[GrpcBridge:handleUserInput] Forwarding user input as 'messageResponse' to task ${task.taskId}`)
			task.handleWebviewAskResponse("messageResponse", text, images)
		} else {
			Logger.warn(
				`[GrpcBridge:handleUserInput] Client '${clientId}' attempted action but has no active task mapped. Cline may be user-controlled or this is an inactive/invalid gRPC session.`,
			)
			throw new Error("Task associated with client ID not found. Cline may be user-controlled or gRPC session is inactive.")
		}
	}

	async handleGenericMessage(clientId: string, message: WebviewMessage): Promise<void> {
		Logger.info(`[GrpcBridge] handleGenericMessage received for client ${clientId}`)
		if (this.controller) {
			const task = this.clientTaskMap.get(clientId)
			if (task && this.controller.task?.taskId !== task.taskId) {
				Logger.warn(
					`[GrpcBridge] handleGenericMessage received for client ${clientId}, but controller's active task (${this.controller.task?.taskId}) doesn't match mapped task (${task.taskId}). Proceeding with controller's active task context.`,
				)
			}
			Logger.info(`[GrpcBridge] Forwarding generic message type ${message.type} to controller.`)
			this.controller.handleWebviewMessage(message)
		} else {
			Logger.warn(`[GrpcBridge] Controller not available in handleGenericMessage`)
		}
	}

	async handleDeleteTaskWithId(clientId: string, taskId: string): Promise<void> {
		Logger.info(`[GrpcBridge:handleDeleteTaskWithId] Received for client ${clientId}, taskId ${taskId}`)
		if (!this.controller) {
			Logger.warn(`[GrpcBridge:handleDeleteTaskWithId] Controller not available.`)
			throw new Error("Controller not available to delete task.")
		}

		const clientOwnsTask = this.clientTaskMap.get(clientId)?.taskId === taskId

		if (clientOwnsTask) {
			Logger.info(
				`[GrpcBridge:handleDeleteTaskWithId] Client '${clientId}' owns task '${taskId}'. Proceeding with deletion.`,
			)
			await this.controller.deleteTaskWithId(taskId) // This will trigger onDispose for the task if it's active
			// The onDispose handler for the task (if it was mapped to this client) will clean up clientTaskMap.
			Logger.info(`[GrpcBridge:handleDeleteTaskWithId] Deletion command issued for task '${taskId}'.`)
		} else {
			// Check if the task exists at all (could be a webview task or belong to another client)
			// Assuming controller has a method to get all task history items.
			// This is a placeholder; if getTaskHistory doesn't exist, this check needs adjustment.
			const taskHistory = await this.controller.getTaskHistory?.() // Optional chaining for safety
			const taskExists = taskHistory?.some((t) => t.id === taskId)

			if (taskExists) {
				Logger.warn(
					`[GrpcBridge:handleDeleteTaskWithId] Client '${clientId}' attempted to delete task '${taskId}' which it does not own. Denying. Cline may be user-controlled or this is an inactive/invalid gRPC session.`,
				)
				throw new Error("Permission denied: Task not managed by this gRPC client.")
			} else {
				Logger.warn(
					`[GrpcBridge:handleDeleteTaskWithId] Client '${clientId}' attempted to delete task '${taskId}' which does not exist or is not known.`,
				)
				throw new Error("Task not found.")
			}
		}
	}

	async handleApplyBrowserSettings(clientId: string, settings: any): Promise<void> {
		Logger.info(`[GrpcBridge] handleApplyBrowserSettings received for client ${clientId}`)
		try {
			await updateGlobalState(this.context, "browserSettings", settings as BrowserSettings)
			await this.controller?.postStateToWebview()
			Logger.info(`[GrpcBridge] Applied browser settings for client ${clientId}`)
		} catch (error) {
			Logger.error(`[GrpcBridge] Error applying browser settings for client ${clientId}:`, error)
			throw new Error(`Failed to apply browser settings: ${error instanceof Error ? error.message : String(error)}`)
		}
	}

	async handleOpenFile(clientId: string, filePath: string): Promise<void> {
		Logger.info(`[GrpcBridge] handleOpenFile received for client ${clientId}, path ${filePath}`)
		if (this.controller) {
			try {
				await handleFileServiceRequest(this.controller, "openFile", { value: filePath })
				Logger.info(`[GrpcBridge] Opened file ${filePath} for client ${clientId}`)
			} catch (error) {
				Logger.error(`[GrpcBridge] Error opening file ${filePath} for client ${clientId}:`, error)
				throw new Error(`Failed to open file: ${error instanceof Error ? error.message : String(error)}`)
			}
		} else {
			Logger.warn(`[GrpcBridge] Controller not available in handleOpenFile`)
			throw new Error("Controller not available to handle openFile request.")
		}
	}

	private getWrappedPostMessage(originalPostMessage: PostMessageFunc): PostMessageFunc {
		return async (message: ExtensionMessage, taskId?: string): Promise<void> => {
			Logger.debug(
				`[WRAPPER_TRACE] Entry. TaskId: ${taskId}, MessageType: ${message?.type}, ClientTaskMap size: ${this.clientTaskMap.size}`,
			)
			const clientId = this.findClientIdByTaskId(taskId)
			Logger.debug(`[WRAPPER_TRACE] Found clientId: ${clientId} for taskId: ${taskId}`)

			// GRPC Path: Clean and send relevant messages
			if (clientId && taskId && this.grpcNotifier) {
				if (message?.type === "partialMessage" && message.partialMessage?.partial === true) {
					Logger.debug(
						`[WRAPPER_TRACE] GRPC_ROUTE: Intercepted PARTIAL CHUNK. Type: ${message.partialMessage.type}, Subtype: ${message.partialMessage.type === "say" ? message.partialMessage.say : message.partialMessage.type === "ask" ? message.partialMessage.ask : "N/A"}, For Client: ${clientId}, Task: ${taskId}.`,
					)
				} else {
					Logger.info(
						`[WRAPPER_TRACE] GRPC_ROUTE: Intercepted COMPLETE message type ${message?.type || "unknown"} (or non-partial part of stream) for gRPC client ${clientId}, task ${taskId}.`,
					)
				}
				const extMsg = message
				if (extMsg.error) {
					Logger.warn(`[WRAPPER_TRACE] GRPC_ROUTE: Intercepted ERROR for client ${clientId}: ${extMsg.error}`)
					this.grpcNotifier.emit("error", clientId, extMsg.error)
				}

				if (extMsg.type === "partialMessage" && extMsg.partialMessage) {
					const partialMsg = extMsg.partialMessage
					if (
						partialMsg.type === "say" &&
						(partialMsg.say === "text" || partialMsg.say === "reasoning" || partialMsg.say === "completion_result")
					) {
						this.handleAndCleanGrpcPartialMessage(clientId, taskId, partialMsg)
					} else if (partialMsg.type === "say" && partialMsg.say === "error" && partialMsg.text) {
						Logger.warn(
							`[WRAPPER_TRACE] GRPC_ROUTE: Intercepted SAY_ERROR via partialMessage for client ${clientId}: ${partialMsg.text}`,
						)
						this.grpcNotifier.emit("error", clientId, partialMsg.text)
					} else {
						// This is the block for other partialMessage types (e.g., ASK types not tool/command, or SAY types not for text streaming)
						// If this is a complete message (not a partial chunk itself), map and emit it.
						// This is crucial for ASK messages (like options, completion_result) or other SAY types that aren't text-based streaming.
						if (partialMsg.partial === false || partialMsg.partial === undefined) {
							const taskSentMessageIds = this.sentMessagesTracker.get(taskId) ?? new Set<string>()
							if (partialMsg.ts && !taskSentMessageIds.has(partialMsg.ts.toString())) {
								const protoMsg = mapClineMessageToProto(partialMsg)
								if (protoMsg) {
									Logger.info(
										`[WRAPPER_TRACE] GRPC_ROUTE: Emitting complete non-aggregated partialMessage for client ${clientId}, task ${taskId}, msgTs ${partialMsg.ts}. Type: ${partialMsg.type}, AskType: ${partialMsg.type === "ask" ? partialMsg.ask : "N/A"}, SayType: ${partialMsg.type === "say" ? partialMsg.say : "N/A"}`,
									)
									this.grpcNotifier.emit("newChatMessage", clientId, taskId, protoMsg)
									taskSentMessageIds.add(partialMsg.ts.toString())
									this.sentMessagesTracker.set(taskId, taskSentMessageIds)
								} else {
									Logger.warn(
										`[WRAPPER_TRACE] GRPC_ROUTE: Failed to map non-aggregated partialMessage (ts: ${partialMsg.ts}) to proto for client ${clientId}, task ${taskId}. Type: ${partialMsg.type}`,
									)
								}
							} else if (partialMsg.ts && taskSentMessageIds.has(partialMsg.ts.toString())) {
								Logger.debug(
									`[WRAPPER_TRACE] GRPC_ROUTE: Non-aggregated partialMessage (ts: ${partialMsg.ts}, type: ${partialMsg.type}) already sent for task ${taskId}. Skipping.`,
								)
							} else if (!partialMsg.ts) {
								Logger.warn(
									`[WRAPPER_TRACE] GRPC_ROUTE: Non-aggregated partialMessage of type ${partialMsg.type} has no timestamp for task ${taskId}. Cannot track/send.`,
								)
							}
						} else {
							// This is a true partial chunk of a message type not handled by handleAndCleanGrpcPartialMessage (e.g. ASK options if chunked).
							// This scenario needs careful consideration. For now, log it.
							// For ASK messages or other non-text SAY messages, we typically only care about the final complete version.
							// So, logging these intermediate true partials at a lower level is appropriate, as we wait for the final complete message.
							Logger.debug(
								`[WRAPPER_TRACE] GRPC_ROUTE: Skipping emission of TRUE partial chunk for gRPC. Type: ${partialMsg.type} (AskType: ${partialMsg.type === "ask" ? partialMsg.ask : "N/A"}, SayType: ${partialMsg.type === "say" ? partialMsg.say : "N/A"}). Waiting for complete message. Client: ${clientId}, Task: ${taskId}.`,
							)
						}
					}
				} else if (extMsg.type === "state" && extMsg.state && taskId) {
					// Handle 'state' messages to extract and send new individual complete messages
					const activeTaskMessages = extMsg.state.clineMessages || []
					if (!this.sentMessagesTracker.has(taskId)) {
						this.sentMessagesTracker.set(taskId, new Set<string>())
					}
					const taskSentMessageIds = this.sentMessagesTracker.get(taskId)!
					let newMessagesSentCount = 0
					for (const chatMessage of activeTaskMessages) {
						const isComplete = chatMessage.partial === undefined || chatMessage.partial === false
						if (isComplete && chatMessage.ts && !taskSentMessageIds.has(chatMessage.ts.toString())) {
							// Instead of directly emitting, pass to handleAndCleanGrpcPartialMessage
							// This ensures even messages from state are de-duplicated if they are text/reasoning/completion
							if (
								chatMessage.type === "say" &&
								(chatMessage.say === "text" ||
									chatMessage.say === "reasoning" ||
									chatMessage.say === "completion_result")
							) {
								this.handleAndCleanGrpcPartialMessage(clientId, taskId, chatMessage)
								newMessagesSentCount++ // Count it as processed for gRPC
							} else {
								// For other complete messages from state (e.g. tool_code, tool_use, ask) send directly
								const protoChatMessage = mapClineMessageToProto(chatMessage)
								if (protoChatMessage) {
									Logger.info(
										`[WRAPPER_TRACE] GRPC_ROUTE (from state): Emitting direct newChatMessage for client ${clientId}, task ${taskId}, msgTs ${chatMessage.ts}. Type: ${chatMessage.type}`,
									)
									this.grpcNotifier.emit("newChatMessage", clientId, taskId, protoChatMessage)
									taskSentMessageIds.add(chatMessage.ts.toString())
									newMessagesSentCount++
								}
							}
						}
					}
					if (newMessagesSentCount > 0) {
						Logger.info(
							`[WRAPPER_TRACE] GRPC_ROUTE: Processed ${newMessagesSentCount} new messages from 'state' for task ${taskId} via gRPC path.`,
						)
					}
				}
			}

			// Always call the original function to ensure webview receives the message
			Logger.debug(
				`[WRAPPER_TRACE] Calling original postMessageToWebview for message type ${message?.type}, taskId ${taskId}`,
			)
			// The original postMessage only accepts one parameter (message)
			return originalPostMessage(message)
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
		Logger.info("[GrpcBridge] Disposing...")
		if (this.controller && this.originalPostMessage && this.controller.postMessageToWebview !== this.originalPostMessage) {
			Logger.info("[GrpcBridge] Restoring original Controller.postMessageToWebview.")
			this.controller.postMessageToWebview = this.originalPostMessage
		}
		this.originalPostMessage = undefined
		if (this.grpcNotifier) {
			try {
				stopExternalGrpcServer()
				Logger.info("[GrpcBridge] gRPC server stopped.")
			} catch (error) {
				Logger.error("[GrpcBridge] Error stopping gRPC server:", error)
			}
			this.grpcNotifier = null
		}
		this.clientTaskMap.clear()
		this.sentMessagesTracker.clear()
		this.grpcCleanMessageAggregator.clear()
		this.lastToolAskIdForTask.clear()
		Logger.info(
			"[GrpcBridge] Cleared clientTaskMap, sentMessagesTracker, grpcCleanMessageAggregator, and lastToolAskIdForTask.",
		)
		vscode.Disposable.from(...this.disposables).dispose()
		this.disposables = []
		Logger.info("[GrpcBridge] Disposed.")
	}

	private deduplicateAppend(currentCleanText: string, newChunkText: string): string {
		if (!newChunkText) {
			return currentCleanText
		}
		if (!currentCleanText) {
			return newChunkText
		}

		let overlapLength = 0
		// Find the longest suffix of currentCleanText that is a prefix of newChunkText
		for (let k = Math.min(currentCleanText.length, newChunkText.length); k > 0; k--) {
			if (currentCleanText.endsWith(newChunkText.substring(0, k))) {
				overlapLength = k
				break
			}
		}
		return currentCleanText + newChunkText.substring(overlapLength)
	}

	/**
	 * Handles incoming ClineMessages for gRPC clients by buffering, de-duplicating,
	 * and emitting them when complete.
	 * Processes 'say' messages of type 'text', 'reasoning', and 'completion_result'.
	 * @param clientId The ID of the gRPC client.
	 * @param taskId The ID of the task.
	 * @param incomingMessage The incoming ClineMessage (can be partial or complete).
	 */
	private handleAndCleanGrpcPartialMessage(clientId: string, taskId: string, incomingMessage: ClineMessage): void {
		if (!this.grpcNotifier || !incomingMessage.ts) {
			Logger.warn(
				`[GrpcBridge:handleAndCleanGrpcPartialMessage] Notifier or timestamp missing. Cannot process message for client ${clientId}, task ${taskId}. Msg Type: ${incomingMessage.type}, Say: ${incomingMessage.type === "say" ? incomingMessage.say : "N/A"}`,
			)
			return
		}

		// Ensure buffer maps exist for client and task in the clean aggregator
		const clientBuffer = this.grpcCleanMessageAggregator.get(clientId) ?? new Map()
		this.grpcCleanMessageAggregator.set(clientId, clientBuffer)
		const taskBuffer = clientBuffer.get(taskId) ?? new Map()
		clientBuffer.set(taskId, taskBuffer)

		const messageTs = incomingMessage.ts
		let messageState = taskBuffer.get(messageTs)

		if (!messageState) {
			// First chunk for this message timestamp
			messageState = {
				firstChunkPayload: JSON.parse(JSON.stringify(incomingMessage)) as ClineMessage, // Deep clone
				cleanAccumulatedText: this.deduplicateAppend("", incomingMessage.text || ""),
			}
		} else {
			// Subsequent chunk
			if (incomingMessage.text) {
				messageState.cleanAccumulatedText = this.deduplicateAppend(
					messageState.cleanAccumulatedText,
					incomingMessage.text,
				)
			}
			// Update the partial status from the latest chunk (even if it's a complete message being processed here)
			messageState.firstChunkPayload.partial = incomingMessage.partial
		}
		taskBuffer.set(messageTs, messageState)

		// Check if the message is now complete (either it arrived complete or this is the final partial chunk)
		if (incomingMessage.partial === false || incomingMessage.partial === undefined) {
			const finalMessage: ClineMessage = {
				...messageState.firstChunkPayload, // Contains all original fields like type, say/ask, ts, toolUse etc.
				text: messageState.cleanAccumulatedText, // Use the fully de-duplicated and accumulated text
				partial: false, // Explicitly mark as not partial
			}

			const protoClineMsg = mapClineMessageToProto(finalMessage)
			if (protoClineMsg) {
				Logger.info(
					`[GrpcBridge:handleAndCleanGrpcPartialMessage] Emitting complete de-duplicated message for client ${clientId}, task ${taskId}, msgTs ${messageTs}. Type: ${finalMessage.type}, Say: ${finalMessage.type === "say" ? finalMessage.say : "N/A"}`,
				)
				this.grpcNotifier.emit("newChatMessage", clientId, taskId, protoClineMsg)

				const taskSentMessageIds = this.sentMessagesTracker.get(taskId) ?? new Set<string>()
				taskSentMessageIds.add(messageTs.toString())
				this.sentMessagesTracker.set(taskId, taskSentMessageIds)

				taskBuffer.delete(messageTs)
				if (taskBuffer.size === 0) {
					clientBuffer.delete(taskId)
					if (clientBuffer.size === 0) {
						this.grpcCleanMessageAggregator.delete(clientId)
					}
				}
			} else {
				Logger.warn(
					`[GrpcBridge:handleAndCleanGrpcPartialMessage] Failed to map complete de-duplicated message (ts: ${messageTs}) to proto for client ${clientId}, task ${taskId}.`,
				)
			}
		}
	}

	async handleClearTask(clientId: string): Promise<void> {
		Logger.info(`[GrpcBridge] handleClearTask received for client ${clientId}. Treating as abort request.`)
		const task = this.clientTaskMap.get(clientId)
		if (task && task.taskId) {
			Logger.info(`[GrpcBridge] Aborting task ${task.taskId} due to clearTask request from client ${clientId}.`)
			this.clearBuffersForTask(clientId, task.taskId)
			try {
				await task.abortTask()
			} catch (error) {
				Logger.error(
					`[GrpcBridge] Error aborting task ${task.taskId} during handleClearTask for client ${clientId}:`,
					error,
				)
			}
		} else {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleClearTask`)
			this.clearBuffersForClient(clientId)
		}
	}

	async handleCancelTask(clientId: string): Promise<void> {
		Logger.info(`[GrpcBridge] handleCancelTask received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task && task.taskId) {
			Logger.info(`[GrpcBridge] Aborting task ${task.taskId} due to cancelTask request from client ${clientId}.`)
			this.clearBuffersForTask(clientId, task.taskId)
			try {
				await task.abortTask()
			} catch (error) {
				Logger.error(
					`[GrpcBridge] Error aborting task ${task.taskId} during handleCancelTask for client ${clientId}:`,
					error,
				)
			}
		} else {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleCancelTask`)
			this.clearBuffersForClient(clientId)
		}
	}

	async handleClientDisconnect(clientId: string): Promise<void> {
		Logger.info(`[GrpcBridge] handleClientDisconnect received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task && task.taskId) {
			Logger.info(`[GrpcBridge] Aborting task ${task.taskId} due to client ${clientId} disconnection.`)
			this.clearBuffersForTask(clientId, task.taskId)
			try {
				await task.abortTask()
			} catch (error) {
				Logger.error(`[GrpcBridge] Error aborting task ${task.taskId} for disconnected client ${clientId}:`, error)
			}
		} else {
			Logger.warn(`[GrpcBridge] Client ${clientId} disconnected, but no associated task found in the map.`)
		}
		this.clearBuffersForClient(clientId)
		this.clientTaskMap.delete(clientId)
	}

	private clearBuffersForTask(clientId: string, taskId: string): void {
		const clientCleanBuffer = this.grpcCleanMessageAggregator.get(clientId)
		if (clientCleanBuffer) {
			clientCleanBuffer.delete(taskId)
			Logger.info(`[GrpcBridge] Cleared clean message aggregator for task ${taskId} of client ${clientId}.`)
			if (clientCleanBuffer.size === 0) {
				this.grpcCleanMessageAggregator.delete(clientId)
			}
		}
	}

	private clearBuffersForClient(clientId: string): void {
		if (this.grpcCleanMessageAggregator.delete(clientId)) {
			Logger.info(`[GrpcBridge] Cleared all clean message aggregator buffers for client ${clientId}.`)
		}
	}
}

// Helper function for parsing concatenated JSON strings
function parseConcatenatedJsonInternal(
	concatenatedJson: string,
): { success: true; objects: any[] } | { success: false; error: string } {
	const objects: any[] = []
	let remainingString = concatenatedJson.trim()
	if (remainingString === "") {
		return { success: true, objects: [] } // Handle empty string input
	}

	while (remainingString.length > 0) {
		if (!remainingString.startsWith("{")) {
			// If it's not starting with '{', it might be a non-JSON string or malformed.
			// For this specific use case, if we expect JSON and it's not, it's an error.
			return { success: false, error: "Invalid sequence: part does not start with '{'." }
		}

		let balance = 0
		let endIndex = -1
		let inString = false

		for (let i = 0; i < remainingString.length; i++) {
			const char = remainingString[i]
			if (char === '"') {
				// Basic string literal handling: ignore braces within strings
				if (i === 0 || remainingString[i - 1] !== "\\") {
					// Handle escaped quotes
					inString = !inString
				}
			}
			if (inString) {
				continue
			}

			if (char === "{") {
				balance++
			} else if (char === "}") {
				balance--
				if (balance === 0) {
					endIndex = i
					break
				}
			}
		}

		if (endIndex === -1) {
			return { success: false, error: "Malformed JSON sequence: unbalanced braces or unterminated string." }
		}

		const jsonPart = remainingString.substring(0, endIndex + 1)
		try {
			objects.push(JSON.parse(jsonPart))
			remainingString = remainingString.substring(endIndex + 1).trim()
		} catch (e: any) {
			return { success: false, error: `Malformed JSON part: "${jsonPart.substring(0, 100)}...". Error: ${e.message}` }
		}
	}
	return { success: true, objects }
}

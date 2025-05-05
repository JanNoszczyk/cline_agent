import * as vscode from "vscode"
import { Controller } from "../../core/controller" // Assuming Controller is exported
import { Task } from "../../core/task" // Assuming Task is exported
import { WebviewMessage } from "../../shared/WebviewMessage" // Import WebviewMessage
import {
	startExternalGrpcServer,
	stopExternalGrpcServer,
	GrpcServerCallbacks,
	GrpcTaskNotifier,
	// ProtoExtensionMessageWrapper, // Import if needed for mapping
	ProtoExtensionMessageTypeConst, // Import message type constants
	ProtoExtensionMessageWrapper, // Import wrapper type
	ProtoAskRequest, // Import specific type for ask
	// Removed ProtoClineMessage import as it's no longer exported from server.ts
} from "./server" // Import from the actual server file
import {
	ProtoExtensionState,
	mapExtensionStateToProto,
	mapClineMessageToProto,
	mapToolUseBlockToProto,
	mapToolResultBlockToProto,
	ProtoToolResultBlock, // Import the missing type
	// Import other specific proto types if needed by mapper functions
} from "./mapper" // Import state type and mapping functions
import { ExtensionMessage } from "../../shared/ExtensionMessage" // Import ExtensionMessage for type checking
import { ToolResponse } from "../../core/task" // Import internal tool types from index
import { ToolUse } from "@core/assistant-message" // Import ToolUse type
import { mapProtoToolResultToInternal } from "./mapper" // Import the new mapper
import { formatResponse } from "@core/prompts/responses" // Import formatResponse for image blocks
import Anthropic from "@anthropic-ai/sdk" // Import Anthropic for ContentBlockParam type
import { Logger } from "@services/logging/Logger" // Import Logger

// Define the expected signature for the postMessage function
type PostMessageFunc = (message: ExtensionMessage) => Promise<void>

/**
 * Bridges the external gRPC server with the internal Cline Controller and Task logic.
 */
export class GrpcBridge implements GrpcServerCallbacks, vscode.Disposable {
	private context: vscode.ExtensionContext
	private controller: Controller | undefined // Reference to the main Controller instance
	private grpcNotifier: GrpcTaskNotifier | null = null // Initialize to null
	private clientTaskMap = new Map<string, Task>() // Map external clientId to internal Task instance
	private disposables: vscode.Disposable[] = []

	private originalPostMessage?: PostMessageFunc // Store original using the correct type

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
			// Create the wrapped function using the original
			const wrappedPostMessage = this.getWrappedPostMessage(this.originalPostMessage)
			// Overwrite the controller's method with our wrapper
			controller.postMessageToWebview = wrappedPostMessage
			console.log("[GrpcBridge] Controller.postMessageToWebview has been wrapped.")
		} else {
			console.error("[GrpcBridge] Controller.postMessageToWebview is not a function. Wrapping failed.")
			// Consider throwing an error or notifying the user
		}
		// --- End Wrapping ---

		// Start the gRPC server now that we have the controller and wrapping is set up
		this.grpcNotifier = startExternalGrpcServer(
			this.controller, // Pass controller instance (now with wrapped postMessage)
			this, // Pass this bridge as the callbacks implementation
			this.context.extensionPath,
		)
		if (this.grpcNotifier) {
			console.log("[GrpcBridge] gRPC server started successfully.")
			// TODO: Handle server errors/disconnects if the notifier provides events
		} else {
			console.error("[GrpcBridge] Failed to start gRPC server.")
			vscode.window.showErrorMessage("Failed to start Cline gRPC Bridge server.")
		}
	}

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

				// Notify client that task started
				if (this.grpcNotifier) {
					this.grpcNotifier.notifyTaskStarted(clientId, {
						task_id: taskInstance.taskId,
						version: this.context.extension?.packageJSON?.version ?? "",
					})
				}

				// TODO: Handle task disposal to remove from map. Requires Task to emit an event.
				// taskInstance.onDidDispose(() => {
				//     this.clientTaskMap.delete(clientId);
				//     console.log(`[GrpcBridge] Removed task mapping for client ${clientId} upon disposal.`);
				// });
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
	 * Handles a tool result received from the external gRPC client by directly
	 * manipulating the target Task's state.
	 */
	// Change parameter type to match mapper expectation
	async handleToolResult(clientId: string, result: Partial<ProtoToolResultBlock>): Promise<void> {
		Logger.info(`[GrpcBridge] handleToolResult received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			// --- Direct Task State Manipulation ---
			// WARNING: Accessing internal Task properties directly. Less ideal than dedicated methods.
			try {
				// Map the proto result to the internal format
				const internalToolResponse: ToolResponse = mapProtoToolResultToInternal(result)

				// Prepare content blocks for the next API request
				const toolResultBlocks: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
				toolResultBlocks.push({
					type: "text",
					// TODO: Include tool description if possible/needed?
					// Requires knowing which tool call this result corresponds to.
					// For now, just label it generically.
					text: `Tool Result:`,
				})

				if (typeof internalToolResponse === "string") {
					toolResultBlocks.push({
						type: "text",
						text: internalToolResponse || "(tool did not return anything)",
					})
				} else {
					// Handle array of blocks (likely text + images)
					toolResultBlocks.push(...internalToolResponse)
				}

				// Inject the result into the task's userMessageContent
				// Ensure this doesn't conflict with ongoing streaming/tool execution within the task
				// This assumes the task loop is currently waiting (e.g., after an API call)
				// or that appending here is safe.
				// @ts-expect-error Accessing private property
				task.userMessageContent = toolResultBlocks // Replace existing content with the tool result
				// @ts-expect-error Accessing private property
				task.userMessageContentReady = true // Signal the task loop to continue

				Logger.info(`[GrpcBridge] Injected tool result into task ${task.taskId} and set userMessageContentReady.`)
			} catch (error) {
				Logger.error(`[GrpcBridge] Error processing tool result for task ${task.taskId}:`, error)
				// Attempt to signal error back to the task loop if possible
				try {
					// @ts-expect-error Accessing private property
					task.userMessageContent = [
						{
							type: "text",
							text: formatResponse.toolError(
								`GrpcBridge failed to process tool result: ${error instanceof Error ? error.message : String(error)}`,
							),
						},
					]
					// @ts-expect-error Accessing private property
					task.userMessageContentReady = true
				} catch (innerError) {
					Logger.error(`[GrpcBridge] Failed to inject error message into task ${task.taskId}:`, innerError)
				}
			}
			// --- End Direct Manipulation ---
		} else {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleToolResult`)
		}
	}

	/**
	 * Handles user input text/images received from the external gRPC client by directly
	 * manipulating the target Task's state.
	 */
	async handleUserInput(clientId: string, text?: string, images?: string[]): Promise<void> {
		Logger.info(`[GrpcBridge] handleUserInput received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task) {
			// --- Direct Task State Manipulation ---
			// WARNING: Accessing internal Task properties directly. Less ideal than dedicated methods.
			try {
				const inputBlocks: (Anthropic.TextBlockParam | Anthropic.ImageBlockParam)[] = []
				if (text) {
					inputBlocks.push({ type: "text", text: text })
				}
				if (images && images.length > 0) {
					// Assuming images are base64 data URLs
					inputBlocks.push(...formatResponse.imageBlocks(images))
				}

				if (inputBlocks.length === 0) {
					Logger.warn(`[GrpcBridge] Received handleUserInput for client ${clientId} with no text or images.`)
					return // Nothing to inject
				}

				// Inject the user input into the task's userMessageContent
				// This replaces any pending content and signals the loop to proceed with this new input.
				// @ts-expect-error Accessing private property
				task.userMessageContent = inputBlocks
				// @ts-expect-error Accessing private property
				task.userMessageContentReady = true // Signal the task loop to continue

				Logger.info(`[GrpcBridge] Injected user input into task ${task.taskId} and set userMessageContentReady.`)
			} catch (error) {
				Logger.error(`[GrpcBridge] Error processing user input for task ${task.taskId}:`, error)
				// Attempt to signal error back to the task loop if possible
				try {
					// @ts-expect-error Accessing private property
					task.userMessageContent = [
						{
							type: "text",
							text: formatResponse.toolError(
								`GrpcBridge failed to process user input: ${error instanceof Error ? error.message : String(error)}`,
							),
						},
					]
					// @ts-expect-error Accessing private property
					task.userMessageContentReady = true
				} catch (innerError) {
					Logger.error(`[GrpcBridge] Failed to inject error message into task ${task.taskId}:`, innerError)
				}
			}
			// --- End Direct Manipulation ---
		} else {
			Logger.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleUserInput`)
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
		console.log(`[GrpcBridge] handleClearTask received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task && this.controller) {
			// TODO: Determine if clearTask should operate on the specific task or globally via controller
			console.log(`[GrpcBridge] Clearing task ${task.taskId}`)
			await this.controller.clearTask() // Assuming controller.clearTask() handles the active task
		} else {
			if (!task) console.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleClearTask`)
			if (!this.controller) console.warn(`[GrpcBridge] Controller not available in handleClearTask`)
			// If no task is mapped, maybe clear the global controller task?
			// await this.controller?.clearTask();
		}
	}

	async handleCancelTask(clientId: string): Promise<void> {
		console.log(`[GrpcBridge] handleCancelTask received for client ${clientId}`)
		const task = this.clientTaskMap.get(clientId)
		if (task && this.controller) {
			console.log(`[GrpcBridge] Cancelling task ${task.taskId}`)
			// Assuming cancelTask on controller handles the currently active task,
			// need to ensure it targets the correct one if multiple tasks could exist.
			if (this.controller.task?.taskId === task.taskId) {
				await this.controller.cancelTask()
			} else {
				console.warn(`[GrpcBridge] Attempted to cancel task ${task.taskId} which is not the controller's active task.`)
				// Maybe call task.abortTask() directly? Requires exposing it or adding a controller method.
				// await task.abortTask();
			}
		} else {
			if (!task) console.warn(`[GrpcBridge] Task not found for clientId ${clientId} in handleCancelTask`)
			if (!this.controller) console.warn(`[GrpcBridge] Controller not available in handleCancelTask`)
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
		// await updateGlobalState(this.context, 'browserSettings', settings as BrowserSettings);
		// await this.controller?.postStateToWebview(); // Notify webview if needed
		console.warn("[GrpcBridge] handleApplyBrowserSettings: Implementation pending.")
	}

	async handleOpenFile(clientId: string, filePath: string): Promise<void> {
		console.log(`[GrpcBridge] handleOpenFile received for client ${clientId}, path ${filePath}`)
		if (this.controller) {
			// Use the handleFileServiceRequest function, assuming it's accessible/importable.
			// Need to import handleFileServiceRequest from '../../core/controller/file';
			// Example:
			// import { handleFileServiceRequest } from '../../core/controller/file';
			// await handleFileServiceRequest(this.controller, "openFile", { value: filePath });
			console.warn("[GrpcBridge] handleOpenFile: Implementation pending (requires handleFileServiceRequest import/access).")
		} else {
			console.warn(`[GrpcBridge] Controller not available in handleOpenFile`)
		}
	}

	// --- Message Interception Logic ---

	/**
	 * Creates a wrapper around the original postMessage function to intercept messages.
	 * Creates a wrapper around the original postMessage function to intercept messages.
	 * @param originalPostMessage The original function (bound to the controller) to send messages to the webview.
	 * @returns A new function that intercepts messages for gRPC tasks, matching the original signature.
	 */
	private getWrappedPostMessage(originalPostMessage: PostMessageFunc): PostMessageFunc {
		// Return the wrapper function
		return (message: ExtensionMessage): Promise<void> => {
			// Determine if this message belongs to a gRPC-controlled task
			// Get the taskId from the controller's currently active task
			const activeTaskId = this.controller?.task?.taskId
			const clientId = this.findClientIdByTaskId(activeTaskId) // Use the active task's ID

			// If it's a gRPC task (based on the controller's active task) and the notifier is ready, intercept and process
			if (clientId && this.grpcNotifier) {
				console.log(
					`[GrpcBridge] Intercepted message type ${message?.type || "unknown"} for gRPC client ${clientId}, task ${activeTaskId}`,
				)
				try {
					// <<< TRY starts
					// We still use the 'message' object for mapping, just the routing decision is based on activeTaskId
					const extMsg = message

					// Handle error property first, if present
					if (extMsg.error) {
						console.warn(`[GrpcBridge] Sending error notification for message type ${extMsg.type}: ${extMsg.error}`)
						this.grpcNotifier.notifyError(clientId, extMsg.error)
						// Continue processing the main type as well
					}

					// Map based on the TOP-LEVEL ExtensionMessage type
					switch (extMsg.type) {
						case "state":
							if (extMsg.state) {
								const protoState = mapExtensionStateToProto(extMsg.state)
								if (protoState) {
									this.grpcNotifier.notifyState(clientId, protoState)
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
										if (extMsg.partialMessage.say === "tool") {
											// Assuming the text contains the JSON string for ClineSayTool
											try {
												const toolInfo = JSON.parse(extMsg.partialMessage.text || "{}")
												// TODO: Need a specific mapping for ClineSayTool to a Proto representation if required by the client
												// For now, sending the raw ClineMessage proto
												this.grpcNotifier.notifySay(
													clientId,
													protoClineMsg,
													extMsg.partialMessage.partial ?? false,
												) // Removed cast
											} catch (e) {
												console.error(
													"[GrpcBridge] Failed to parse tool info from 'say' message:",
													extMsg.partialMessage.text,
												)
												this.grpcNotifier.notifySay(
													clientId,
													protoClineMsg,
													extMsg.partialMessage.partial ?? false,
												) // Removed cast & Send anyway
											}
										} else {
											this.grpcNotifier.notifySay(
												clientId,
												protoClineMsg,
												extMsg.partialMessage.partial ?? false,
											) // Removed cast
										}
									} else if (extMsg.partialMessage.type === "ask" && extMsg.partialMessage.ask) {
										// Map the internal ClineMessage 'ask' to the ProtoAskRequest structure
										const protoAskReq: ProtoAskRequest = {
											ask_type: extMsg.partialMessage.ask, // Use the ask type from ClineMessage
											text: extMsg.partialMessage.text, // The text payload (often JSON for structured asks)
											partial: extMsg.partialMessage.partial,
											// ts: Timestamp.fromDate(new Date(extMsg.partialMessage.ts)), // Convert number timestamp to proto Timestamp
											// TODO: Uncomment Timestamp conversion once google-protobuf is confirmed working
										}
										this.grpcNotifier.notifyAsk(clientId, protoAskReq)
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
				// Not a gRPC task, or notifier not ready, or no taskId.
				// Call the original postMessage function to send the message to the webview as normal.
				return originalPostMessage(message)
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

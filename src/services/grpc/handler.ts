import * as grpc from "@grpc/grpc-js"
import { Timestamp } from "google-protobuf/google/protobuf/timestamp_pb"
import { Struct } from "google-protobuf/google/protobuf/struct_pb"
import { Controller } from "../../core/controller"
import { Logger } from "../logging/Logger"
import { WebviewMessage, ClineAskResponse } from "../../shared/WebviewMessage"
// Import necessary types from ExtensionMessage and HistoryItem
import { ExtensionState, ClineMessage } from "../../shared/ExtensionMessage"
import { HistoryItem } from "../../shared/HistoryItem" // Import directly from its own file

// Import generated message definition types
// Assuming the typo 'UserInputCommmand' was corrected during generation or here
import {
	CommandRequest,
	UpdateResponse,
	InitialStateUpdate,
	AddMessageUpdate,
	PartialMessageUpdate,
	ErrorUpdate,
	TaskStateUpdate,
	ToolApprovalRequest,
	StartTaskCommand,
	UserInputCommmand as UserInputCommand, // Corrected import alias
	ToolApprovalCommand,
	RequestInitialState,
	CancelTaskCommand,
	ClineMessage as ClineMessageProto, // Renaming to avoid conflict with internal type
} from "./generated/cline_control_pb" // Path to generated message JS definitions

// Define the stream type using generated messages
type ServerDuplexStream = grpc.ServerDuplexStream<CommandRequest, UpdateResponse>

// --- Helper Functions ---

/**
 * Safely converts a JavaScript object to a Google Protobuf Struct.
 * Returns null if the input is not a valid object or conversion fails.
 * @param obj The JavaScript object to convert.
 * @returns {Struct | null} The converted Struct or null on failure.
 */
const convertToProtoStruct = (obj: any): Struct | null => {
	// Ensure obj is a non-null object before attempting conversion
	if (obj === null || typeof obj !== "object" || Array.isArray(obj)) {
		if (obj !== null && obj !== undefined) {
			// Log only if it's not explicitly null/undefined
			Logger.warn(`convertToProtoStruct: Input is not a convertible object (type: ${typeof obj}).`)
		}
		return null
	}
	try {
		// `Struct.fromJavaScript` handles the conversion.
		return Struct.fromJavaScript(obj)
	} catch (e: any) {
		Logger.error(`Failed to convert object to Struct: ${e.message}`, e)
		// Consider logging the object shape in debug mode if errors persist
		// Logger.debug('Object causing Struct conversion error:', JSON.stringify(obj)); // Be cautious with large objects
		return null
	}
}

/**
 * Safely converts a numeric timestamp (milliseconds since epoch) to a Google Protobuf Timestamp.
 * Returns null if the input is not a valid number or conversion fails.
 * @param ts The timestamp number (milliseconds since epoch).
 * @returns {Timestamp | null} The converted Timestamp or null on failure.
 */
const convertToProtoTimestamp = (ts: number | undefined | null): Timestamp | null => {
	// Check for null, undefined, or non-numeric types
	if (ts === undefined || ts === null || typeof ts !== "number" || !isFinite(ts)) {
		if (ts !== undefined && ts !== null) {
			// Log only if it wasn't explicitly null/undefined
			Logger.warn(`convertToProtoTimestamp: Invalid timestamp value provided: ${ts}`)
		}
		return null
	}
	try {
		const date = new Date(ts)
		// Check if the date object is valid after creation
		if (isNaN(date.getTime())) {
			Logger.warn(`convertToProtoTimestamp: Created invalid Date from timestamp: ${ts}`)
			return null
		}
		// `Timestamp.fromDate` handles the conversion.
		return Timestamp.fromDate(date)
	} catch (e: any) {
		// This catch block might be less likely if input validation is robust, but kept for safety
		Logger.error(`Failed to convert timestamp ${ts} to Timestamp: ${e.message}`, e)
		return null
	}
}
// --- End Helper Functions ---

// Class definition - Methods match the service definition in .proto
// No need to explicitly implement an interface if method signatures match proto service
export class ClineControllerHandler {
	private controller: Controller
	// Store streams keyed by peer address (client identifier)
	private activeStreams = new Map<string, ServerDuplexStream>() // Key: peer address, Value: stream

	constructor(controller: Controller) {
		this.controller = controller
		// TODO: Implement Controller event subscription in setupControllerListener
		this.setupControllerListener()
	}

	// --- Private methods for handling Controller Events ---

	// TODO: Implement the actual Controller event subscription mechanism
	private setupControllerListener(): void {
		// Example using a hypothetical event emitter on Controller:
		// this.controller.on('clineUpdate', this.handleControllerUpdate);
		Logger.info("Setting up listener for Controller updates (Needs actual implementation)")
		// Placeholder: Log that the listener mechanism isn't active yet
		// In a real implementation, you would attach listeners here, e.g.:
		// this.controller.on('addMessage', (payload) => this.handleControllerUpdate({ type: 'addMessage', payload }));
		// this.controller.on('partialMessage', (payload) => this.handleControllerUpdate({ type: 'partialMessage', payload }));
		// etc.
	}

	// TODO: This method needs the actual event data structure from the Controller
	// This handler is intended to be called by the event listener setup in setupControllerListener
	private handleControllerUpdate = (updateData: { type: string; payload: any }): void => {
		// Translate internal updateData to gRPC UpdateResponse
		const translatedResponse = this.translateUpdate(updateData)

		if (!translatedResponse) {
			// Warning logged within translateUpdate if needed
			Logger.debug("handleControllerUpdate: translateUpdate returned null, skipping broadcast.")
			return // Don't broadcast if translation failed or type was unhandled
		}

		// Send update to all active gRPC clients
		const activeClientCount = this.activeStreams.size
		if (activeClientCount > 0) {
			Logger.debug(`Broadcasting update (type: ${updateData.type}) to ${activeClientCount} connected client(s)`)
			this.activeStreams.forEach((stream, peer) => {
				try {
					// translatedResponse is guaranteed to be UpdateResponse type here
					stream.write(translatedResponse)
				} catch (e: any) {
					Logger.error(`Error writing update to gRPC stream for peer ${peer}: ${e.message}`, e)
					// Optional: Consider removing the stream if write fails persistently after retries?
					// this.activeStreams.delete(peer);
				}
			})
		} else {
			Logger.debug(`handleControllerUpdate: No active clients to broadcast update (type: ${updateData.type}) to.`)
		}
	}

	// --- gRPC Service Method Implementation ---

	/**
	 * Handles the bidirectional ControlStream RPC method.
	 * This is the entry point for a new client connection.
	 * @param call The duplex stream for sending/receiving messages.
	 */
	public controlStream = (call: ServerDuplexStream): void => {
		const peer = call.getPeer() // Get client identifier (e.g., "ipv4:127.0.0.1:12345")
		Logger.info(`gRPC client connected for ControlStream: ${peer}`)

		// Store the stream, associated with the client's peer address
		this.activeStreams.set(peer, call)

		// --- Handle incoming commands from the client ---
		call.on("data", (request: CommandRequest) => {
			// Request is already typed as CommandRequest by the gRPC library
			Logger.debug(
				`Received command from ${peer}: type=${CommandRequest.CommandCase[request.getCommandCase()]}, id=${request.getRequestId()}`,
			)
			// Asynchronously handle the command to avoid blocking the stream listener
			// Pass 'call' to potentially send request-specific responses (like errors or initial state)
			this.handleCommandRequest(request, call).catch((error) => {
				Logger.error(
					`Unhandled error during handleCommandRequest from ${peer} (Req ID: ${request.getRequestId()}): ${error.message}`,
					error,
				)
				// Send an ErrorUpdate back to the specific client that sent the command
				const errorUpdate = new ErrorUpdate()
				errorUpdate.setMessage(`Internal server error handling command (ID: ${request.getRequestId()}).`)
				// Include error message if available, otherwise a generic message
				errorUpdate.setDetails(error instanceof Error ? error.message : "Unknown error during command processing")
				errorUpdate.setErrorType("internal_error") // Or more specific if possible

				const errorResponse = new UpdateResponse()
				// Link error to original request if ID is available
				if (request.getRequestId()) {
					errorResponse.setResponseToRequestId(request.getRequestId())
				}
				errorResponse.setErrorUpdate(errorUpdate)

				// Safely write error back to the client, catching potential write errors
				try {
					if (!call.writableEnded) {
						// Check if stream is still writable
						call.write(errorResponse)
					} else {
						Logger.warn(
							`Stream for ${peer} already ended, cannot send error response for Req ID: ${request.getRequestId()}`,
						)
					}
				} catch (writeError: any) {
					Logger.error(
						`Failed to send error update back to client ${peer} after handling error: ${writeError.message}`,
						writeError,
					)
				}
			})
		})

		// --- Handle client disconnection (graceful) ---
		call.on("end", () => {
			Logger.info(`gRPC client disconnected gracefully: ${peer}`)
			this.activeStreams.delete(peer) // Remove stream from active map
		})

		// --- Handle stream errors (unexpected) ---
		call.on("error", (err: grpc.ServiceError) => {
			// Log the specific gRPC error details
			Logger.error(`gRPC stream error for ${peer}: ${err.message} (Code: ${err.code}, Details: ${err.details})`, err)
			this.activeStreams.delete(peer) // Remove stream on error
			// gRPC handles cleanup, no need to call call.end() manually here
		})

		// Optional: Send an initial 'connected' acknowledgement or request initial state automatically?
		// For now, we rely on the client sending RequestInitialState.
		// Example:
		// const connectedUpdate = new UpdateResponse();
		// const taskState = new TaskStateUpdate();
		// taskState.setStatus("connected"); // Define a 'connected' status if needed
		// connectedUpdate.setTaskState(taskState);
		// call.write(connectedUpdate);
	} // End of controlStream method

	// --- Private command handling logic ---

	/**
	 * Processes a received CommandRequest from a specific client stream.
	 * @param request The incoming CommandRequest object.
	 * @param call The client's specific duplex stream (used for request-specific responses like errors or initial state).
	 */
	private async handleCommandRequest(request: CommandRequest, call: ServerDuplexStream): Promise<void> {
		const commandCase = request.getCommandCase()
		const peer = call.getPeer()
		const requestId = request.getRequestId() // Get request ID for linking responses

		if (commandCase === CommandRequest.CommandCase.COMMAND_NOT_SET) {
			Logger.warn(`Received command request with no command set from ${peer}, Req ID: ${requestId}`)
			// Optionally send an error back if this is considered invalid
			this.sendErrorUpdate(call, requestId, "Invalid Command", "CommandRequest had no command case set.", "bad_request")
			return
		}

		// Use the generated getters directly, no need for intermediate payload variables
		Logger.info(`Processing command type: ${CommandRequest.CommandCase[commandCase]} from ${peer}, Req ID: ${requestId}`)

		try {
			switch (commandCase) {
				case CommandRequest.CommandCase.START_TASK:
					const startTaskCmd = request.getStartTask()
					if (!startTaskCmd) throw new Error("StartTask command payload is missing")
					const initialPrompt = startTaskCmd.getInitialPrompt()
					if (!initialPrompt) throw new Error("StartTask command requires an initial prompt.")

					Logger.info(`Initiating new task for ${peer} with prompt: "${initialPrompt.substring(0, 50)}..."`)
					// initTask might return the new task ID or throw if it fails
					const taskId = await this.controller.initTask(initialPrompt) // Assuming initTask returns task ID

					// Send confirmation back *after* task is initiated
					// Note: Further updates ('running', messages) will come via broadcast handleControllerUpdate
					this.sendTaskStateUpdate(call, requestId, "task_initiated", taskId, `Task initiated with prompt.`)
					break

				case CommandRequest.CommandCase.USER_INPUT:
					const userInputCmd = request.getUserInput()
					if (!userInputCmd) throw new Error("UserInput command payload is missing")
					const inputText = userInputCmd.getText()
					if (inputText === null || inputText === undefined) throw new Error("UserInput command requires text.")

					// Map gRPC UserInput to internal WebviewMessage format for controller
					// This assumes the controller expects this specific format for text input
					const userMessage: WebviewMessage = {
						type: "askResponse",
						askResponse: "messageResponse", // Standard response type for simple text input
						text: inputText,
					}
					// handleWebviewMessage likely triggers state updates picked up by the listener
					this.controller.handleWebviewMessage(userMessage)
					// No direct response needed here unless handleWebviewMessage provides immediate feedback
					break

				case CommandRequest.CommandCase.TOOL_APPROVAL:
					const toolApprovalCmd = request.getToolApproval()
					if (!toolApprovalCmd) throw new Error("ToolApproval command payload is missing")

					const toolCallId = toolApprovalCmd.getToolCallId() // Get the ID for context
					const isApproved = toolApprovalCmd.getApproved()
					const approvalResponse: ClineAskResponse = isApproved ? "yesButtonClicked" : "noButtonClicked"
					Logger.info(`Received tool approval decision for Tool Call ID ${toolCallId}: ${approvalResponse}`)

					// Map gRPC ToolApproval to internal WebviewMessage format
					const approvalMessage: WebviewMessage = {
						type: "askResponse",
						askResponse: approvalResponse,
						// Pass the approval decision text, controller might use it
						text: approvalResponse,
						// Optionally include the tool call ID if the controller needs it for context
						// value: toolCallId // Or however the controller expects context for askResponse
					}
					this.controller.handleWebviewMessage(approvalMessage)
					// No direct response needed here
					break

				case CommandRequest.CommandCase.REQUEST_INITIAL_STATE:
					const requestInitialStateCmd = request.getRequestInitialState() // Getter returns the message object or null
					// Check if the command object itself exists, even if it has no fields defined in proto
					if (!requestInitialStateCmd) throw new Error("RequestInitialState command payload is missing")

					Logger.info(`Handling RequestInitialState from ${peer}, Req ID: ${requestId}`)
					const initialState = await this.getInitialState() // Fetches and translates state

					// Check if the stream is still open before writing
					if (!call.writableEnded) {
						const initialStateResponse = new UpdateResponse()
						initialStateResponse.setResponseToRequestId(requestId) // Link response to request
						initialStateResponse.setInitialState(initialState)
						call.write(initialStateResponse)
						Logger.info(`Sent initial state to ${peer}, Req ID: ${requestId}`)
					} else {
						Logger.warn(`Stream for ${peer} ended before initial state could be sent (Req ID: ${requestId}).`)
					}
					break

				case CommandRequest.CommandCase.CANCEL_TASK:
					const cancelTaskCmd = request.getCancelTask()
					if (!cancelTaskCmd) throw new Error("CancelTask command payload is missing")

					// Get current state to find the task ID *before* cancelling
					const currentState = await this.controller.getStateToPostToWebview()
					const taskIdToCancel: string | undefined = currentState.currentTaskItem?.id // Explicit type
					Logger.info(
						`Attempting to cancel current task ${taskIdToCancel || "(no active task)"} for ${peer}, Req ID: ${requestId}`,
					)

					// Now cancel the task
					await this.controller.cancelTask() // Assuming cancelTask is async

					// Send confirmation back using the ID we retrieved earlier
					let finalTaskId: string | undefined = undefined
					if (typeof taskIdToCancel === "string") {
						// Explicit type check
						finalTaskId = taskIdToCancel
					}
					// Actual 'cancelled' state update might come via broadcast later
					this.sendTaskStateUpdate(call, requestId, "cancel_requested", finalTaskId, `Task cancellation requested.`)
					break

				default:
					// This should not be reached if CommandCase enum is exhaustive and checked upfront
					Logger.warn(
						`Received unknown or unhandled command case number: ${commandCase} from ${peer}, Req ID: ${requestId}`,
					)
					throw new Error(`Unhandled command case: ${commandCase}`)
			}
		} catch (error: any) {
			// Log the detailed error. The caller (in call.on('data')) will catch this re-throw
			// and send an ErrorUpdate back to the client.
			const commandTypeName = CommandRequest.CommandCase[commandCase] || `Unknown (${commandCase})`
			Logger.error(
				`Error processing command ${commandTypeName} from ${peer} (Req ID: ${requestId}): ${error.message}`,
				error,
			)
			// Re-throw the original error to ensure it's handled by the central error handler for the stream
			throw error
		}
	}

	// --- Helper to send specific update types ---

	/**
	 * Sends a TaskStateUpdate message back to a specific client stream.
	 * Typically used for acknowledging command requests like start/cancel.
	 * @param call The client's duplex stream.
	 * @param requestId The ID of the original request this update is responding to (optional).
	 * @param status A string indicating the task status (e.g., 'task_initiated', 'cancel_requested').
	 * @param taskId The relevant task ID (optional).
	 * @param message An optional descriptive message.
	 */
	private sendTaskStateUpdate(
		call: ServerDuplexStream,
		requestId: string | undefined,
		status: string,
		taskId?: string | null,
		message?: string,
	): void {
		// Allow null
		if (call.writableEnded) {
			Logger.warn(`Cannot send TaskStateUpdate (${status}) to ${call.getPeer()}, stream already ended.`)
			return
		}
		try {
			const taskUpdate = new TaskStateUpdate()
			taskUpdate.setStatus(status) // Use proto setters
			if (taskId) taskUpdate.setTaskId(taskId) // Allow string or null
			if (message) taskUpdate.setMessage(message)

			const response = new UpdateResponse()
			if (requestId) response.setResponseToRequestId(requestId) // Link to original request if applicable
			response.setTaskState(taskUpdate) // Set the oneof field

			call.write(response)
			Logger.debug(`Sent TaskStateUpdate (${status}) to ${call.getPeer()}${requestId ? " for Req ID: " + requestId : ""}`)
		} catch (e: any) {
			Logger.error(`Failed to send TaskStateUpdate (${status}) to client ${call.getPeer()}: ${e.message}`, e)
		}
	}

	/**
	 * Sends an ErrorUpdate message back to a specific client stream.
	 * @param call The client's duplex stream.
	 * @param requestId The ID of the original request that caused the error (optional).
	 * @param message The primary error message.
	 * @param details Additional error details (optional).
	 * @param errorType A category for the error (e.g., 'bad_request', 'internal_error').
	 */
	private sendErrorUpdate(
		call: ServerDuplexStream,
		requestId: string | undefined,
		message: string,
		details?: string,
		errorType: string = "internal_error",
	): void {
		if (call.writableEnded) {
			Logger.warn(`Cannot send ErrorUpdate to ${call.getPeer()}, stream already ended.`)
			return
		}
		try {
			const errorUpdate = new ErrorUpdate()
			errorUpdate.setMessage(message)
			if (details) errorUpdate.setDetails(details)
			errorUpdate.setErrorType(errorType)

			const response = new UpdateResponse()
			if (requestId) response.setResponseToRequestId(requestId)
			response.setErrorUpdate(errorUpdate)

			call.write(response)
			Logger.debug(`Sent ErrorUpdate (${errorType}) to ${call.getPeer()}${requestId ? " for Req ID: " + requestId : ""}`)
		} catch (e: any) {
			Logger.error(`Failed to send ErrorUpdate (${errorType}) to client ${call.getPeer()}: ${e.message}`, e)
		}
	}

	// --- State Fetching and Translation ---

	/**
	 * Fetches the current state from the Controller and translates it
	 * into the gRPC InitialStateUpdate message format.
	 * @returns {Promise<InitialStateUpdate>} The translated initial state.
	 */
	private async getInitialState(): Promise<InitialStateUpdate> {
		Logger.info("Fetching and translating initial state for gRPC client...")
		const initialStateResponse = new InitialStateUpdate() // Create instance using generated constructor
		try {
			// Fetch the comprehensive state object used for the webview
			const state: ExtensionState = await this.controller.getStateToPostToWebview()

			// Translate ClineMessages to the proto format
			// Ensure we filter only for actual ClineMessage types before mapping
			const actualClineMessages = (state.clineMessages || []).filter(
				(msg): msg is ClineMessage => !!msg && (msg.type === "ask" || msg.type === "say"),
			)
			const protoMessages: ClineMessageProto[] = actualClineMessages
				.map((msg) => this.translateClineMessage(msg))
				// Filter out any messages that failed translation (returned null)
				.filter((msg): msg is ClineMessageProto => msg !== null)

			// Translate settings (API Configuration) into a proto Struct
			const settingsStruct = convertToProtoStruct(state.apiConfiguration || {})

			// Populate the InitialStateUpdate message using generated setters
			initialStateResponse.setExtensionVersion(state.version || "unknown")
			initialStateResponse.setMessagesList(protoMessages) // Sets the repeated field

			if (settingsStruct) {
				initialStateResponse.setSettings(settingsStruct)
			} else {
				Logger.warn("Could not convert apiConfiguration to proto Struct for initial state. Sending empty settings.")
				initialStateResponse.setSettings(new Struct()) // Send empty struct if conversion failed
			}

			// Determine task status based on the fetched state object
			const currentTask = state.currentTaskItem as HistoryItem | undefined // Use the 'state' variable fetched above
			initialStateResponse.setCurrentTaskStatus(currentTask ? "running" : "idle")
			initialStateResponse.setCurrentTaskId(currentTask?.id || "") // Use optional chaining and provide default

			Logger.info(
				`Successfully fetched and translated initial state. Messages: ${protoMessages.length}, Task: ${initialStateResponse.getCurrentTaskStatus()}, Task ID: ${currentTask?.id || "none"}`,
			)
			return initialStateResponse
		} catch (error: any) {
			Logger.error(`Error fetching or translating initial state: ${error.message}`, error)
			// Return a state indicating an error occurred
			initialStateResponse.setExtensionVersion("error")
			const errorStruct = convertToProtoStruct({ error: `Failed to fetch state: ${error.message}` })
			if (errorStruct) {
				initialStateResponse.setSettings(errorStruct)
			}
			initialStateResponse.setCurrentTaskStatus("error")
			initialStateResponse.setCurrentTaskId("")
			initialStateResponse.clearMessagesList() // Clear any potentially partial list
			return initialStateResponse
		}
	}

	/**
	 * Translates internal Controller update data (received via event listener)
	 * into a gRPC UpdateResponse message suitable for broadcasting.
	 * This requires the Controller eventing mechanism to be fully defined and implemented.
	 * @param updateData - The data object received from the Controller event listener. Expected to have 'type' (string) and 'payload' (any).
	 * @returns {UpdateResponse | null} The translated gRPC message, or null if translation fails or the event type is unhandled.
	 */
	private translateUpdate(updateData: { type: string; payload: any }): UpdateResponse | null {
		// This depends heavily on the structure of events emitted by the Controller.
		// Assume `updateData` has a `type` field (string) and a `payload` field (any).

		if (!updateData || typeof updateData.type !== "string" || updateData.payload === undefined) {
			Logger.warn(`translateUpdate: Received invalid update data structure: ${JSON.stringify(updateData)}`)
			return null
		}

		const internalEventType = updateData.type // e.g., 'addMessage', 'partialMessage', 'error', 'requestToolApproval', 'taskStateChange'
		const payload = updateData.payload // The data associated with the event
		const response = new UpdateResponse() // Create the response wrapper

		Logger.debug(`Translating internal update type: ${internalEventType}`)

		try {
			switch (internalEventType) {
				// --- Message Updates ---
				case "addMessage": // Event indicating a full ClineMessage was added
					// Validate payload is a valid ClineMessage ('ask' or 'say')
					if (!payload || (payload.type !== "ask" && payload.type !== "say")) {
						Logger.warn(
							`translateUpdate: Invalid payload for 'addMessage'. Expected ClineMessage, got: ${JSON.stringify(payload)}`,
						)
						return null
					}
					const addedMessage = payload as ClineMessage
					const translatedMsg = this.translateClineMessage(addedMessage) // Use the dedicated translator
					if (!translatedMsg) {
						// Error logged within translateClineMessage
						return null
					}

					const addMsgUpdate = new AddMessageUpdate() // Create specific update type instance
					addMsgUpdate.setMessage(translatedMsg) // Set the field
					response.setAddMessage(addMsgUpdate) // Set the oneof field on the main response
					break

				case "partialMessage": // Event indicating a partial update to an existing message
					// Validate payload structure: id (string), text (string)
					// Assuming 'id' corresponds to the message timestamp string used in translateClineMessage
					if (!payload || typeof payload.id !== "string" || typeof payload.text !== "string") {
						Logger.warn(
							`translateUpdate: Invalid payload for 'partialMessage'. Expected {id: string, text: string}, got: ${JSON.stringify(payload)}`,
						)
						return null
					}
					const partial = payload as { id: string; text: string }

					const partialUpdate = new PartialMessageUpdate()
					partialUpdate.setMessageId(partial.id) // Use the id from the event payload
					partialUpdate.setTextChunk(partial.text) // The new text chunk
					response.setPartialMessage(partialUpdate)
					break

				// --- Error Updates (intended for broadcast) ---
				case "broadcastError": // Use a distinct type for errors meant for all clients
					// Validate payload: text (string), details (string, optional), type (string, optional)
					if (!payload || typeof payload.text !== "string") {
						Logger.warn(
							`translateUpdate: Invalid payload for 'broadcastError'. Expected {text: string, ...}, got: ${JSON.stringify(payload)}`,
						)
						return null
					}
					const errorPayload = payload as { text: string; details?: string; type?: string }

					const errorUpdate = new ErrorUpdate()
					errorUpdate.setMessage(errorPayload.text) // User-facing error message
					if (errorPayload.details) errorUpdate.setDetails(errorPayload.details)
					errorUpdate.setErrorType(errorPayload.type || "task_error") // Default type if not provided
					response.setErrorUpdate(errorUpdate)
					break

				// --- Tool Approval Request (assuming specific event from Controller) ---
				// This assumes the Controller emits a specific event when it needs gRPC to ask for approval,
				// separate from just adding a generic 'ask' message.
				case "requestToolApproval":
					// Validate payload matches ToolApprovalRequest structure
					// Use field names from .proto (snake_case)
					if (!payload || typeof payload.tool_call_id !== "string" || typeof payload.tool_name !== "string") {
						Logger.warn(
							`translateUpdate: Invalid payload for 'requestToolApproval'. Expected {tool_call_id: string, tool_name: string, ...}, got: ${JSON.stringify(payload)}`,
						)
						return null
					}
					// Define expected payload structure based on proto
					const toolAskPayload = payload as {
						tool_call_id: string
						tool_name: string
						tool_input: any // Input can be complex
						message?: string // Optional prompt message
					}

					const toolApprovalReq = new ToolApprovalRequest()
					toolApprovalReq.setToolCallId(toolAskPayload.tool_call_id)
					toolApprovalReq.setToolName(toolAskPayload.tool_name)
					// Safely stringify input, defaulting to empty JSON object if missing/invalid
					try {
						toolApprovalReq.setToolInputJson(JSON.stringify(toolAskPayload.tool_input ?? {}))
					} catch (jsonError: any) {
						Logger.error(
							`Failed to stringify tool input for approval request (ID: ${toolAskPayload.tool_call_id}): ${jsonError.message}`,
							jsonError,
						)
						toolApprovalReq.setToolInputJson("{}") // Send empty JSON object on error
					}
					toolApprovalReq.setMessage(toolAskPayload.message || `Approve tool use: ${toolAskPayload.tool_name}?`) // Default prompt
					response.setToolApprovalRequest(toolApprovalReq)
					break

				// --- Task State Changes (for broadcast) ---
				case "taskStateChange": // Event indicating task status changed (e.g., started, cancelled, completed, running)
					// Validate payload: status (string), taskId (string, optional), message (string, optional)
					if (!payload || typeof payload.status !== "string") {
						Logger.warn(
							`translateUpdate: Invalid payload for 'taskStateChange'. Expected {status: string, ...}, got: ${JSON.stringify(payload)}`,
						)
						return null
					}
					const taskState = payload as { status: string; taskId?: string; message?: string }

					const taskStateUpdate = new TaskStateUpdate()
					// TODO: Consider mapping internal status strings ('running', 'idle') to specific proto enums/strings if defined
					taskStateUpdate.setStatus(taskState.status)
					if (taskState.taskId) taskStateUpdate.setTaskId(taskState.taskId)
					if (taskState.message) taskStateUpdate.setMessage(taskState.message)
					response.setTaskState(taskStateUpdate)
					break

				// --- Add other cases based on Controller events as needed ---
				// case 'settingsUpdated':
				//    const settingsStruct = convertToProtoStruct(payload);
				//    if (settingsStruct) {
				//       const settingsUpdate = new SettingsUpdate(); // Assuming this type exists
				//       settingsUpdate.setSettings(settingsStruct);
				//       response.setSettingsUpdate(settingsUpdate);
				//    } else { Logger.warn("Failed to translate settings for 'settingsUpdated' event."); return null; }
				//    break;

				default:
					// Only log as a warning, as some internal events might not need broadcasting
					Logger.debug(`translateUpdate: Unhandled internal update type for gRPC broadcast: ${internalEventType}`)
					return null // Return null for unhandled types (don't broadcast)
			}

			// Final check: Ensure *some* update field was actually set on the response
			if (response.getUpdateCase() === UpdateResponse.UpdateCase.UPDATE_NOT_SET) {
				// This could happen if an event type was handled, but translation failed internally (e.g., bad payload)
				Logger.warn(
					`translateUpdate: Translation logic completed for type ${internalEventType}, but no field was set on UpdateResponse. Payload: ${JSON.stringify(payload)}`,
				)
				return null // Nothing was successfully translated or set
			}

			return response // Return the populated response object
		} catch (error: any) {
			// Catch errors during the translation process itself
			Logger.error(
				`Error translating internal update data (type: ${internalEventType}): ${error?.message || "Unknown error"}`,
				error,
			)
			return null // Return null on any translation error
		}
	}

	/**
	 * Translates an internal ClineMessage object (type 'ask' or 'say') into the gRPC ClineMessage proto format.
	 * @param msg The internal ClineMessage object (must be type 'ask' or 'say').
	 * @returns {ClineMessageProto | null} The translated proto message, or null if translation fails or type is invalid.
	 */
	private translateClineMessage(msg: ClineMessage): ClineMessageProto | null {
		// Strict check for valid message types handled by this translator
		if (!msg || (msg.type !== "ask" && msg.type !== "say")) {
			Logger.warn(`translateClineMessage called with invalid message type: ${msg?.type}. Expected 'ask' or 'say'.`)
			return null
		}

		const protoMsg = new ClineMessageProto() // Create instance using generated constructor
		try {
			// Role is consistently 'assistant' for messages originating from Cline (ask/say)
			const role = "assistant"

			// Use timestamp as the primary ID source. It's crucial for identifying messages.
			// Fallback to Date.now() string ONLY if ts is absolutely missing, but log a warning.
			let messageId: string
			if (typeof msg.ts === "number" && isFinite(msg.ts)) {
				messageId = msg.ts.toString()
			} else {
				Logger.warn(`ClineMessage (type ${msg.type}) is missing a valid 'ts' timestamp. Using Date.now() as fallback ID.`)
				messageId = Date.now().toString()
			}

			// Set basic fields using generated setters
			protoMsg.setId(messageId)
			protoMsg.setRole(role)
			protoMsg.setType(msg.type) // Maps 'ask' or 'say' directly

			// Convert timestamp using the helper
			const timestamp = convertToProtoTimestamp(msg.ts)
			if (timestamp) {
				protoMsg.setTimestamp(timestamp)
			} else if (msg.ts !== undefined && msg.ts !== null) {
				// Log if timestamp was present but conversion failed (already logged in helper)
				Logger.warn(`Timestamp conversion failed for message ID ${messageId}. Timestamp field will be unset.`)
			}

			// Extract and convert content payload to a Protobuf Struct
			const contentData = this.extractContentData(msg) // Get the JS object payload
			const contentStruct = convertToProtoStruct(contentData) // Convert to proto Struct
			if (contentStruct) {
				protoMsg.setContent(contentStruct)
			} else {
				// Log if content extraction/conversion failed
				Logger.warn(
					`Failed to extract or convert content to Struct for message ID ${messageId}. Content field will be empty or indicate error.`,
				)
				// Set an empty struct or a struct indicating an error
				protoMsg.setContent(Struct.fromJavaScript({ _translation_error: "Failed to convert content" }))
			}

			return protoMsg // Return the successfully populated proto message
		} catch (error: any) {
			// Log the error with context (message timestamp if available)
			Logger.error(`Error translating ClineMessage (TS: ${msg?.ts}, Type: ${msg?.type}): ${error.message}`, error)
			return null // Return null on any exception during translation
		}
	}

	/**
	 * Extracts the relevant data payload from an internal ClineMessage ('ask' or 'say')
	 * into a plain JavaScript object suitable for conversion into a Protobuf Struct.
	 * @param msg The internal ClineMessage object (validated to be 'ask' or 'say' by caller).
	 * @returns {any} A JavaScript object representing the core content.
	 */
	private extractContentData(msg: ClineMessage): any {
		// Assumes msg.type is either 'ask' or 'say'
		const baseContent: any = {}

		// Common fields
		if (msg.lastCheckpointHash) {
			baseContent.lastCheckpointHash = msg.lastCheckpointHash
			// Ensure boolean representation
			baseContent.isCheckpointCheckedOut = !!msg.isCheckpointCheckedOut
		}
		if (msg.images && msg.images.length > 0) {
			// Assume images are strings (e.g., base64 or URIs) compatible with JSON/Struct
			baseContent.images = msg.images
		}

		switch (msg.type) {
			case "say":
				// Core content for 'say' is the text itself
				baseContent.text = msg.say ?? "" // Use 'say' field, default to empty string if null/undefined
				if (msg.reasoning) {
					baseContent.reasoning = msg.reasoning
				}
				return baseContent

			case "ask":
				// Core content for 'ask' includes the type of question and the prompt text
				baseContent.ask_type = msg.ask // The 'ask' field value (e.g., 'tool', 'followup', etc.)
				baseContent.text = msg.text ?? "" // The user-facing question/prompt text

				// If msg.ask is an object (like for tool approval details), include its raw structure.
				// This might be redundant if a specific 'requestToolApproval' event exists,
				// but could be useful for generic 'ask' types displayed to the client.
				if (typeof msg.ask === "object" && msg.ask !== null) {
					baseContent.ask_details = msg.ask // Include the raw object
				}
				return baseContent
		}
		// Should not be reached due to prior type check, but added for safety.
		Logger.error(`extractContentData reached unexpected state with message type: ${msg.type}`)
		return { _extraction_error: `Unhandled message type ${msg.type}` }
	}

	// --- Cleanup ---
	/**
	 * Cleans up resources when the handler is no longer needed (e.g., during extension deactivation).
	 * Removes event listeners and gracefully closes active client streams.
	 */
	public dispose(): void {
		Logger.info("Disposing ClineControllerHandler...")
		// TODO: Unsubscribe from Controller events here
		// Example:
		// this.controller.off('addMessage', ...);
		// this.controller.off('partialMessage', ...);
		// etc.
		Logger.info("Controller event listeners need to be explicitly removed here.")

		const streamCount = this.activeStreams.size
		if (streamCount > 0) {
			Logger.info(`Closing ${streamCount} active gRPC stream(s)...`)
			this.activeStreams.forEach((stream, peer) => {
				try {
					// Attempt to gracefully end the stream from the server side
					if (!stream.writableEnded) {
						stream.end()
						Logger.debug(`Gracefully ended gRPC stream for peer: ${peer}`)
					}
				} catch (e: any) {
					// Log error if ending the stream fails (client might have already disconnected abruptly)
					Logger.error(`Error ending stream for peer ${peer} during dispose: ${e.message}`, e)
				}
			})
			// Clear the map of active streams after attempting closure
			this.activeStreams.clear()
		} else {
			Logger.info("No active gRPC streams to close.")
		}
		Logger.info("ClineControllerHandler disposed.")
	}
}

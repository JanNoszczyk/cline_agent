import * as http from "http"
import WebSocket, { WebSocketServer } from "ws"
import { URL } from "url"
import * as vscode from "vscode"
import { Anthropic } from "@anthropic-ai/sdk" // Add Anthropic import
import { Controller } from "../core/controller" // Import Controller
import { WebviewProvider } from "../core/webview" // Import WebviewProvider
import { Logger } from "../services/logging/Logger"
import pWaitFor from "p-wait-for" // Add import
import { processNewUserInput } from "./user_input_handler" // Import the handler
// Import necessary types if not implicitly available via Controller/WebviewProvider
// import { HistoryItem } from "../shared/HistoryItem";
// import { ApiConfiguration } from "../shared/api";
// import { ChatSettings } from "@shared/ChatSettings";

// For TypeScript support, let's use a simpler approach with type assertions
type AnyKey = string

// Remove ClineProvider specific augmentation
// declare module "../core/webview/ClineProvider" { ... }

// Define WebSocket ready states
const WebSocketReadyState = {
	CONNECTING: 0,
	OPEN: 1,
	CLOSING: 2,
	CLOSED: 3,
}

// Message types for WebSocket communication
// Using camelCase to standardize with WebviewMessage
export enum MessageType {
	// Task Management
	TaskInit = "taskInit",
	TaskResume = "taskResume",
	TaskCancel = "taskCancel",
	TaskResponse = "taskResponse", // Response from user/UI
	UserMessage = "userMessage", // Message from UI/Backend

	// State Management
	StateRequest = "stateRequest", // Request state
	StateUpdate = "stateUpdate", // State update

	// Settings
	SettingsUpdate = "settingsUpdate",
	ChatModeUpdate = "chatModeUpdate",

	// Authentication
	AuthToken = "authToken",
	AuthUser = "authUser",
	AuthSignout = "authSignout",

	// MCP
	McpRequest = "mcpRequest",

	// File Operations
	FileOpen = "fileOpen",
	ImageOpen = "imageOpen",
	MentionOpen = "mentionOpen",
	ImagesSelected = "selectImages",

	// Checkpoint Operations
	CheckpointDiff = "checkpointDiff",
	CheckpointRestore = "checkpointRestore",
	CheckLatestChanges = "checkLatestChanges",

	// Subscription
	Subscribe = "subscribe", // Email subscription

	// Bridge-Specific Operations
	EventSubscribe = "eventSubscribe",
	EventUnsubscribe = "eventUnsubscribe",
	WebviewMessage = "webviewMessage", // Messages specifically for the webview

	// Connection & Misc
	Ping = "ping",
	Error = "error",
	// GoServerBroadcast = "goServerBroadcast", // No longer needed
}

// WebSocket message interface
interface WebSocketMessage {
	type: MessageType
	id?: string
	taskId?: string
	payload?: any
}

// Event subscription interface (for clients subscribing to this bridge)
interface EventSubscription {
	clientId: string
	eventTypes: string[]
}

// Bridge handler class
export class WebSocketBridgeServer {
	private controller: Controller // Store the Controller instance
	private webviewProvider: WebviewProvider // Store the WebviewProvider instance
	private server: http.Server
	private wss: WebSocketServer
	private port: number
	private apiKey: string // API key for clients connecting TO this bridge
	// private goServerApiKey: string // REMOVED - No longer connecting out to Go
	private clients: Map<WebSocket, { id: string; taskId?: string }>
	private heartbeatInterval: NodeJS.Timeout | null = null
	private activeConnections: number = 0 // Connections to THIS bridge server
	private isStarted: boolean = false
	private eventSubscriptions: Map<string, EventSubscription> = new Map() // Subscriptions to THIS bridge server's events

	// Properties for Go Server Client Connection - REMOVED
	// private goClient: WebSocket | null = null
	// private goServerUrl: string // URL will be determined dynamically
	// private reconnectInterval: NodeJS.Timeout | null = null
	// private isConnectingToGo = false
	// private readonly RECONNECT_DELAY = 5000 // 5 seconds

	private metrics: {
		messagesReceived: number // From bridge clients
		messagesSent: number // To bridge clients
		errors: number
		startTime: number
	} = {
		messagesReceived: 0,
		messagesSent: 0,
		errors: 0,
		startTime: Date.now(),
	}

	// Constructor updated to accept Controller and WebviewProvider
	constructor(controller: Controller, webviewProvider: WebviewProvider, port: number = 3002, apiKey: string = "") {
		this.controller = controller // Store the controller
		this.webviewProvider = webviewProvider // Store the webview provider
		this.port = port
		this.apiKey = apiKey // Key for clients connecting to THIS bridge
		Logger.log(`WebSocket Bridge Server configured for controller, listening on port ${port}`)

		// REMOVED logic related to goServerApiKey and goServerUrl

		this.clients = new Map()
		this.server = http.createServer(this.handleHttpRequest.bind(this))
		this.wss = new WebSocketServer({ noServer: true })

		// Set up WebSocket connection handling for clients connecting TO this bridge
		this.server.on("upgrade", (request, socket, head) => {
			// Extract API key from query parameters or headers
			const url = new URL(request.url || "", `http://${request.headers.host}`)
			const queryApiKey = url.searchParams.get("apiKey")
			const headerApiKey = request.headers["x-api-key"] as string

			// Validate API key if one is configured for THIS bridge server
			if (this.apiKey && this.apiKey !== queryApiKey && this.apiKey !== headerApiKey) {
				Logger.log("WebSocket: Unauthorized connection attempt to bridge server")
				socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
				socket.destroy()
				return
			}

			this.wss.handleUpgrade(request, socket, head, (ws) => {
				this.wss.emit("connection", ws, request)
			})
		})

		// Set up WebSocket message handling for clients connecting TO this bridge
		this.wss.on("connection", (ws: WebSocket) => {
			const clientId = Date.now().toString() + Math.random().toString(36).substring(2, 7)
			this.clients.set(ws, { id: clientId })
			this.activeConnections++
			Logger.log(`WebSocket: Client connected to bridge (ID: ${clientId}, Active: ${this.activeConnections})`)

			// Handle messages from clients connected to THIS bridge server
			ws.on("message", async (messageData: any) => {
				this.metrics.messagesReceived++
				let msgData: WebSocketMessage | null = null // Define outside try block
				try {
					const message = messageData.toString()
					Logger.log(`WebSocket: Received raw message from client ${this.clients.get(ws)?.id}: ${message}`) // <-- Added logging
					msgData = JSON.parse(message) as WebSocketMessage // Assign here

					// Process ALL messages locally using the bridge's logic
					// Process ALL messages locally using the bridge's logic
					// Pass controller and webviewProvider to the processing method if needed,
					// or access them via this.controller / this.webviewProvider
					const response = await this.processLocalMessage(msgData, ws)
					if (response) {
						const responseString = JSON.stringify(response)
						Logger.log(`WebSocket: Sending response to client ${this.clients.get(ws)?.id}: ${responseString}`) // <-- Added logging
						// Ensure ws is still open before sending
						if (ws.readyState === WebSocket.OPEN) {
							ws.send(responseString, (error) => {
								if (error) {
									Logger.log(
										`WebSocket: Error sending response to client ${this.clients.get(ws)?.id}: ${error.message}`,
									)
									this.metrics.errors++
								} else {
									this.metrics.messagesSent++
								}
							})
						} else {
							Logger.log(
								`WebSocket: Client ${this.clients.get(ws)?.id} disconnected before response could be sent.`,
							)
						}
					}
				} catch (error) {
					this.metrics.errors++
					const errorMessage = error instanceof Error ? error.message : "Unknown error"
					Logger.log(`WebSocket: Error processing message from bridge client: ${errorMessage}`)
					ws.send(
						JSON.stringify({
							type: MessageType.Error,
							id: msgData?.id, // Use optional chaining in case parsing failed
							payload: { error: errorMessage },
						}),
					)
					this.metrics.messagesSent++
				}
			})

			// Handle client disconnection from THIS bridge server
			ws.on("close", () => {
				const clientData = this.clients.get(ws)
				if (clientData) {
					// Remove any event subscriptions for this client
					this.eventSubscriptions.delete(clientData.id)
				}

				this.clients.delete(ws)
				this.activeConnections--
				Logger.log(`WebSocket: Client disconnected from bridge (Active: ${this.activeConnections})`)
			})

			// Send welcome message to client connecting TO this bridge
			try {
				const welcomeMessage = JSON.stringify({
					type: "connected",
					payload: {
						clientId,
						message: "Connected to Cline WebSocket Bridge",
						serverVersion: "2.0.2", // Updated version
						supportedFeatures: ["event_subscription"], // No longer forwarding to Go server
					},
				})
				// Ensure ws is still open before sending
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(welcomeMessage, (error) => {
						if (error) {
							Logger.log(`WebSocket: Error sending welcome message to client ${clientId}: ${error.message}`)
							this.metrics.errors++
							// Optionally close the connection if sending the welcome message fails
							// ws.close();
						} else {
							this.metrics.messagesSent++
						}
					})
				} else {
					Logger.log(`WebSocket: Client ${clientId} disconnected before welcome message could be sent.`)
				}
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : "Unknown error"
				Logger.log(`WebSocket: Error stringifying welcome message for client ${clientId}: ${errorMessage}`)
				// Optionally close the connection if stringify fails
				// ws.close();
			}
		})
	}

	/**
	 * Determines if a message type should be forwarded to the Go server.
	 * NOTE: Based on feedback, this should always return false now.
	 * Keeping the function structure for potential future changes but logic is disabled.
	 */
	private isMessageForGoServer(type: MessageType): boolean {
		// switch (type) {
		// 	case MessageType.TaskInit:
		// 	case MessageType.TaskResume:
		// 	case MessageType.TaskCancel:
		// 	case MessageType.TaskResponse:
		// 	case MessageType.StateRequest: // Requesting state FROM Go
		// 	// case MessageType.SettingsUpdate: // <-- Handled locally
		// 	case MessageType.ChatModeUpdate: // <-- Should likely be local via command
		// 	case MessageType.AuthToken:      // <-- Should likely be local via command
		// 	case MessageType.AuthUser:       // <-- Should likely be local via command
		// 	case MessageType.AuthSignout:    // <-- Should likely be local via command
		// 	case MessageType.McpRequest:     // <-- Should likely be local via command
		// 	case MessageType.FileOpen:       // <-- Handled locally
		// 	case MessageType.ImageOpen:      // <-- Handled locally
		// 	case MessageType.MentionOpen:    // <-- Handled locally
		// 	case MessageType.ImagesSelected: // <-- Handled locally
		// 	case MessageType.CheckpointDiff: // <-- Handled locally
		// 	case MessageType.CheckpointRestore: // <-- Handled locally
		// 	case MessageType.CheckLatestChanges: // <-- Handled locally
		// 	case MessageType.Subscribe: // Email subscription <-- Should likely be local via command
		// 		return true // No longer forwarding any of these
		// 	default:
		// 		return false
		// }
		return false // ALL messages are handled locally now
	}

	/**
	 * Connects to the Go WebSocket server. - REMOVED
	 */
	// private connectToGoServer() { ... } // REMOVED

	/**
	 * Sends a message string to the Go server if connected. - REMOVED
	 */
	// private sendMessageToGoServer(message: string) { ... } // REMOVED

	/**
	 * Broadcasts a message received from the Go server to connected bridge clients. - REMOVED
	 */
	// private broadcastMessageFromGo(message: WebSocketMessage) { ... } // REMOVED

	/**
	 * Starts the WebSocket server.
	 */
	public start(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.isStarted) {
				Logger.log(`WebSocket: Bridge server already running on port ${this.port}`)
				resolve()
				return
			}

			this.server
				.listen(this.port, () => {
					this.isStarted = true
					this.metrics.startTime = Date.now() // Reset start time
					Logger.log(`WebSocket: Bridge server started on port ${this.port}`)

					// Start heartbeat to keep bridge client connections alive
					this.heartbeatInterval = setInterval(() => {
						this.broadcastStateUpdates() // Broadcasts state to clients of THIS server
					}, 30000) // Send updates every 30 seconds

					// REMOVED: Attempt to connect to the Go server
					// this.connectToGoServer()

					resolve()
				})
				.on("error", (err) => {
					Logger.log(`WebSocket: Bridge server failed to start: ${err.message}`)
					reject(err)
				})
		})
	}

	/**
	 * Stops the WebSocket server and disconnects from the Go server.
	 */
	public stop(): Promise<void> {
		return new Promise((resolve) => {
			if (!this.isStarted) {
				resolve()
				return
			}
			this.isStarted = false // Mark as stopped immediately to prevent reconnects

			// Clear heartbeat interval for bridge clients
			if (this.heartbeatInterval) {
				clearInterval(this.heartbeatInterval)
				this.heartbeatInterval = null
			}

			// REMOVED: Clear reconnect interval for Go client
			// if (this.reconnectInterval) { ... }

			// REMOVED: Close Go client connection
			// if (this.goClient) { ... }

			// Close all client connections to this bridge server
			this.wss.clients.forEach((client) => {
				client.close()
			})

			// Close the HTTP server
			this.server.close(() => {
				this.clients.clear()
				this.activeConnections = 0
				Logger.log("WebSocket: Bridge server stopped")
				resolve()
			})
		})
	}

	/**
	 * Handles HTTP requests to the server (health, status, metrics).
	 */
	private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
		const url = new URL(req.url || "", `http://${req.headers.host}`)
		Logger.log(`WebSocket: Received HTTP request for path: ${url.pathname}`) // <-- Added logging

		// Health check endpoint
		if (url.pathname === "/health") {
			const responseBody = JSON.stringify({
				status: "ok",
				bridgeConnections: this.activeConnections,
				// goClientStatus: REMOVED
				uptime: process.uptime(),
			})
			Logger.log(`WebSocket: Sending HTTP response for /health: ${responseBody}`) // <-- Added logging
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(responseBody)
			return
		}

		// API key status
		if (url.pathname === "/status") {
			// Check API key for THIS bridge server
			const reqApiKey = req.headers["x-api-key"] as string
			if (this.apiKey && this.apiKey !== reqApiKey) {
				const errorBody = JSON.stringify({ error: "Unauthorized" })
				Logger.log(`WebSocket: Sending HTTP 401 response for /status (Unauthorized): ${errorBody}`) // <-- Added logging
				res.writeHead(401, { "Content-Type": "application/json" })
				res.end(errorBody)
				return
			}

			const statusBody = JSON.stringify(this.getStatus())
			Logger.log(`WebSocket: Sending HTTP response for /status: ${statusBody}`) // <-- Added logging
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(statusBody) // Use getStatus method
			return
		}

		// Metrics endpoint
		if (url.pathname === "/metrics") {
			// Check API key for THIS bridge server
			const reqApiKey = req.headers["x-api-key"] as string
			if (this.apiKey && this.apiKey !== reqApiKey) {
				const errorBody = JSON.stringify({ error: "Unauthorized" })
				Logger.log(`WebSocket: Sending HTTP 401 response for /metrics (Unauthorized): ${errorBody}`) // <-- Added logging
				res.writeHead(401, { "Content-Type": "application/json" })
				res.end(errorBody)
				return
			}

			const metricsBody = JSON.stringify(this.getStatus().metrics)
			Logger.log(`WebSocket: Sending HTTP response for /metrics: ${metricsBody}`) // <-- Added logging
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(metricsBody) // Use getStatus method
			return
		}

		// Default response for other routes
		const notFoundBody = JSON.stringify({ error: "Not found" })
		Logger.log(`WebSocket: Sending HTTP 404 response for path ${url.pathname}: ${notFoundBody}`) // <-- Added logging
		res.writeHead(404, { "Content-Type": "application/json" })
		res.end(notFoundBody)
	}

	/**
	 * Formats uptime in a human-readable format
	 */
	private formatUptime(ms: number): string {
		if (ms < 0) {
			return "N/A"
		}
		const seconds = Math.floor(ms / 1000)
		const minutes = Math.floor(seconds / 60)
		const hours = Math.floor(minutes / 60)
		const days = Math.floor(hours / 24)

		return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`
	}

	/**
	 * Process incoming WebSocket messages intended for the local bridge/controller.
	 */
	private async processLocalMessage(message: WebSocketMessage, ws: WebSocket): Promise<WebSocketMessage | null> {
		const { type, id, taskId, payload } = message
		const clientData = this.clients.get(ws)

		// Update taskId if provided (might be relevant for local processing too)
		if (taskId && clientData) {
			clientData.taskId = taskId
			this.clients.set(ws, clientData)
		}

		// --- Add detailed logging ---
		Logger.log(`WebSocket: Processing local message. Received type: "${type}" (Typeof: ${typeof type}), ID: ${id || "N/A"}`)
		Logger.log(
			`WebSocket: Comparing against MessageType.UserMessage which is: "${
				MessageType.UserMessage
			}" (Typeof: ${typeof MessageType.UserMessage})`,
		)
		// --- End detailed logging ---

		try {
			// Capture the type explicitly before the switch
			const receivedType = message.type
			Logger.log(`WebSocket: Value entering switch statement: "${receivedType}" (Typeof: ${typeof receivedType})`)

			// Access the stored controller and webviewProvider instances
			const controller = this.controller
			const webviewProvider = this.webviewProvider

			// Check if controller is available (it should be)
			if (!controller && type !== MessageType.Ping) {
				// Allow ping even without controller
				throw new Error("WebSocketBridgeServer: Controller instance not available")
			}

			// Process message based on type - Use the captured variable
			switch (receivedType) {
				case MessageType.Ping:
					return {
						type: MessageType.Ping, // Use enum for response type consistency
						id,
						payload: {
							timestamp: Date.now(),
							hasController: !!this.controller, // Check stored controller
						},
					}

				// Event subscription handlers (handled locally by the bridge)
				case MessageType.EventSubscribe:
					if (!clientData) {
						throw new Error("Client data not found")
					}
					const eventTypes = payload.eventTypes as string[]
					if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
						throw new Error("Event types must be a non-empty array")
					}
					this.eventSubscriptions.set(clientData.id, { clientId: clientData.id, eventTypes })
					return { type, id, payload: { success: true, subscribedEvents: eventTypes } }

				case MessageType.EventUnsubscribe:
					if (!clientData) {
						throw new Error("Client data not found")
					}
					this.eventSubscriptions.delete(clientData.id)
					return { type, id, payload: { success: true } }

				// --- Messages handled locally using the stored controller instance ---

				case MessageType.TaskInit: {
					if (!controller) {
						throw new Error("Controller required for TaskInit")
					}
					if (!payload?.task) {
						throw new Error("Payload 'task' required for TaskInit")
					}
					// Directly call controller method
					await controller.initClineWithTask(payload.task, payload.images || [])
					// Get task ID from controller state after initialization
					const state = await controller.getStateToPostToWebview()
					const currentTaskId = state.currentTaskItem?.id
					return { type, id, payload: { success: true, taskId: currentTaskId } }
				}

				case MessageType.TaskResume: {
					if (!controller) {
						throw new Error("Controller required for TaskResume")
					}
					if (!taskId) {
						throw new Error("taskId required for TaskResume")
					}
					if (!taskId) {
						throw new Error("taskId required for TaskResume")
					}
					// Need to implement or adapt task resumption logic in Controller
					const historyItem = (await controller.getTaskWithId(taskId)).historyItem
					if (historyItem) {
						await controller.initClineWithHistoryItem(historyItem) // This handles resumption
						Logger.log(`WebSocket: Resumed task ${taskId}`)
						return { type, id, payload: { success: true, message: `Resumed task ${taskId}` } }
					} else {
						throw new Error(`Task with ID ${taskId} not found for resumption.`)
					}
				}

				case MessageType.TaskCancel: {
					if (!controller) {
						throw new Error("Controller required for TaskCancel")
					}
					// Directly call controller method
					await controller.cancelTask()
					return { type, id, payload: { success: true } }
				}

				case MessageType.TaskResponse: {
					if (!controller) {
						throw new Error("Controller required for TaskResponse")
					}
					if (!payload?.response) {
						throw new Error("Payload 'response' required for TaskResponse")
					}
					// Use controller's handleWebviewMessage
					await controller.handleWebviewMessage({
						type: "askResponse",
						askResponse: payload.response,
						text: payload.text || "",
						images: payload.images || [],
					})
					return { type, id, payload: { success: true } }
				}

				case MessageType.UserMessage: {
					Logger.log(`WebSocket: Matched UserMessage case (ID: ${id || "N/A"})`)
					if (!controller?.task) {
						Logger.log(`WebSocket: Error - Active task required for UserMessage (ID: ${id || "N/A"})`)
						throw new Error("Active task required for UserMessage")
					}
					if (!payload?.content && !payload?.images?.length) {
						// Need either text or images
						Logger.log(
							`WebSocket: Error - Payload 'content' or 'images' required for UserMessage (ID: ${id || "N/A"})`,
						)
						throw new Error("Payload 'content' or 'images' required for UserMessage")
					}

					// Prepare UserContent (ensure it matches the type expected by processNewUserInput)
					// UserContent type is Array<Anthropic.ContentBlock | Anthropic.ImageBlockParam>
					const userContent: Array<Anthropic.TextBlock | Anthropic.ImageBlockParam> = [] // Corrected type
					if (payload.content) {
						// Add citations property to satisfy TextBlock type
						userContent.push({ type: "text", text: payload.content, citations: null }) // Use null instead of undefined
					}
					if (payload.images && Array.isArray(payload.images)) {
						payload.images.forEach((imgBase64: string) => {
							if (typeof imgBase64 === "string" && imgBase64.startsWith("data:image/")) {
								const mediaTypeMatch = imgBase64.match(/^data:(image\/.*?);base64,/)
								const mediaType = mediaTypeMatch ? mediaTypeMatch[1] : "image/png" // Default if match fails
								const data = imgBase64.split(",")[1]
								userContent.push({
									type: "image",
									// Correctly type the source object based on ImageBlockParam structure
									source: {
										type: "base64",
										media_type: mediaType as Anthropic.ImageBlockParam.Source["media_type"],
										data,
									},
								})
							} else {
								Logger.log(
									`WebSocket: Warning - Invalid image format received in UserMessage payload (ID: ${id || "N/A"})`,
								)
							}
						})
					}

					// Call the dedicated handler
					Logger.log(`WebSocket: Calling processNewUserInput for UserMessage (ID: ${id || "N/A"})`)
					await processNewUserInput(controller.task, userContent) // Pass the task instance and formatted content
					Logger.log(`WebSocket: Finished processNewUserInput for UserMessage (ID: ${id || "N/A"})`)

					return { type, id, payload: { success: true, message: "User message received and processing initiated" } }
				}

				case MessageType.StateRequest: {
					if (!controller) {
						throw new Error("Controller required for StateRequest")
					}
					// Directly call controller method
					const state = await controller.getStateToPostToWebview()
					return { type, id, payload: { success: true, state } }
				}
				case MessageType.SettingsUpdate: {
					Logger.log(`WebSocket: Entering SettingsUpdate case for message ID: ${id || "N/A"}`)
					if (!controller) {
						throw new Error("Controller required for SettingsUpdate")
					}
					if (!payload) {
						throw new Error("Payload required for SettingsUpdate")
					}
					Logger.log(`WebSocket: Calling controller.handleWebviewMessage (updateSettings)`)
					// Use the existing handleWebviewMessage logic for 'updateSettings'
					await controller.handleWebviewMessage({
						type: "updateSettings",
						apiConfiguration: payload.apiConfiguration, // Assuming payload structure
						customInstructionsSetting: payload.customInstructionsSetting,
						telemetrySetting: payload.telemetrySetting,
						planActSeparateModelsSetting: payload.planActSeparateModelsSetting,
					})
					Logger.log(`WebSocket: Finished SettingsUpdate via handleWebviewMessage for ID: ${id || "N/A"}`)
					return { type, id, payload: { success: true } }
				}

				case MessageType.ChatModeUpdate: {
					if (!controller) {
						throw new Error("Controller required for ChatModeUpdate")
					}
					if (!payload) {
						throw new Error("Payload required for ChatModeUpdate")
					}
					// Directly call controller method
					await controller.togglePlanActModeWithChatSettings(payload)
					return { type, id, payload: { success: true } }
				}

				case MessageType.AuthToken: {
					if (!controller) {
						throw new Error("Controller required for AuthToken")
					}
					if (!payload?.token) {
						throw new Error("Payload 'token' required for AuthToken")
					}
					Logger.log(`WebSocket: AuthToken handling. Need to implement/adapt in Controller.`)
					// Example: await controller.handleAuthToken(payload.token);
					return { type, id, payload: { success: true, message: "AuthToken handling pending" } }
				}

				case MessageType.AuthUser: {
					if (!controller) {
						throw new Error("Controller required for AuthUser")
					}
					if (!payload?.user) {
						throw new Error("Payload 'user' required for AuthUser")
					}
					// Call Controller's setUserInfo
					await controller.setUserInfo(payload.user)
					await controller.postStateToWebview() // Update UI
					return { type, id, payload: { success: true, message: "User info updated" } }
				}

				case MessageType.AuthSignout: {
					if (!controller) {
						throw new Error("Controller required for AuthSignout")
					}
					// Call Controller's handleSignOut
					await controller.handleSignOut()
					return { type, id, payload: { success: true, message: "Signed out" } }
				}

				case MessageType.McpRequest: {
					if (!controller) {
						throw new Error("Controller required for McpRequest")
					}
					if (!payload) {
						throw new Error("Payload required for McpRequest")
					}
					Logger.log(`WebSocket: McpRequest handling. Need to implement/adapt in Controller or McpHub.`)
					// Example: const mcpResponse = await controller.mcpHub?.handleRequest(payload);
					return { type, id, payload: { success: true, message: "McpRequest handling pending" } }
				}

				// --- VS Code API Interactions (Keep using commands for simplicity) ---
				case MessageType.FileOpen: {
					if (!payload?.filePath) {
						throw new Error("Payload 'filePath' required for FileOpen")
					}
					// Use VS Code command for this
					await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(payload.filePath))
					return { type, id, payload: { success: true } }
				}

				case MessageType.ImageOpen: {
					if (!payload?.imagePath) {
						throw new Error("Payload 'imagePath' required for ImageOpen")
					}
					// Use VS Code command for this
					await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(payload.imagePath))
					return { type, id, payload: { success: true } }
				}

				// --- Controller Interactions ---
				case MessageType.MentionOpen: {
					if (!controller) {
						throw new Error("Controller required for MentionOpen")
					}
					if (!payload?.mention) {
						throw new Error("Payload 'mention' required for MentionOpen")
					}
					// Use controller's handleWebviewMessage
					await controller.handleWebviewMessage({
						type: "openMention",
						text: payload.mention,
					})
					return { type, id, payload: { success: true } }
				}

				case MessageType.ImagesSelected: {
					if (!controller) {
						throw new Error("Controller required for ImagesSelected")
					}
					// Use controller's handleWebviewMessage to trigger selection
					await controller.handleWebviewMessage({
						type: "selectImages",
					})
					// The result will come back asynchronously via a different message type ('selectedImages')
					// For now, just acknowledge the request was processed.
					return { type, id, payload: { success: true, message: "Image selection initiated." } }
				}

				case MessageType.CheckpointDiff: {
					if (!controller?.task) {
						// Checkpoints are handled by the Task instance within the Controller
						throw new Error("Active task required for CheckpointDiff")
					}
					if (payload?.messageTs === undefined) {
						throw new Error("Payload 'messageTs' required for CheckpointDiff")
					}
					// Call method on the current task via controller
					await controller.task.presentMultifileDiff(
						payload.messageTs,
						payload.seeNewChangesSinceLastTaskCompletion || false,
					)
					return { type, id, payload: { success: true } }
				}
				case MessageType.CheckpointRestore: {
					if (!controller?.task) {
						throw new Error("Active task required for CheckpointRestore")
					}
					if (payload?.messageTs === undefined) {
						throw new Error("Payload 'messageTs' required for CheckpointRestore")
					}
					if (!payload?.restoreType) {
						throw new Error("Payload 'restoreType' required for CheckpointRestore")
					}
					// Call method on the current task via controller
					// Note: Controller might need adaptation for cancellation/re-init logic here
					await controller.cancelTask() // Existing logic in controller might handle this
					await pWaitFor(() => controller.task?.isInitialized === true, { timeout: 3_000 })
					await controller.task?.restoreCheckpoint(payload.messageTs, payload.restoreType)
					return { type, id, payload: { success: true } }
				}
				case MessageType.CheckLatestChanges: {
					if (!controller?.task) {
						throw new Error("Active task required for CheckLatestChanges")
					}
					// Call method on the current task via controller
					const hasChanges = await controller.task.doesLatestTaskCompletionHaveNewChanges()
					return { type, id, payload: { success: true, hasChanges } }
				}

				case MessageType.Subscribe: {
					if (!controller) {
						throw new Error("Controller required for Subscribe")
					}
					if (!payload?.email) {
						throw new Error("Payload 'email' required for Subscribe")
					}
					Logger.log(`WebSocket: Subscribe handling. Need to implement/adapt in Controller.`)
					// Example: await controller.subscribeEmail(payload.email);
					return { type, id, payload: { success: true, message: "Subscribe handling pending" } }
				}

				// --- Bridge Specific ---
				case MessageType.WebviewMessage:
					if (!controller) {
						// Check controller, as it has the method
						throw new Error("Controller not available for WebviewMessage")
					}
					// Forward message directly to the webview via controller
					await controller.postMessageToWebview(payload) // Assuming payload is the message for webview
					return { type, id, payload: { success: true } }

				default:
					Logger.log(`WebSocket: Error - Unknown or unhandled local message type: "${type}" (ID: ${id || "N/A"})`)
					throw new Error(`Unknown or unhandled local message type: ${receivedType}`)
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error"
			Logger.log(`WebSocket: Error handling local message: ${errorMessage}`)
			return {
				type: MessageType.Error,
				id,
				payload: { success: false, error: errorMessage },
			}
		}
	}

	/**
	 * Broadcasts state updates (from local controller) to subscribed bridge clients.
	 */
	private async broadcastStateUpdates() {
		try {
			// Use the stored controller instance
			const controller = this.controller
			if (!controller) {
				Logger.log("WebSocket: Cannot broadcast state, controller instance not available in WebSocketBridgeServer.")
				return
			}

			const state = await controller.getStateToPostToWebview()

			this.wss.clients.forEach((client) => {
				if (client.readyState === WebSocketReadyState.OPEN) {
					const clientData = this.clients.get(client)
					if (!clientData) {
						return
					}

					const subscription = this.eventSubscriptions.get(clientData.id)
					if (
						subscription &&
						!subscription.eventTypes.includes("*") &&
						!subscription.eventTypes.includes("state") && // Check for generic 'state'
						!subscription.eventTypes.includes(MessageType.StateUpdate) // Check for specific type
					) {
						return // Skip if not subscribed
					}

					const stateUpdateString = JSON.stringify({
						type: MessageType.StateUpdate, // State update from local provider
						payload: { state },
					})
					Logger.log(`WebSocket: Broadcasting state update to client ${clientData.id}`) // <-- Added logging
					client.send(stateUpdateString)
					// Don't increment metrics here, this is internal broadcast
				}
			})
		} catch (error) {
			Logger.log(`WebSocket: Error broadcasting state updates: ${error instanceof Error ? error.message : "Unknown error"}`)
		}
	}

	/**
	 * Broadcasts a message to all bridge clients associated with a specific taskId.
	 * (Used for messages originating locally or potentially from Go if filtered).
	 */
	public broadcastToTask(taskId: string, message: WebSocketMessage) {
		this.clients.forEach((clientData, client) => {
			if (clientData.taskId === taskId && client.readyState === WebSocketReadyState.OPEN) {
				const subscription = this.eventSubscriptions.get(clientData.id)
				if (subscription && !subscription.eventTypes.includes("*") && !subscription.eventTypes.includes(message.type)) {
					return // Skip if not subscribed
				}
				const messageString = JSON.stringify(message)
				Logger.log(`WebSocket: Broadcasting message type ${message.type} to client ${clientData.id} for task ${taskId}`) // <-- Added logging
				client.send(messageString)
				this.metrics.messagesSent++ // Count messages sent to bridge clients
			}
		})
	}

	/**
	 * Broadcasts a generic event (originating locally) to subscribed bridge clients.
	 */
	public broadcastEvent(eventType: string, payload: any) {
		const message: WebSocketMessage = {
			type: eventType as MessageType, // Cast, assuming eventType matches MessageType enum
			payload,
		}

		this.clients.forEach((clientData, client) => {
			if (client.readyState !== WebSocketReadyState.OPEN) {
				return
			}

			const subscription = this.eventSubscriptions.get(clientData.id)
			if (!subscription) {
				return
			}

			if (subscription.eventTypes.includes("*") || subscription.eventTypes.includes(eventType)) {
				const messageString = JSON.stringify(message)
				Logger.log(`WebSocket: Broadcasting event type ${eventType} to client ${clientData.id}`) // <-- Added logging
				client.send(messageString)
				this.metrics.messagesSent++ // Count messages sent to bridge clients
			}
		})
	}

	/**
	 * Updates API key for authentication for clients connecting TO this bridge.
	 */
	public updateApiKey(apiKey: string) {
		this.apiKey = apiKey
		Logger.log("WebSocket: Bridge server API key updated")
	}

	/**
	 * Updates API key for connecting TO the Go server.
	 */
	// public updateGoServerApiKey(apiKey: string) { ... } // REMOVED - No longer connecting out

	/**
	 * Returns server status including Go client connection state.
	 */
	public getStatus() {
		const uptimeMs = this.isStarted ? Date.now() - this.metrics.startTime : 0

		return {
			running: this.isStarted,
			port: this.port,
			bridgeConnections: this.activeConnections,
			// goClient: { ... }, // REMOVED
			metrics: {
				uptime: uptimeMs,
				uptimeHuman: this.formatUptime(uptimeMs),
				messagesReceived: this.metrics.messagesReceived,
				messagesSent: this.metrics.messagesSent,
				errors: this.metrics.errors,
				messagesPerSecond: uptimeMs > 0 ? this.metrics.messagesReceived / (uptimeMs / 1000) : 0,
			},
			subscriptions: Array.from(this.eventSubscriptions.values()),
		}
	}
}

// Singleton instance
let websocketServer: WebSocketBridgeServer | null = null

/**
 * Gets or creates the WebSocket bridge server instance.
 * Requires the Controller and WebviewProvider instances.
 */
export function getWebSocketBridgeServer(
	controller: Controller,
	webviewProvider: WebviewProvider,
	port: number = 3002,
	apiKey: string = "",
): WebSocketBridgeServer {
	if (!websocketServer) {
		Logger.log(`WebSocket: Creating new WebSocketBridgeServer instance for controller on port ${port}`)
		websocketServer = new WebSocketBridgeServer(controller, webviewProvider, port, apiKey)
	} else {
		// If the server already exists, we should potentially update its controller/provider references
		// if they could change (e.g., if a new WebviewProvider is created).
		// However, given the singleton pattern in the original code, let's assume
		// the initial controller/provider are sufficient for the lifetime.
		// Log a warning if a new instance tries to overwrite.
		Logger.log(
			`WebSocket: Returning existing WebSocketBridgeServer instance. Controller/Provider updates not supported without restart.`,
		)
		// Optionally update apiKey if needed: websocketServer.updateApiKey(apiKey);
	}
	return websocketServer
}

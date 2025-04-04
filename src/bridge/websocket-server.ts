import * as http from "http"
// Use default import for WebSocket class
import WebSocket, { WebSocketServer } from "ws"
import { URL } from "url"
import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { Logger } from "../services/logging/Logger"

// For TypeScript support, let's use a simpler approach with type assertions
type AnyKey = string

// Add missing methods to ClineProvider for typechecking
// This doesn't change the actual implementation, just helps TypeScript
declare module "../core/webview/ClineProvider" {
	interface ClineProvider {
		handleWebviewAskResponse?: (response: any, text: string, images: string[]) => Promise<void>
		setAuthToken?: (token: string) => Promise<void>
		subscribeEmail?: (email: string) => Promise<void>
		// Allow any string keys for getGlobalState and updateGlobalState
		getGlobalState(key: string): Promise<any>
		updateGlobalState(key: string, value: any): Promise<void>
	}
}

// Define WebSocket ready states
const WebSocketReadyState = {
	CONNECTING: 0,
	OPEN: 1,
	CLOSING: 2,
	CLOSED: 3,
}

// Message types for WebSocket communication
// Align with Go server's expected types where applicable
export enum MessageType {
	// Task Management (Forwarded to Go)
	TaskInit = "task_init",
	TaskResume = "task_resume",
	TaskCancel = "task_cancel",
	TaskResponse = "task_response", // Response from user/UI to Go

	// State Management (Partially handled locally, partially forwarded)
	StateRequest = "state_request", // Request state FROM Go
	StateUpdate = "state_update", // State update FROM Go or local provider

	// Settings (Forwarded to Go)
	SettingsUpdate = "settings_update",
	ChatModeUpdate = "chat_mode_update",

	// Authentication (Forwarded to Go)
	AuthToken = "auth_token",
	AuthUser = "auth_user",
	AuthSignout = "auth_signout",

	// MCP (Forwarded to Go)
	McpRequest = "mcp_request",

	// File Operations (Forwarded to Go)
	FileOpen = "file_open",
	ImageOpen = "image_open",
	MentionOpen = "mention_open",
	ImagesSelected = "select_images", // Renamed from SelectImages for consistency

	// Checkpoint Operations (Forwarded to Go)
	CheckpointDiff = "checkpoint_diff",
	CheckpointRestore = "checkpoint_restore",
	CheckLatestChanges = "check_latest_changes", // Renamed from CheckpointChanges to match Go

	// Subscription (Forwarded to Go)
	Subscribe = "subscribe", // Email subscription

	// Bridge-Specific Operations (Handled Locally)
	EventSubscribe = "event_subscribe", // Bridge's own event subscription
	EventUnsubscribe = "event_unsubscribe", // Bridge's own event unsubscription
	WebviewMessage = "webview_message", // Messages specifically for the webview

	// Connection
	Ping = "ping", // Can be local or forwarded
	Error = "error", // Can originate locally or from Go
	GoServerBroadcast = "go_server_broadcast", // Internal type for messages from Go
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
	private provider: ClineProvider // Store the provider instance
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

	// Constructor updated to accept ClineProvider
	constructor(provider: ClineProvider, port: number = 3002, apiKey: string = "") {
		// Default port changed to 3002
		this.provider = provider // Store the provider
		this.port = port
		this.apiKey = apiKey // Key for clients connecting to THIS bridge
		Logger.log(`WebSocket Bridge Server configured for provider, listening on port ${port}`)

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
					const response = await this.processLocalMessage(msgData, ws)
					if (response) {
						const responseString = JSON.stringify(response)
						Logger.log(`WebSocket: Sending response to client ${this.clients.get(ws)?.id}: ${responseString}`) // <-- Added logging
						ws.send(responseString)
						this.metrics.messagesSent++
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
						serverVersion: "2.0.1", // Updated version
						supportedFeatures: ["event_subscription", "forwarding_to_go_server"],
					},
				})
				ws.send(welcomeMessage, (error) => {
					if (error) {
						Logger.log(`WebSocket: Error sending welcome message to client ${clientId}: ${error.message}`)
						// Optionally close the connection if sending the welcome message fails
						// ws.close();
					} else {
						this.metrics.messagesSent++
					}
				})
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
	 * Process incoming WebSocket messages intended for the local bridge/provider.
	 */
	private async processLocalMessage(message: WebSocketMessage, ws: WebSocket): Promise<WebSocketMessage | null> {
		const { type, id, taskId, payload } = message
		const clientData = this.clients.get(ws)

		// Update taskId if provided (might be relevant for local processing too)
		if (taskId && clientData) {
			clientData.taskId = taskId
			this.clients.set(ws, clientData)
		}

		Logger.log(`WebSocket: Processing local message. Received type: "${type}" (ID: ${id || "N/A"})`)

		try {
			// Use the stored provider instance
			const provider = this.provider
			if (!provider && type !== MessageType.Ping) {
				// Allow ping even without provider
				throw new Error("WebSocketBridgeServer: ClineProvider instance not available")
			}

			// Process message based on type
			switch (type) {
				case MessageType.Ping:
					return {
						type: MessageType.Ping,
						id,
						payload: {
							timestamp: Date.now(),
							hasProvider: !!this.provider, // Check stored provider
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

				// --- Messages handled locally using the stored provider instance ---

				case MessageType.TaskInit: {
					if (!provider) {
						throw new Error("Provider required for TaskInit")
					}
					if (!payload?.task) {
						throw new Error("Payload 'task' required for TaskInit")
					}
					// Directly call provider method
					await provider.initClineWithTask(payload.task, payload.images || [])
					// Get task ID from provider state after initialization
					const state = await provider.getStateToPostToWebview()
					const currentTaskId = state.currentTaskItem?.id
					return { type, id, payload: { success: true, taskId: currentTaskId } }
				}

				case MessageType.TaskResume: {
					if (!provider) {
						throw new Error("Provider required for TaskResume")
					}
					if (!taskId) {
						throw new Error("taskId required for TaskResume")
					}
					Logger.log(`WebSocket: TaskResume direct call not fully implemented yet.`)
					// await provider.resumeTask(taskId, payload); // Assuming resumeTask exists
					return { type, id, payload: { success: true, message: "Resume handling pending" } }
				}

				case MessageType.TaskCancel: {
					if (!provider) {
						throw new Error("Provider required for TaskCancel")
					}
					// Directly call provider method
					await provider.cancelTask()
					return { type, id, payload: { success: true } }
				}

				case MessageType.TaskResponse: {
					if (!provider) {
						throw new Error("Provider required for TaskResponse")
					}
					if (!payload?.response) {
						throw new Error("Payload 'response' required for TaskResponse")
					}
					// Directly call provider method (assuming handleWebviewAskResponse exists)
					if (provider.handleWebviewAskResponse) {
						await provider.handleWebviewAskResponse(payload.response, payload.text || "", payload.images || [])
					} else {
						// Fallback or error if method doesn't exist
						Logger.log("WebSocket: handleWebviewAskResponse method not found on provider.")
						throw new Error("handleWebviewAskResponse method not available")
					}
					return { type, id, payload: { success: true } }
				}
				case MessageType.StateRequest: {
					if (!provider) {
						throw new Error("Provider required for StateRequest")
					}
					// Directly call provider method
					const state = await provider.getStateToPostToWebview()
					return { type, id, payload: { success: true, state } }
				}
				case MessageType.SettingsUpdate: {
					Logger.log(`WebSocket: Entering SettingsUpdate case for message ID: ${id || "N/A"}`)
					if (!provider) {
						throw new Error("Provider required for SettingsUpdate")
					}
					if (!payload) {
						throw new Error("Payload required for SettingsUpdate")
					}
					Logger.log(`WebSocket: Calling provider.updateApiConfiguration with payload: ${JSON.stringify(payload)}`)
					// Directly call provider method
					await provider.updateApiConfiguration(payload)
					Logger.log(`WebSocket: Finished provider.updateApiConfiguration for message ID: ${id || "N/A"}`)
					return { type, id, payload: { success: true } }
				}

				case MessageType.ChatModeUpdate: {
					if (!provider) {
						throw new Error("Provider required for ChatModeUpdate")
					}
					if (!payload) {
						throw new Error("Payload required for ChatModeUpdate")
					}
					// Directly call provider method
					await provider.togglePlanActModeWithChatSettings(payload)
					return { type, id, payload: { success: true } }
				}

				case MessageType.AuthToken: {
					if (!provider) {
						throw new Error("Provider required for AuthToken")
					}
					if (!payload?.token) {
						throw new Error("Payload 'token' required for AuthToken")
					}
					Logger.log(`WebSocket: AuthToken direct call not fully implemented yet.`)
					// await provider.setAuthToken(payload.token); // Assuming setAuthToken exists
					return { type, id, payload: { success: true, message: "AuthToken handling pending" } }
				}

				case MessageType.AuthUser: {
					if (!provider) {
						throw new Error("Provider required for AuthUser")
					}
					if (!payload?.user) {
						throw new Error("Payload 'user' required for AuthUser")
					}
					Logger.log(`WebSocket: AuthUser direct call not fully implemented yet.`)
					// await provider.setAuthUser(payload.user); // Assuming setAuthUser exists
					return { type, id, payload: { success: true, message: "AuthUser handling pending" } }
				}

				case MessageType.AuthSignout: {
					if (!provider) {
						throw new Error("Provider required for AuthSignout")
					}
					Logger.log(`WebSocket: AuthSignout direct call not fully implemented yet.`)
					// await provider.signOut(); // Assuming signOut exists
					return { type, id, payload: { success: true, message: "AuthSignout handling pending" } }
				}

				case MessageType.McpRequest: {
					if (!provider) {
						throw new Error("Provider required for McpRequest")
					}
					if (!payload) {
						throw new Error("Payload required for McpRequest")
					}
					Logger.log(`WebSocket: McpRequest direct call not fully implemented yet.`)
					// const mcpResponse = await provider.handleMcpRequest(payload); // Assuming handleMcpRequest exists
					// return { type, id, payload: { success: true, response: mcpResponse } };
					return { type, id, payload: { success: true, message: "McpRequest handling pending" } }
				}

				// --- VS Code API Interactions (Keep using commands) ---
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

				// --- Provider Interactions (Use direct calls) ---
				case MessageType.MentionOpen: {
					if (!provider) {
						throw new Error("Provider required for MentionOpen")
					}
					if (!payload?.mention) {
						throw new Error("Payload 'mention' required for MentionOpen")
					}
					// Directly call provider method (assuming openMention exists)
					if ((provider as any).openMention) {
						await (provider as any).openMention(payload.mention)
					} else {
						Logger.log("WebSocket: openMention method not found on provider.")
						throw new Error("openMention method not available")
					}
					return { type, id, payload: { success: true } }
				}

				case MessageType.ImagesSelected: {
					if (!provider) {
						throw new Error("Provider required for ImagesSelected")
					}
					// Directly call provider method (assuming selectImages exists)
					let selectedImages: any[] = []
					if ((provider as any).selectImages) {
						selectedImages = await (provider as any).selectImages()
					} else {
						Logger.log("WebSocket: selectImages method not found on provider.")
						throw new Error("selectImages method not available")
					}
					return { type, id, payload: { success: true, images: selectedImages } }
				}

				case MessageType.CheckpointDiff: {
					if (!provider) {
						throw new Error("Provider required for CheckpointDiff")
					}
					// taskId might be needed if the provider method requires it explicitly,
					// otherwise, assume the provider knows the current task context.
					if (payload?.messageTs === undefined) {
						throw new Error("Payload 'messageTs' required for CheckpointDiff")
					}
					// Directly call provider method (assuming presentMultifileDiff exists)
					if ((provider as any).presentMultifileDiff) {
						await (provider as any).presentMultifileDiff(
							payload.messageTs,
							payload.seeNewChangesSinceLastTaskCompletion || false,
						)
					} else {
						Logger.log("WebSocket: presentMultifileDiff method not found on provider.")
						throw new Error("presentMultifileDiff method not available")
					}
					return { type, id, payload: { success: true } }
				}
				case MessageType.CheckpointRestore: {
					if (!provider) {
						throw new Error("Provider required for CheckpointRestore")
					}
					// taskId might be needed explicitly. Assume provider context for now.
					if (payload?.messageTs === undefined) {
						throw new Error("Payload 'messageTs' required for CheckpointRestore")
					}
					if (!payload?.restoreType) {
						throw new Error("Payload 'restoreType' required for CheckpointRestore")
					}
					// Directly call provider method (assuming restoreCheckpoint exists)
					if ((provider as any).restoreCheckpoint) {
						await (provider as any).restoreCheckpoint(payload.messageTs, payload.restoreType)
					} else {
						Logger.log("WebSocket: restoreCheckpoint method not found on provider.")
						throw new Error("restoreCheckpoint method not available")
					}
					return { type, id, payload: { success: true } }
				}
				case MessageType.CheckLatestChanges: {
					if (!provider) {
						throw new Error("Provider required for CheckLatestChanges")
					}
					// taskId might be needed explicitly. Assume provider context for now.
					let hasChanges = false
					// Directly call provider method (assuming doesLatestTaskCompletionHaveNewChanges exists)
					if ((provider as any).doesLatestTaskCompletionHaveNewChanges) {
						hasChanges = await (provider as any).doesLatestTaskCompletionHaveNewChanges()
					} else {
						Logger.log("WebSocket: doesLatestTaskCompletionHaveNewChanges method not found on provider.")
						throw new Error("doesLatestTaskCompletionHaveNewChanges method not available")
					}
					return { type, id, payload: { success: true, hasChanges } }
				}

				case MessageType.Subscribe: {
					if (!provider) {
						throw new Error("Provider required for Subscribe")
					}
					if (!payload?.email) {
						throw new Error("Payload 'email' required for Subscribe")
					}
					Logger.log(`WebSocket: Subscribe direct call not fully implemented yet.`)
					// await provider.subscribeEmail(payload.email); // Assuming subscribeEmail exists
					return { type, id, payload: { success: true, message: "Subscribe handling pending" } }
				}

				// --- Bridge Specific ---
				case MessageType.WebviewMessage:
					if (!provider) {
						throw new Error("ClineProvider not available for WebviewMessage")
					}
					// Forward message directly to the webview via provider
					await provider.postMessageToWebview(payload) // Assuming payload is the message for webview
					return { type, id, payload: { success: true } }

				default:
					throw new Error(`Unknown or unhandled local message type: ${type}`)
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
	 * Broadcasts state updates (from local provider) to subscribed bridge clients.
	 */
	private async broadcastStateUpdates() {
		try {
			// Use the stored provider instance
			const provider = this.provider
			if (!provider) {
				Logger.log("WebSocket: Cannot broadcast state, provider instance not available in WebSocketBridgeServer.")
				return
			}

			const state = await provider.getStateToPostToWebview()

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
 * Requires the ClineProvider instance.
 */
export function getWebSocketBridgeServer(
	provider: ClineProvider,
	port: number = 3002,
	apiKey: string = "",
): WebSocketBridgeServer {
	if (!websocketServer) {
		Logger.log(`WebSocket: Creating new WebSocketBridgeServer instance for provider on port ${port}`)
		websocketServer = new WebSocketBridgeServer(provider, port, apiKey)
	} else {
		// TODO: Decide how to handle existing server instance.
		// Option 1: Update existing server's provider, port, apiKey (might be complex if running)
		// Option 2: Log a warning and return existing instance (simplest)
		// Option 3: Stop existing and create new (might disrupt clients)
		// For now, let's log and return existing, assuming provider doesn't change mid-session.
		Logger.log(`WebSocket: Returning existing WebSocketBridgeServer instance. Port/APIKey updates require restart.`)
		// Optionally update apiKey if needed: websocketServer.updateApiKey(apiKey);
	}
	return websocketServer
}

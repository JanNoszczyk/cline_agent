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
	private server: http.Server
	private wss: WebSocketServer
	private port: number
	private apiKey: string // API key for clients connecting TO this bridge
	private goServerApiKey: string // API key to connect TO the Go server
	private clients: Map<WebSocket, { id: string; taskId?: string }>
	private heartbeatInterval: NodeJS.Timeout | null = null
	private activeConnections: number = 0 // Connections to THIS bridge server
	private isStarted: boolean = false
	private eventSubscriptions: Map<string, EventSubscription> = new Map() // Subscriptions to THIS bridge server's events

	// Properties for Go Server Client Connection
	private goClient: WebSocket | null = null
	private goServerUrl: string // URL will be determined dynamically
	private reconnectInterval: NodeJS.Timeout | null = null
	private isConnectingToGo = false
	private readonly RECONNECT_DELAY = 5000 // 5 seconds

	private metrics: {
		messagesReceived: number // From bridge clients + Go server
		messagesSent: number // To bridge clients + Go server
		errors: number
		startTime: number
	} = {
		messagesReceived: 0,
		messagesSent: 0,
		errors: 0,
		startTime: Date.now(),
	}

	constructor(port: number = 9000, apiKey: string = "", goServerApiKey: string = "") {
		this.port = port
		this.apiKey = apiKey // Key for clients connecting to THIS bridge

		// Use API_AUTH_TOKEN environment variable for connecting TO the Go server, aligning with Go server's expectation.
		this.goServerApiKey = process.env.API_AUTH_TOKEN || "default-dev-token"
		if (this.goServerApiKey === "default-dev-token") {
			Logger.log(
				"WARN: Using default API key ('default-dev-token') to connect to Go server. Ensure API_AUTH_TOKEN is set in the environment.",
			)
		} else {
			Logger.log("Go Client: Using API_AUTH_TOKEN environment variable for authentication.")
		}
		// Remove reliance on vscode settings for this key:
		// goServerApiKey || vscode.workspace.getConfiguration("cline").get<string>("goServer.apiKey") || "default-dev-token"

		// Determine Go Server URL dynamically using the required environment variable
		const goPortEnv = process.env.CLINE_GO_WS_PORT
		const goPort = goPortEnv ? parseInt(goPortEnv, 10) : null

		if (goPort && !isNaN(goPort)) {
			this.goServerUrl = `ws://localhost:${goPort}/ws`
			Logger.log(
				`Go Client: Using dynamic port ${goPort} from environment variable CLINE_GO_WS_PORT. URL: ${this.goServerUrl}`,
			)
		} else {
			// If the environment variable is missing or invalid, we cannot connect. Log an error.
			const errorMsg = `ERROR: CLINE_GO_WS_PORT environment variable is missing or invalid ('${goPortEnv}'). Cannot determine Go client WebSocket URL.`
			Logger.log(errorMsg)
			// Set a placeholder URL or throw an error to prevent connection attempts?
			// Setting an invalid URL will cause connection errors later, which might be acceptable.
			this.goServerUrl = "ws://invalid-host:0" // Set invalid URL to prevent accidental connection to fallback
			// Alternatively, could throw new Error(errorMsg); but that might stop the extension host.
		}

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
					msgData = JSON.parse(message) as WebSocketMessage // Assign here

					// Determine if the message should be forwarded to the Go server
					if (this.isMessageForGoServer(msgData.type)) {
						if (this.goClient && this.goClient.readyState === WebSocketReadyState.OPEN) {
							this.sendMessageToGoServer(message) // Forward raw message string
						} else {
							Logger.log(`WebSocket: Go client not connected. Cannot forward message type ${msgData.type}.`)
							// Optionally send an error back to the client
							ws.send(
								JSON.stringify({
									type: MessageType.Error,
									id: msgData.id,
									payload: { error: "Go backend service unavailable" },
								}),
							)
							this.metrics.messagesSent++
						}
					} else {
						// Process the message locally using the bridge's logic
						const response = await this.processLocalMessage(msgData, ws)
						if (response) {
							ws.send(JSON.stringify(response))
							this.metrics.messagesSent++
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
			ws.send(
				JSON.stringify({
					type: "connected",
					payload: {
						clientId,
						message: "Connected to Cline WebSocket Bridge",
						serverVersion: "2.0.1", // Updated version
						supportedFeatures: ["event_subscription", "forwarding_to_go_server"],
					},
				}),
			)
			this.metrics.messagesSent++
		})
	}

	/**
	 * Determines if a message type should be forwarded to the Go server.
	 */
	private isMessageForGoServer(type: MessageType): boolean {
		switch (type) {
			case MessageType.TaskInit:
			case MessageType.TaskResume:
			case MessageType.TaskCancel:
			case MessageType.TaskResponse:
			case MessageType.StateRequest: // Requesting state FROM Go
			case MessageType.SettingsUpdate:
			case MessageType.ChatModeUpdate:
			case MessageType.AuthToken:
			case MessageType.AuthUser:
			case MessageType.AuthSignout:
			case MessageType.McpRequest:
			case MessageType.FileOpen:
			case MessageType.ImageOpen:
			case MessageType.MentionOpen:
			case MessageType.ImagesSelected:
			case MessageType.CheckpointDiff:
			case MessageType.CheckpointRestore:
			case MessageType.CheckLatestChanges:
			case MessageType.Subscribe: // Email subscription
				return true
			default:
				return false
		}
	}

	/**
	 * Connects to the Go WebSocket server.
	 */
	private connectToGoServer() {
		if (this.goClient && this.goClient.readyState === WebSocketReadyState.OPEN) {
			Logger.log("Go Client: Already connected.")
			return
		}
		if (this.isConnectingToGo) {
			Logger.log("Go Client: Connection attempt already in progress.")
			return
		}

		this.isConnectingToGo = true
		Logger.log(`Go Client: Attempting to connect to ${this.goServerUrl}...`)

		// Clear any existing reconnect timer
		if (this.reconnectInterval) {
			clearTimeout(this.reconnectInterval)
			this.reconnectInterval = null
		}

		// Clean up old client if exists
		if (this.goClient) {
			this.goClient.removeAllListeners()
			this.goClient.terminate() // Force close if needed
		}

		const options = {
			headers: {
				"X-API-Key": this.goServerApiKey,
			},
		}

		this.goClient = new WebSocket(this.goServerUrl, options)

		this.goClient.on("open", () => {
			this.isConnectingToGo = false
			Logger.log("Go Client: Connection established successfully.")
			// Clear reconnect timer on successful connection
			if (this.reconnectInterval) {
				clearTimeout(this.reconnectInterval)
				this.reconnectInterval = null
			}
			// Optional: Send a ping or initial message if required by Go server
			// this.sendMessageToGoServer(JSON.stringify({ type: MessageType.Ping }));
		})

		this.goClient.on("message", (messageData: Buffer) => {
			this.metrics.messagesReceived++
			try {
				const message = messageData.toString()
				const msgData = JSON.parse(message) as WebSocketMessage
				Logger.log(`Go Client: Received message type ${msgData.type}`)
				// Broadcast message from Go server to relevant bridge clients
				this.broadcastMessageFromGo(msgData)
			} catch (error) {
				this.metrics.errors++
				Logger.log(
					`ERROR: Go Client: Error processing message: ${error instanceof Error ? error.message : "Unknown error"}`,
				)
			}
		})

		this.goClient.on("close", (code, reason) => {
			this.isConnectingToGo = false
			Logger.log(`Go Client: Connection closed. Code: ${code}, Reason: ${reason.toString()}`)
			this.goClient = null
			// Attempt to reconnect after a delay, unless explicitly stopped
			if (this.isStarted && !this.reconnectInterval) {
				Logger.log(`Go Client: Scheduling reconnect in ${this.RECONNECT_DELAY / 1000} seconds...`)
				this.reconnectInterval = setTimeout(() => {
					this.reconnectInterval = null // Clear timer before attempting reconnect
					this.connectToGoServer()
				}, this.RECONNECT_DELAY)
			}
		})

		this.goClient.on("error", (error) => {
			this.isConnectingToGo = false
			this.metrics.errors++
			Logger.log(`ERROR: Go Client: Connection error: ${error.message}`)
			// The 'close' event will usually follow, triggering reconnection logic
			// If 'close' doesn't fire, we might need to trigger reconnect here too
			if (
				this.goClient &&
				this.goClient.readyState !== WebSocketReadyState.OPEN &&
				this.goClient.readyState !== WebSocketReadyState.CONNECTING
			) {
				if (this.isStarted && !this.reconnectInterval) {
					Logger.log(`Go Client: Scheduling reconnect after error in ${this.RECONNECT_DELAY / 1000} seconds...`)
					this.reconnectInterval = setTimeout(() => {
						this.reconnectInterval = null
						this.connectToGoServer()
					}, this.RECONNECT_DELAY)
				}
			}
		})
	}

	/**
	 * Sends a message string to the Go server if connected.
	 */
	private sendMessageToGoServer(message: string) {
		if (this.goClient && this.goClient.readyState === WebSocketReadyState.OPEN) {
			this.goClient.send(message)
			this.metrics.messagesSent++
			// Logger.log(`Go Client: Sent message: ${message.substring(0, 100)}...`); // Log truncated message
		} else {
			Logger.log("WARN: Go Client: Attempted to send message while not connected.")
			// Optionally queue the message or return an error
		}
	}

	/**
	 * Broadcasts a message received from the Go server to connected bridge clients.
	 */
	private broadcastMessageFromGo(message: WebSocketMessage) {
		const messageString = JSON.stringify(message)
		Logger.log(`Broadcasting message from Go (Type: ${message.type}) to ${this.wss.clients.size} bridge clients.`)

		this.wss.clients.forEach((client) => {
			if (client.readyState === WebSocketReadyState.OPEN) {
				const clientData = this.clients.get(client)
				if (!clientData) {
					return
				}

				// Basic broadcasting for now. Could add filtering based on taskId or subscriptions later.
				// Check event subscriptions if applicable
				const subscription = this.eventSubscriptions.get(clientData.id)
				if (
					subscription &&
					!subscription.eventTypes.includes("*") &&
					!subscription.eventTypes.includes(message.type) &&
					!subscription.eventTypes.includes("go_server") // Generic type for all Go messages?
				) {
					// Skip if client hasn't subscribed to this type
					return
				}

				// If message has a taskId, only send to clients associated with that task?
				// if (message.taskId && clientData.taskId !== message.taskId) {
				//     return;
				// }

				client.send(messageString)
				// Don't increment metrics.messagesSent here, as it was already counted when Go sent it.
			}
		})
	}

	/**
	 * Starts the WebSocket server and connects to the Go server.
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

					// Attempt to connect to the Go server
					this.connectToGoServer()

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

			// Clear reconnect interval for Go client
			if (this.reconnectInterval) {
				clearTimeout(this.reconnectInterval)
				this.reconnectInterval = null
			}

			// Close Go client connection
			if (this.goClient) {
				Logger.log("Go Client: Closing connection during server stop...")
				this.goClient.removeAllListeners() // Prevent listeners triggering reconnects during shutdown
				this.goClient.close()
				this.goClient = null
			}

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

		// Health check endpoint
		if (url.pathname === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(
				JSON.stringify({
					status: "ok",
					bridgeConnections: this.activeConnections,
					goClientStatus: this.goClient?.readyState === WebSocketReadyState.OPEN ? "connected" : "disconnected",
					uptime: process.uptime(),
				}),
			)
			return
		}

		// API key status
		if (url.pathname === "/status") {
			// Check API key for THIS bridge server
			const reqApiKey = req.headers["x-api-key"] as string
			if (this.apiKey && this.apiKey !== reqApiKey) {
				res.writeHead(401, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ error: "Unauthorized" }))
				return
			}

			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(JSON.stringify(this.getStatus())) // Use getStatus method
			return
		}

		// Metrics endpoint
		if (url.pathname === "/metrics") {
			// Check API key for THIS bridge server
			const reqApiKey = req.headers["x-api-key"] as string
			if (this.apiKey && this.apiKey !== reqApiKey) {
				res.writeHead(401, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ error: "Unauthorized" }))
				return
			}

			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(JSON.stringify(this.getStatus().metrics)) // Use getStatus method
			return
		}

		// Default response for other routes
		res.writeHead(404, { "Content-Type": "application/json" })
		res.end(JSON.stringify({ error: "Not found" }))
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

		Logger.log(`WebSocket: Processing local message of type ${type}`)

		try {
			const provider = ClineProvider.getVisibleInstance()
			if (!provider && type !== MessageType.Ping) {
				// Allow ping even without provider
				throw new Error("ClineProvider not available")
			}

			// Process message based on type
			switch (type) {
				case MessageType.Ping:
					return {
						type: MessageType.Ping,
						id,
						payload: {
							timestamp: Date.now(),
							hasProvider: !!provider,
							goClientStatus: this.goClient?.readyState,
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

				// Potentially handle WebviewMessage locally if needed
				case MessageType.WebviewMessage:
					if (!provider) {
						throw new Error("ClineProvider not available for WebviewMessage")
					}
					// Example: Forward message directly to the webview
					await provider.postMessageToWebview(payload) // Assuming payload is the message for webview
					return { type, id, payload: { success: true } }

				// Add other message types handled *locally* by the bridge here
				// ...

				default:
					// This case should ideally not be reached if isMessageForGoServer is correct
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
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				// Logger.log("WebSocket: Cannot broadcast state, provider not visible.");
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

					client.send(
						JSON.stringify({
							type: MessageType.StateUpdate, // State update from local provider
							payload: { state },
						}),
					)
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
				client.send(JSON.stringify(message))
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
				client.send(JSON.stringify(message))
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
	public updateGoServerApiKey(apiKey: string) {
		this.goServerApiKey = apiKey
		Logger.log("WebSocket: Go server API key updated. Restart connection if needed.")
		// Optionally force reconnect if connection is active
		if (this.goClient && this.goClient.readyState === WebSocketReadyState.OPEN) {
			Logger.log("Go Client: Reconnecting with new API key...")
			this.goClient.close() // Will trigger reconnect logic with new key
		}
	}

	/**
	 * Returns server status including Go client connection state.
	 */
	public getStatus() {
		const uptimeMs = this.isStarted ? Date.now() - this.metrics.startTime : 0

		return {
			running: this.isStarted,
			port: this.port,
			bridgeConnections: this.activeConnections,
			goClient: {
				url: this.goServerUrl,
				// Find the key corresponding to the numeric readyState value
				status:
					Object.entries(WebSocketReadyState).find(
						([, value]) => value === (this.goClient?.readyState ?? WebSocketReadyState.CLOSED),
					)?.[0] ?? "UNKNOWN",
				readyState: this.goClient?.readyState ?? WebSocketReadyState.CLOSED,
			},
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
 * Reads Go server API key from config.
 */
export function getWebSocketBridgeServer(port: number = 9000, apiKey: string = ""): WebSocketBridgeServer {
	if (!websocketServer) {
		const goServerApiKey = vscode.workspace.getConfiguration("cline").get<string>("goServer.apiKey") || "default-dev-token"
		websocketServer = new WebSocketBridgeServer(port, apiKey, goServerApiKey)
	} else {
		// Update keys if they changed in config? Or rely on restart command?
		// For simplicity, let's assume restart is needed for config changes for now.
	}
	return websocketServer
}

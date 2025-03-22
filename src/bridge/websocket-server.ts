import * as http from "http"
import { WebSocket, WebSocketServer } from "ws"
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
export enum MessageType {
	// Task Management
	TaskInit = "task_init",
	TaskResume = "task_resume",
	TaskCancel = "task_cancel",
	TaskResponse = "task_response",
	TaskStreamChunk = "task_stream_chunk",
	TaskStreamEnd = "task_stream_end",

	// State Management
	StateRequest = "state_request",
	StateUpdate = "state_update",
	WebviewMessage = "webview_message",

	// Settings
	SettingsUpdate = "settings_update",
	ChatModeUpdate = "chat_mode_update",

	// Authentication
	AuthToken = "auth_token",
	AuthUser = "auth_user",
	AuthSignout = "auth_signout",

	// MCP
	McpRequest = "mcp_request",

	// File Operations
	FileOpen = "file_open",
	ImageOpen = "image_open",
	MentionOpen = "mention_open",
	SelectImages = "select_images",

	// Checkpoint Operations
	CheckpointDiff = "checkpoint_diff",
	CheckpointRestore = "checkpoint_restore",
	CheckpointChanges = "checkpoint_changes",

	// Event Subscription
	Subscribe = "subscribe",
	EventSubscribe = "event_subscribe",
	EventUnsubscribe = "event_unsubscribe",

	// Connection
	Ping = "ping",
	Error = "error",
}

// WebSocket message interface
interface WebSocketMessage {
	type: MessageType
	id?: string
	taskId?: string
	payload?: any
}

// Event subscription interface
interface EventSubscription {
	clientId: string
	eventTypes: string[]
}

// Bridge handler class
export class WebSocketBridgeServer {
	private server: http.Server
	private wss: WebSocketServer
	private port: number
	private apiKey: string
	private clients: Map<WebSocket, { id: string; taskId?: string }>
	private heartbeatInterval: NodeJS.Timeout | null = null
	private activeConnections: number = 0
	private isStarted: boolean = false
	private eventSubscriptions: Map<string, EventSubscription> = new Map()
	private metrics: {
		messagesReceived: number
		messagesSent: number
		errors: number
		startTime: number
	} = {
		messagesReceived: 0,
		messagesSent: 0,
		errors: 0,
		startTime: Date.now(),
	}

	constructor(port: number = 9000, apiKey: string = "") {
		this.port = port
		this.apiKey = apiKey
		this.clients = new Map()
		this.server = http.createServer(this.handleHttpRequest.bind(this))
		this.wss = new WebSocketServer({ noServer: true })

		// Set up WebSocket connection handling
		this.server.on("upgrade", (request, socket, head) => {
			// Extract API key from query parameters or headers
			const url = new URL(request.url || "", `http://${request.headers.host}`)
			const queryApiKey = url.searchParams.get("apiKey")
			const headerApiKey = request.headers["x-api-key"] as string

			// Validate API key if one is configured
			if (this.apiKey && this.apiKey !== queryApiKey && this.apiKey !== headerApiKey) {
				Logger.log("WebSocket: Unauthorized connection attempt")
				socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n")
				socket.destroy()
				return
			}

			this.wss.handleUpgrade(request, socket, head, (ws) => {
				this.wss.emit("connection", ws, request)
			})
		})

		// Set up WebSocket message handling
		this.wss.on("connection", (ws: WebSocket) => {
			const clientId = Date.now().toString()
			this.clients.set(ws, { id: clientId })
			this.activeConnections++
			Logger.log(`WebSocket: Client connected (ID: ${clientId}, Active: ${this.activeConnections})`)

			// Handle messages from client
			ws.on("message", async (messageData: any) => {
				this.metrics.messagesReceived++
				try {
					// Convert the message data to string, regardless of buffer or string format
					const message = messageData.toString()
					const msgData = JSON.parse(message) as WebSocketMessage
					const response = await this.processMessage(msgData, ws)
					if (response) {
						ws.send(JSON.stringify(response))
						this.metrics.messagesSent++
					}
				} catch (error) {
					this.metrics.errors++
					const errorMessage = error instanceof Error ? error.message : "Unknown error"
					Logger.log(`WebSocket: Error processing message: ${errorMessage}`)
					ws.send(
						JSON.stringify({
							type: MessageType.Error,
							payload: { error: errorMessage },
						}),
					)
					this.metrics.messagesSent++
				}
			})

			// Handle client disconnection
			ws.on("close", () => {
				const clientData = this.clients.get(ws)
				if (clientData) {
					// Remove any event subscriptions for this client
					this.eventSubscriptions.delete(clientData.id)
				}

				this.clients.delete(ws)
				this.activeConnections--
				Logger.log(`WebSocket: Client disconnected (Active: ${this.activeConnections})`)
			})

			// Send welcome message
			ws.send(
				JSON.stringify({
					type: "connected",
					payload: {
						clientId,
						message: "Connected to Cline WebSocket Bridge",
						serverVersion: "2.0.0",
						supportedFeatures: ["event_subscription", "file_operations", "checkpoint_operations"],
					},
				}),
			)
			this.metrics.messagesSent++
		})
	}

	/**
	 * Starts the WebSocket server
	 */
	public start(): Promise<void> {
		return new Promise((resolve, reject) => {
			if (this.isStarted) {
				Logger.log(`WebSocket: Server already running on port ${this.port}`)
				resolve()
				return
			}

			this.server
				.listen(this.port, () => {
					this.isStarted = true
					Logger.log(`WebSocket: Server started on port ${this.port}`)

					// Start heartbeat to keep connections alive
					this.heartbeatInterval = setInterval(() => {
						this.broadcastStateUpdates()
					}, 30000) // Send updates every 30 seconds

					resolve()
				})
				.on("error", (err) => {
					Logger.log(`WebSocket: Server failed to start: ${err.message}`)
					reject(err)
				})
		})
	}

	/**
	 * Stops the WebSocket server
	 */
	public stop(): Promise<void> {
		return new Promise((resolve) => {
			if (!this.isStarted) {
				resolve()
				return
			}

			// Clear heartbeat interval
			if (this.heartbeatInterval) {
				clearInterval(this.heartbeatInterval)
				this.heartbeatInterval = null
			}

			// Close all client connections
			this.wss.clients.forEach((client) => {
				client.close()
			})

			// Close the server
			this.server.close(() => {
				this.isStarted = false
				this.clients.clear()
				this.activeConnections = 0
				Logger.log("WebSocket: Server stopped")
				resolve()
			})
		})
	}

	/**
	 * Handles HTTP requests to the server
	 */
	private handleHttpRequest(req: http.IncomingMessage, res: http.ServerResponse) {
		const url = new URL(req.url || "", `http://${req.headers.host}`)

		// Health check endpoint
		if (url.pathname === "/health") {
			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(
				JSON.stringify({
					status: "ok",
					activeConnections: this.activeConnections,
					uptime: process.uptime(),
				}),
			)
			return
		}

		// API key status
		if (url.pathname === "/status") {
			// Check API key
			const apiKey = req.headers["x-api-key"] as string

			if (this.apiKey && this.apiKey !== apiKey) {
				res.writeHead(401, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ error: "Unauthorized" }))
				return
			}

			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(
				JSON.stringify({
					status: "ok",
					activeConnections: this.activeConnections,
					uptime: process.uptime(),
					serverTime: new Date().toISOString(),
				}),
			)
			return
		}

		// Metrics endpoint
		if (url.pathname === "/metrics") {
			// Check API key
			const apiKey = req.headers["x-api-key"] as string

			if (this.apiKey && this.apiKey !== apiKey) {
				res.writeHead(401, { "Content-Type": "application/json" })
				res.end(JSON.stringify({ error: "Unauthorized" }))
				return
			}

			const uptimeMs = Date.now() - this.metrics.startTime

			res.writeHead(200, { "Content-Type": "application/json" })
			res.end(
				JSON.stringify({
					uptime: uptimeMs,
					uptimeHuman: this.formatUptime(uptimeMs),
					messagesReceived: this.metrics.messagesReceived,
					messagesSent: this.metrics.messagesSent,
					errors: this.metrics.errors,
					activeConnections: this.activeConnections,
					messagesPerSecond: this.metrics.messagesReceived / (uptimeMs / 1000),
				}),
			)
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
		const seconds = Math.floor(ms / 1000)
		const minutes = Math.floor(seconds / 60)
		const hours = Math.floor(minutes / 60)
		const days = Math.floor(hours / 24)

		return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`
	}

	/**
	 * Process incoming WebSocket messages
	 */
	private async processMessage(message: WebSocketMessage, ws: WebSocket): Promise<WebSocketMessage | null> {
		const { type, id, taskId, payload } = message
		const clientData = this.clients.get(ws)

		// Update taskId if provided
		if (taskId && clientData) {
			clientData.taskId = taskId
			this.clients.set(ws, clientData)
		}

		Logger.log(`WebSocket: Processing message of type ${type}`)

		try {
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			// Process message based on type
			switch (type) {
				case MessageType.Ping:
					return {
						type: MessageType.Ping, // Using same enum for consistency
						id,
						payload: {
							timestamp: Date.now(),
							hasProvider: true,
						},
					}

				case MessageType.TaskInit:
					const task = payload.task as string
					const images = (payload.images as string[]) || []
					await provider.initClineWithTask(task, images)
					const newTaskId = await provider.getGlobalState("currentTaskId")
					if (!newTaskId) {
						throw new Error("Failed to initialize task")
					}

					// Update client's taskId
					if (clientData) {
						clientData.taskId = newTaskId as string
						this.clients.set(ws, clientData)
					}

					return {
						type,
						id,
						taskId: newTaskId as string,
						payload: { success: true, taskId: newTaskId },
					}

				case MessageType.TaskResume:
					if (!taskId) {
						throw new Error("Task ID is required")
					}

					const { historyItem } = await provider.getTaskWithId(taskId)
					await provider.initClineWithHistoryItem(historyItem)

					return {
						type,
						id,
						taskId,
						payload: { success: true },
					}

				case MessageType.TaskCancel:
					if (!taskId) {
						throw new Error("Task ID is required")
					}

					// Validate taskId
					const currentTaskId = await provider.getGlobalState("currentTaskId")
					if (currentTaskId !== taskId) {
						throw new Error("Task ID does not match current task")
					}

					await provider.cancelTask()
					return {
						type,
						id,
						taskId,
						payload: { success: true },
					}

				case MessageType.TaskResponse:
					if (!taskId) {
						throw new Error("Task ID is required")
					}

					// Validate taskId
					const currentTaskId2 = await provider.getGlobalState("currentTaskId")
					if (currentTaskId2 !== taskId) {
						throw new Error("Task ID does not match current task")
					}

					const response = payload.response
					const text = payload.text
					const responseImages = payload.images || []

					// Use the method if it exists, otherwise fall back to the general API
					if (provider.handleWebviewAskResponse) {
						await provider.handleWebviewAskResponse(response, text, responseImages)
					} else {
						// Fallback to a more standard API if available
						await provider.postMessageToWebview({
							type: "askResponse",
							askResponse: response,
							text,
							images: responseImages,
						} as any)
					}
					return {
						type,
						id,
						taskId,
						payload: { success: true },
					}

				case MessageType.StateRequest:
					const state = await provider.getStateToPostToWebview()
					return {
						type,
						id,
						payload: { success: true, state },
					}

				case MessageType.SettingsUpdate:
					const settingsType = payload.type

					switch (settingsType) {
						case "api":
							await provider.updateApiConfiguration(payload.config)
							break
						case "customInstructions":
							await provider.updateCustomInstructions(payload.instructions)
							break
						case "autoApproval":
							await provider.updateGlobalState("autoApprovalSettings", payload.settings)
							break
						case "browser":
							await provider.updateGlobalState("browserSettings", payload.settings)
							break
						case "chat":
							await provider.updateGlobalState("chatSettings", payload.settings)
							break
						default:
							throw new Error(`Unknown settings type: ${settingsType}`)
					}

					return {
						type,
						id,
						payload: { success: true },
					}

				case MessageType.ChatModeUpdate:
					const mode = payload.mode
					await provider.togglePlanActModeWithChatSettings({ mode })
					return {
						type,
						id,
						payload: { success: true },
					}

				case MessageType.AuthToken:
					const token = payload.token
					// Use the method if it exists, otherwise fall back
					if (provider.setAuthToken) {
						await provider.setAuthToken(token)
					} else {
						// Alternative approach if direct method isn't available
						// We've added "authToken" to our extended GlobalStateKey type
						await provider.updateGlobalState("authToken", token)
					}
					return {
						type,
						id,
						payload: { success: true },
					}

				case MessageType.AuthUser:
					const userInfo = payload.userInfo
					// Using type assertion since this method might not be directly exposed
					if (typeof provider.setUserInfo === "function") {
						await (provider as any).setUserInfo(userInfo)
					} else {
						// Alternative approach if direct method isn't available
						await provider.updateGlobalState("userInfo", userInfo)
					}
					return {
						type,
						id,
						payload: { success: true },
					}

				case MessageType.AuthSignout:
					await provider.handleSignOut()
					return {
						type,
						id,
						payload: { success: true },
					}

				// File operation handlers
				case MessageType.FileOpen:
					const filePath = payload.filePath
					await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(filePath))
					return {
						type,
						id,
						payload: { success: true },
					}

				case MessageType.ImageOpen:
					const imagePath = payload.imagePath
					await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(imagePath))
					return {
						type,
						id,
						payload: { success: true },
					}

				case MessageType.MentionOpen:
					const mention = payload.mention
					// Using type assertion since this method might not be directly accessible
					await (provider as any).openMention(mention)
					return {
						type,
						id,
						payload: { success: true },
					}

				case MessageType.SelectImages:
					// Using type assertion since this method might not be directly accessible
					const selectedImages = await (provider as any).selectImages()
					return {
						type,
						id,
						payload: { success: true, images: selectedImages },
					}

				// Checkpoint operation handlers
				case MessageType.CheckpointDiff:
					const diffMessageTs = payload.messageTs
					const seeNewChangesSinceLastTaskCompletion = payload.seeNewChangesSinceLastTaskCompletion || false
					// Using type assertion since this method might not be directly accessible
					await (provider as any).presentMultifileDiff(diffMessageTs, seeNewChangesSinceLastTaskCompletion)
					return {
						type,
						id,
						payload: { success: true },
					}

				case MessageType.CheckpointRestore:
					const restoreMessageTs = payload.messageTs
					const restoreType = payload.restoreType || "soft"
					// Using type assertion since this method might not be directly accessible
					await (provider as any).restoreCheckpoint(restoreMessageTs, restoreType)
					return {
						type,
						id,
						payload: { success: true },
					}

				case MessageType.CheckpointChanges:
					// Using type assertion since this method might not be directly accessible
					const hasChanges = await (provider as any).doesLatestTaskCompletionHaveNewChanges()
					return {
						type,
						id,
						payload: { success: true, hasChanges },
					}

				// Event subscription handlers
				case MessageType.EventSubscribe:
					if (!clientData) {
						throw new Error("Client data not found")
					}

					const eventTypes = payload.eventTypes as string[]
					if (!Array.isArray(eventTypes) || eventTypes.length === 0) {
						throw new Error("Event types must be a non-empty array")
					}

					this.eventSubscriptions.set(clientData.id, {
						clientId: clientData.id,
						eventTypes,
					})

					return {
						type,
						id,
						payload: { success: true, subscribedEvents: eventTypes },
					}

				case MessageType.EventUnsubscribe:
					if (!clientData) {
						throw new Error("Client data not found")
					}

					this.eventSubscriptions.delete(clientData.id)
					return {
						type,
						id,
						payload: { success: true },
					}

				case MessageType.McpRequest:
					const action = payload.action
					let result: any

					switch (action) {
						case "getTaskHistory":
							result = (await provider.getGlobalState("taskHistory")) || []
							break
						case "getTaskWithId":
							const { historyItem: taskHistoryItem } = await provider.getTaskWithId(payload.taskId)
							result = taskHistoryItem
							break
						case "deleteTaskWithId":
							await provider.deleteTaskWithId(payload.taskId)
							result = { success: true }
							break
						case "exportTaskWithId":
							result = await provider.exportTaskWithId(payload.taskId)
							break
						case "getMcpMarketplaceCatalog":
							result = await provider.getGlobalState("mcpMarketplaceCatalog")
							break
						case "downloadMcp":
							// Access through the public API if available
							// Since this is likely a private method, use type assertion
							await (provider as any).downloadMcp(payload.mcpId)
							result = { success: true }
							break
						case "toggleMcpServer":
							await provider.mcpHub?.toggleServerDisabled(payload.serverName, payload.disabled)
							result = { success: true }
							break
						case "toggleToolAutoApprove":
							await provider.mcpHub?.toggleToolAutoApprove(
								payload.serverName,
								payload.toolName,
								payload.autoApprove,
							)
							result = { success: true }
							break
						case "restartMcpServer":
							await provider.mcpHub?.restartConnection(payload.serverName)
							result = { success: true }
							break
						case "deleteMcpServer":
							await provider.mcpHub?.deleteServer(payload.serverName)
							result = { success: true }
							break
						case "getMcpServers":
							result = provider.mcpHub?.getServers() || []
							break
						default:
							throw new Error(`Unknown MCP action: ${action}`)
					}

					return {
						type,
						id,
						payload: { success: true, result },
					}

				case MessageType.Subscribe:
					const email = payload.email
					// Use the method if it exists, otherwise just log
					if (provider.subscribeEmail) {
						await provider.subscribeEmail(email)
					} else {
						// Alternative approach if direct method isn't available
						Logger.log(`WebSocket: Email subscription requested but method not available: ${email}`)
					}
					return {
						type,
						id,
						payload: { success: true },
					}

				default:
					throw new Error(`Unknown message type: ${type}`)
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : "Unknown error"
			Logger.log(`WebSocket: Error handling message: ${errorMessage}`)
			return {
				type: MessageType.Error,
				id,
				payload: { success: false, error: errorMessage },
			}
		}
	}

	/**
	 * Broadcasts state updates to all connected clients
	 */
	private async broadcastStateUpdates() {
		try {
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				return
			}

			const state = await provider.getStateToPostToWebview()

			this.wss.clients.forEach((client) => {
				if (client.readyState === WebSocketReadyState.OPEN) {
					const clientData = this.clients.get(client)
					if (!clientData) {
						return
					}

					// Check if client has event subscription
					const subscription = this.eventSubscriptions.get(clientData.id)

					// If client has subscription and it doesn't include state updates, skip
					if (
						subscription &&
						!subscription.eventTypes.includes("*") &&
						!subscription.eventTypes.includes("state") &&
						!subscription.eventTypes.includes(MessageType.StateUpdate)
					) {
						return
					}

					client.send(
						JSON.stringify({
							type: MessageType.StateUpdate,
							payload: { state },
						}),
					)
					this.metrics.messagesSent++
				}
			})
		} catch (error) {
			Logger.log(`WebSocket: Error broadcasting state updates: ${error instanceof Error ? error.message : "Unknown error"}`)
		}
	}

	/**
	 * Broadcasts a message to all clients with a specific taskId
	 */
	public broadcastToTask(taskId: string, message: WebSocketMessage) {
		this.clients.forEach((clientData, client) => {
			if (clientData.taskId === taskId && client.readyState === WebSocketReadyState.OPEN) {
				// Check if client has event subscription
				const subscription = this.eventSubscriptions.get(clientData.id)

				// If client has subscription and it doesn't include this message type, skip
				if (subscription && !subscription.eventTypes.includes("*") && !subscription.eventTypes.includes(message.type)) {
					return
				}

				client.send(JSON.stringify(message))
				this.metrics.messagesSent++
			}
		})
	}

	/**
	 * Broadcasts a message to specific clients based on event subscription
	 */
	public broadcastEvent(eventType: string, payload: any) {
		const message: WebSocketMessage = {
			type: eventType as MessageType,
			payload,
		}

		this.clients.forEach((clientData, client) => {
			if (client.readyState !== WebSocketReadyState.OPEN) {
				return
			}

			// Check if client has subscribed to this event type
			const subscription = this.eventSubscriptions.get(clientData.id)
			if (!subscription) {
				return
			}

			if (subscription.eventTypes.includes("*") || subscription.eventTypes.includes(eventType)) {
				client.send(JSON.stringify(message))
				this.metrics.messagesSent++
			}
		})
	}

	/**
	 * Updates API key for authentication
	 */
	public updateApiKey(apiKey: string) {
		this.apiKey = apiKey
		Logger.log("WebSocket: API key updated")
	}

	/**
	 * Returns server status
	 */
	public getStatus() {
		const uptimeMs = Date.now() - this.metrics.startTime

		return {
			running: this.isStarted,
			port: this.port,
			activeConnections: this.activeConnections,
			metrics: {
				uptime: uptimeMs,
				uptimeHuman: this.formatUptime(uptimeMs),
				messagesReceived: this.metrics.messagesReceived,
				messagesSent: this.metrics.messagesSent,
				errors: this.metrics.errors,
				messagesPerSecond: this.metrics.messagesReceived / (uptimeMs / 1000),
			},
			subscriptions: Array.from(this.eventSubscriptions.values()),
		}
	}
}

// Singleton instance
let websocketServer: WebSocketBridgeServer | null = null

/**
 * Gets or creates the WebSocket bridge server instance
 */
export function getWebSocketBridgeServer(port: number = 9000, apiKey: string = ""): WebSocketBridgeServer {
	if (!websocketServer) {
		websocketServer = new WebSocketBridgeServer(port, apiKey)
	}
	return websocketServer
}

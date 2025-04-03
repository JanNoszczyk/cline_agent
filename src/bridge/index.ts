import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { Logger } from "../services/logging/Logger"
import { getWebSocketBridgeServer, MessageType } from "./websocket-server"

// Define event handler interfaces if they don't exist in ClineProvider
interface EventHandlers {
	onDidChangeGlobalState?: (callback: (key: string, value: any) => void) => void
	onDidChangeTaskState?: (callback: (taskId: string, state: any) => void) => void
}

/**
 * Registers the Cline Bridge functionality in the extension
 *
 * This function registers the necessary commands for the bridge to function
 * and starts the WebSocket server.
 *
 * @param context The extension context
 * @param outputChannel The output channel for logging
 * @param provider The ClineProvider instance
 */
export async function registerClineBridge(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
	provider: ClineProvider, // Add provider parameter
) {
	Logger.log("Registering Cline Bridge...")

	// Define an async function to handle storing the API key from the environment
	const storeApiKeyFromEnv = async () => {
		const anthropicApiKeyFromEnv = process.env.ANTHROPIC_API_KEY
		if (anthropicApiKeyFromEnv) {
			Logger.log("Bridge: Found ANTHROPIC_API_KEY in environment, attempting to store in secrets...")
			try {
				await context.secrets.store("apiKey", anthropicApiKeyFromEnv)
				Logger.log("Bridge: ANTHROPIC_API_KEY stored successfully.")
			} catch (err: any) {
				// Explicitly type err as any or unknown
				Logger.log(`Bridge: Error storing ANTHROPIC_API_KEY: ${err instanceof Error ? err.message : String(err)}`)
			}
		} else {
			Logger.log("Bridge: ANTHROPIC_API_KEY not found in environment. Relying on existing secret storage.")
		}
	}

	// Call the async function and WAIT for it to complete before proceeding
	await storeApiKeyFromEnv()

	// No longer need to expose ClineProvider to global scope as we're using WebSocket server

	// Start the WebSocket server - get port and API key
	// Port should match what the Go client expects (CLINE_GO_WS_PORT, default 3002)
	const expectedPort = parseInt(process.env.CLINE_GO_WS_PORT || "3002", 10)
	// API key should match what the Go client sends (API_AUTH_TOKEN, default standalone-token)
	// Note: The server uses 'cline.bridge.apiKey' setting, while Go client uses API_AUTH_TOKEN env var.
	// For consistency, let's prioritize the environment variable if available, otherwise use setting.
	const expectedApiKey =
		process.env.API_AUTH_TOKEN ||
		vscode.workspace.getConfiguration("cline").get<string>("bridge.apiKey") ||
		"standalone-token" // Default matches docker-compose

	Logger.log(`Bridge: Configuring WebSocket server on port ${expectedPort} with API key "${expectedApiKey ? "***" : "none"}"`)

	// Start WebSocket server and add it to context.subscriptions so it gets disposed properly
	// Pass the provider instance to the server factory
	const wsServer = getWebSocketBridgeServer(provider, expectedPort, expectedApiKey) // Updated call signature
	wsServer.start().catch((err) => {
		Logger.log(`Failed to start WebSocket server on port ${expectedPort}: ${err.message}`)
	})

	// Add to subscriptions so it gets disposed when extension is deactivated
	context.subscriptions.push({
		dispose: () => {
			wsServer.stop().catch((err) => {
				Logger.log(`Error stopping WebSocket server: ${err.message}`)
			})
		},
	})

	// Register event listeners for ClineProvider state changes
	// Use the passed provider instance directly
	if (provider) {
		// Cast provider to EventHandlers to access event methods if they exist
		const providerWithEvents = provider as unknown as EventHandlers

		// Listen for state changes
		if (providerWithEvents.onDidChangeGlobalState) {
			providerWithEvents.onDidChangeGlobalState((key, value) => {
				// Broadcast the state change to subscribed clients
				wsServer.broadcastEvent("state_change", { key, value })
			})
		}

		// Listen for task state changes
		if (providerWithEvents.onDidChangeTaskState) {
			providerWithEvents.onDidChangeTaskState((taskId, state) => {
				// Broadcast to clients subscribed to this task
				wsServer.broadcastToTask(taskId, {
					type: MessageType.StateUpdate,
					taskId,
					payload: { state },
				})
			})
		}
	}

	// Register a command to restart the WebSocket server
	context.subscriptions.push(
		vscode.commands.registerCommand("claude.restartBridgeServer", async () => {
			Logger.log("Bridge: Restarting WebSocket server")
			await wsServer.stop()

			// Update config
			const newConfig = vscode.workspace.getConfiguration("cline")
			const newPort = newConfig.get<number>("bridge.port") || 9000
			const newApiKey = newConfig.get<string>("bridge.apiKey") || ""

			// Apply new settings, passing the existing provider instance
			const newServer = getWebSocketBridgeServer(provider, newPort, newApiKey) // Updated call signature
			await newServer.start()

			return { success: true }
		}),
	)

	// Register a command to get WebSocket server status
	context.subscriptions.push(
		vscode.commands.registerCommand("claude.getBridgeServerStatus", () => {
			Logger.log("Bridge: Getting WebSocket server status")
			return wsServer.getStatus()
		}),
	)

	// Register commands that the bridge might need
	context.subscriptions.push(
		vscode.commands.registerCommand("claude.initTask", async (task: string, images: string[] = []) => {
			Logger.log("Bridge: Initializing task")
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			await provider.initClineWithTask(task, images)
			// We need to use a different approach to get the task ID
			// Since we can't directly access the task ID, we'll return the current state
			// which should contain the current task information
			const state = await provider.getStateToPostToWebview()
			return state.currentTaskItem?.id
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.getGlobalState", async (key: string) => {
			Logger.log(`Bridge: Getting global state for key: ${key}`)
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			return provider.getGlobalState(key as any)
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.getTaskWithId", async (taskId: string) => {
			Logger.log(`Bridge: Getting task with ID: ${taskId}`)
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			return provider.getTaskWithId(taskId)
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.initWithHistoryItem", async (historyItem: any) => {
			Logger.log("Bridge: Initializing with history item")
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			await provider.initClineWithHistoryItem(historyItem)
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.cancelTask", async () => {
			Logger.log("Bridge: Canceling task")
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			await provider.cancelTask()
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.handleResponse", async (response: any, text: string, images: string[] = []) => {
			Logger.log("Bridge: Handling response")
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			// Post a message to the webview to handle the response
			// Using type assertion to bypass type checking since we know this message type is supported
			await provider.postMessageToWebview({
				type: "askResponse",
				askResponse: response,
				text,
				images,
			} as any)
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.getState", async () => {
			Logger.log("Bridge: Getting state")
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			return provider.getStateToPostToWebview()
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.updateApiConfig", async (config: any) => {
			Logger.log("Bridge: Updating API configuration")
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			await provider.updateApiConfiguration(config)
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.updateInstructions", async (instructions: string) => {
			Logger.log("Bridge: Updating custom instructions")
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			await provider.updateCustomInstructions(instructions)
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.toggleMode", async (settings: any) => {
			Logger.log(`Bridge: Toggling mode to ${settings.mode}`)
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			await provider.togglePlanActModeWithChatSettings(settings)
			return true
		}),
	)

	// File operations
	context.subscriptions.push(
		vscode.commands.registerCommand("claude.openFile", async (filePath: string) => {
			Logger.log(`Bridge: Opening file ${filePath}`)
			return vscode.commands.executeCommand("vscode.open", vscode.Uri.file(filePath))
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.openImage", async (imagePath: string) => {
			Logger.log(`Bridge: Opening image ${imagePath}`)
			return vscode.commands.executeCommand("vscode.open", vscode.Uri.file(imagePath))
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.openMention", async (mention: string) => {
			Logger.log(`Bridge: Opening mention ${mention}`)
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			// Using type assertion since this method will be implemented later
			await (provider as any).openMention(mention)
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.selectImages", async () => {
			Logger.log("Bridge: Selecting images")
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			// Using type assertion since this method will be implemented later
			return (provider as any).selectImages()
		}),
	)

	// Checkpoint operations
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"claude.checkpointDiff",
			async (taskId: string, messageTs: number, seeNewChangesSinceLastTaskCompletion: boolean) => {
				Logger.log(`Bridge: Showing checkpoint diff for message ${messageTs}`)
				const provider = ClineProvider.getVisibleInstance()
				if (!provider) {
					throw new Error("No visible Cline provider found")
				}
				// Using type assertion since this method will be implemented later
				await (provider as any).presentMultifileDiff(messageTs, seeNewChangesSinceLastTaskCompletion)
				return true
			},
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"claude.checkpointRestore",
			async (taskId: string, messageTs: number, restoreType: string) => {
				Logger.log(`Bridge: Restoring checkpoint for message ${messageTs}`)
				const provider = ClineProvider.getVisibleInstance()
				if (!provider) {
					throw new Error("No visible Cline provider found")
				}
				// Using type assertion since this method will be implemented later
				await (provider as any).restoreCheckpoint(messageTs, restoreType)
				return true
			},
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.checkLatestTaskCompletionChanges", async (taskId: string) => {
			Logger.log(`Bridge: Checking latest task completion changes for task ${taskId}`)
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				throw new Error("No visible Cline provider found")
			}
			// Using type assertion since this method will be implemented later
			return (provider as any).doesLatestTaskCompletionHaveNewChanges()
		}),
	)

	Logger.log("Cline Bridge registered successfully")
}

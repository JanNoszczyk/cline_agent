import * as vscode from "vscode"
// Update import to use WebviewProvider
import { WebviewProvider } from "../core/webview"
import { Logger } from "../services/logging/Logger"
import { getWebSocketBridgeServer, MessageType } from "./websocket-server"
// Remove outdated EventHandlers interface

/**
 * Registers the Cline Bridge functionality in the extension
 *
 * This function registers the necessary commands for the bridge to function
 * and starts the WebSocket server.
 *
 * @param context The extension context
 * @param outputChannel The output channel for logging
 * @param provider The WebviewProvider instance
 */
export async function registerClineBridge(
	context: vscode.ExtensionContext,
	outputChannel: vscode.OutputChannel,
	provider: WebviewProvider, // Update parameter type
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
	// Pass controller and provider to server factory
	const wsServer = getWebSocketBridgeServer(provider.controller, provider, expectedPort, expectedApiKey) // Updated call signature

	// Await the server start to ensure it's ready before activation completes
	try {
		await wsServer.start()
	} catch (err) {
		Logger.log(
			`Failed to start WebSocket server on port ${expectedPort}: ${err instanceof Error ? err.message : String(err)}`,
		)
		// Optionally re-throw or handle the error more gracefully if startup failure is critical
		// For now, we log and continue, but the bridge might not be functional.
	}

	// Add to subscriptions so it gets disposed when extension is deactivated
	context.subscriptions.push({
		dispose: () => {
			wsServer.stop().catch((err) => {
				Logger.log(`Error stopping WebSocket server: ${err.message}`)
			})
		},
	})

	// Remove event listener logic - state updates broadcasted by server's heartbeat
	// if (provider) { ... }

	// Register a command to restart the WebSocket server
	context.subscriptions.push(
		vscode.commands.registerCommand("claude.restartBridgeServer", async () => {
			Logger.log("Bridge: Restarting WebSocket server")
			await wsServer.stop()

			// Update config
			const newConfig = vscode.workspace.getConfiguration("cline")
			const newPort = newConfig.get<number>("bridge.port") || 3002 // Default to 3002
			const newApiKey =
				newConfig.get<string>("bridge.apiKey") ||
				process.env.API_AUTH_TOKEN || // Prioritize env var
				"standalone-token" // Default

			// Apply new settings, passing the existing controller and provider instances
			const newServer = getWebSocketBridgeServer(provider.controller, provider, newPort, newApiKey) // Updated call signature
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
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller) {
				throw new Error("No visible Cline controller found")
			}
			await controller.initClineWithTask(task, images)
			const state = await controller.getStateToPostToWebview()
			return state.currentTaskItem?.id
		}),
	)

	// Note: Global state isn't directly exposed via Controller. Bridge clients should use state_request.
	// context.subscriptions.push(
	// 	vscode.commands.registerCommand("claude.getGlobalState", ...)
	// )

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.getTaskWithId", async (taskId: string) => {
			Logger.log(`Bridge: Getting task with ID: ${taskId}`)
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller) {
				throw new Error("No visible Cline controller found")
			}
			// getTaskWithId is available on Controller
			return controller.getTaskWithId(taskId)
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.initWithHistoryItem", async (historyItem: any) => {
			Logger.log("Bridge: Initializing with history item")
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller) {
				throw new Error("No visible Cline controller found")
			}
			await controller.initClineWithHistoryItem(historyItem)
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.cancelTask", async () => {
			Logger.log("Bridge: Canceling task")
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller) {
				throw new Error("No visible Cline controller found")
			}
			await controller.cancelTask()
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.handleResponse", async (response: any, text: string, images: string[] = []) => {
			Logger.log("Bridge: Handling response")
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller) {
				throw new Error("No visible Cline controller found")
			}
			// Use handleWebviewMessage on the controller
			await controller.handleWebviewMessage({
				type: "askResponse",
				askResponse: response,
				text,
				images,
			} as any) // Use type assertion if needed
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.getState", async () => {
			Logger.log("Bridge: Getting state")
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller) {
				throw new Error("No visible Cline controller found")
			}
			return controller.getStateToPostToWebview()
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.updateApiConfig", async (config: any) => {
			Logger.log("Bridge: Updating API configuration")
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller) {
				throw new Error("No visible Cline controller found")
			}
			// Use handleWebviewMessage on the controller
			await controller.handleWebviewMessage({
				type: "apiConfiguration",
				apiConfiguration: config,
			})
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.updateInstructions", async (instructions: string) => {
			Logger.log("Bridge: Updating custom instructions")
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller) {
				throw new Error("No visible Cline controller found")
			}
			// Use handleWebviewMessage on the controller
			await controller.handleWebviewMessage({
				type: "updateSettings", // Assuming this handles custom instructions
				customInstructionsSetting: instructions,
			})
			// Alternatively, if updateCustomInstructions is public on controller:
			// await controller.updateCustomInstructions(instructions)
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.toggleMode", async (settings: any) => {
			Logger.log(`Bridge: Toggling mode to ${settings.mode}`)
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller) {
				throw new Error("No visible Cline controller found")
			}
			await controller.togglePlanActModeWithChatSettings(settings)
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
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller) {
				throw new Error("No visible Cline controller found")
			}
			// Use handleWebviewMessage on the controller
			await controller.handleWebviewMessage({ type: "openMention", text: mention })
			return true
		}),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.selectImages", async () => {
			Logger.log("Bridge: Selecting images")
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller) {
				throw new Error("No visible Cline controller found")
			}
			// Use handleWebviewMessage on the controller
			// The result comes back via 'selectedImages' message
			await controller.handleWebviewMessage({ type: "selectImages" })
			// Return true to indicate initiation, not the result itself
			return true
		}),
	)

	// Checkpoint operations
	context.subscriptions.push(
		vscode.commands.registerCommand(
			"claude.checkpointDiff",
			async (taskId: string, messageTs: number, seeNewChangesSinceLastTaskCompletion: boolean) => {
				Logger.log(`Bridge: Showing checkpoint diff for message ${messageTs}`)
				const controller = WebviewProvider.getVisibleInstance()?.controller
				if (!controller?.task) {
					throw new Error("No active Cline task found for checkpoint diff")
				}
				// Call directly on the active task via controller
				await controller.task.presentMultifileDiff(messageTs, seeNewChangesSinceLastTaskCompletion)
				return true
			},
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand(
			"claude.checkpointRestore",
			async (taskId: string, messageTs: number, restoreType: string) => {
				Logger.log(`Bridge: Restoring checkpoint for message ${messageTs}`)
				const controller = WebviewProvider.getVisibleInstance()?.controller
				if (!controller) {
					// Need controller to cancel/re-init
					throw new Error("No visible Cline controller found for checkpoint restore")
				}
				// Call handleWebviewMessage to manage cancellation and restore
				await controller.handleWebviewMessage({
					type: "checkpointRestore",
					number: messageTs,
					text: restoreType,
				})
				return true
			},
		),
	)

	context.subscriptions.push(
		vscode.commands.registerCommand("claude.checkLatestTaskCompletionChanges", async (taskId: string) => {
			Logger.log(`Bridge: Checking latest task completion changes for task ${taskId}`)
			const controller = WebviewProvider.getVisibleInstance()?.controller
			if (!controller?.task) {
				throw new Error("No active Cline task found for checking changes")
			}
			// Call directly on the active task via controller
			return controller.task.doesLatestTaskCompletionHaveNewChanges()
		}),
	)

	Logger.log("Cline Bridge registered successfully")
}

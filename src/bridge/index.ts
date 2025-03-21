import * as vscode from "vscode"
import { ClineProvider } from "../core/webview/ClineProvider"
import { Logger } from "../services/logging/Logger"

/**
 * Registers the Cline Bridge functionality in the extension
 *
 * This function exposes the ClineProvider to the global scope so that
 * the bridge JavaScript file can access it. It also registers the
 * necessary commands for the bridge to function.
 *
 * @param context The extension context
 * @param outputChannel The output channel for logging
 */
export function registerClineBridge(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
	Logger.log("Registering Cline Bridge...")

	// Expose ClineProvider to global scope for bridge.js to access
	// @ts-ignore - Intentionally adding to global scope
	global.ClineProvider = ClineProvider

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

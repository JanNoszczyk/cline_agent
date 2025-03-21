/**
 * Bridge between Go WebSocket server and ClineProvider
 *
 * This file contains functions that bridge between the Go WebSocket server
 * and the ClineProvider in the VSCode extension. The Go server will call
 * these functions through WebSocket or another IPC mechanism.
 *
 * Version: 2.1.0 - Enhanced with file operations and checkpoint functionality
 */

"use strict"

/**
 * Helper function to get the ClineProvider instance
 * @returns {Object|null} The ClineProvider instance or null if not available
 */
function getClineProvider() {
	try {
		// Try to get the ClineProvider from global scope or require
		if (typeof ClineProvider !== "undefined" && ClineProvider.getVisibleInstance) {
			return ClineProvider.getVisibleInstance()
		}
		// If not available in global scope, try accessing it through VS Code API
		if (typeof vscode !== "undefined" && vscode.commands) {
			return vscode.commands.executeCommand("cline.getProvider")
		}
		return null
	} catch (error) {
		console.error("Error getting ClineProvider:", error.message)
		return null
	}
}

/**
 * Validates that the task ID matches the current task
 * @param {Object} provider - The ClineProvider instance
 * @param {string} taskId - The task ID to validate
 * @returns {Promise<boolean>} A promise that resolves to true if the task ID is valid
 */
async function validateTaskId(provider, taskId) {
	try {
		const currentTaskId = await provider.getGlobalState("currentTaskId")
		return currentTaskId === taskId
	} catch (error) {
		console.error("Error validating task ID:", error.message)
		return false
	}
}

/**
 * Execute a command in VS Code with proper error handling
 * @param {string} command - The command to execute
 * @param {...any} args - Arguments to pass to the command
 * @returns {Promise<any>} A promise that resolves to the command result
 */
async function executeVSCodeCommand(command, ...args) {
	try {
		if (typeof vscode !== "undefined" && vscode.commands) {
			return await vscode.commands.executeCommand(command, ...args)
		}
		throw new Error("VS Code API not available")
	} catch (error) {
		console.error(`Error executing VS Code command ${command}:`, error.message)
		throw error
	}
}

// Export the functions to be used by the Go server
module.exports = {
	// Utility functions (exported for use by other modules)
	getClineProvider,
	validateTaskId,
	executeVSCodeCommand,

	// Health check function
	async ping() {
		try {
			const provider = getClineProvider()
			// If we can get the provider, return a successful response
			return {
				pong: true,
				timestamp: Date.now(),
				hasProvider: !!provider,
			}
		} catch (error) {
			return {
				pong: false,
				error: error.message,
				timestamp: Date.now(),
			}
		}
	},

	// Task handlers
	async handleTaskInit(task, images) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			await provider.initClineWithTask(task, images)
			const taskId = await provider.getGlobalState("currentTaskId")
			if (!taskId) {
				throw new Error("Failed to initialize task")
			}

			return { success: true, taskId }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	async handleTaskResume(taskId) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			const { historyItem } = await provider.getTaskWithId(taskId)
			await provider.initClineWithHistoryItem(historyItem)

			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	async handleTaskCancel(taskId) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			if (!(await validateTaskId(provider, taskId))) {
				throw new Error("Task ID does not match current task")
			}

			await provider.cancelTask()
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	async handleTaskResponse(taskId, response, text, images) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			if (!(await validateTaskId(provider, taskId))) {
				throw new Error("Task ID does not match current task")
			}

			await provider.handleWebviewAskResponse(response, text, images)
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	// State handlers
	async handleStateRequest() {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			const state = await provider.getStateToPostToWebview()
			return { success: true, state }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	// Settings handlers
	async handleSettingsUpdate(type, config, instructions, settings) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			switch (type) {
				case "api":
					await provider.updateApiConfiguration(config)
					break
				case "customInstructions":
					await provider.updateCustomInstructions(instructions)
					break
				case "autoApproval":
					await provider.updateGlobalState("autoApprovalSettings", settings)
					break
				case "browser":
					await provider.updateGlobalState("browserSettings", settings)
					break
				case "chat":
					await provider.updateGlobalState("chatSettings", settings)
					break
				default:
					throw new Error(`Unknown settings type: ${type}`)
			}

			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	// Chat mode handlers
	async handleChatModeUpdate(mode) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			await provider.togglePlanActModeWithChatSettings({ mode })
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	// Auth handlers
	async handleAuthToken(token) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			await provider.setAuthToken(token)
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	async handleAuthUser(userInfo) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			await provider.setUserInfo(userInfo)
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	async handleAuthSignout() {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			await provider.handleSignOut()
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	// MCP handlers
	async handleMcpRequest(action, taskId, mcpId, serverName, toolName, autoApprove, disabled) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			let result
			switch (action) {
				case "getTaskHistory":
					result = (await provider.getGlobalState("taskHistory")) || []
					break
				case "getTaskWithId":
					const { historyItem } = await provider.getTaskWithId(taskId)
					result = historyItem
					break
				case "deleteTaskWithId":
					await provider.deleteTaskWithId(taskId)
					result = { success: true }
					break
				case "exportTaskWithId":
					result = await provider.exportTaskWithId(taskId)
					break
				case "getMcpMarketplaceCatalog":
					result = await provider.getGlobalState("mcpMarketplaceCatalog")
					break
				case "downloadMcp":
					await provider.downloadMcp(mcpId)
					result = { success: true }
					break
				case "toggleMcpServer":
					await provider.mcpHub?.toggleServerDisabled(serverName, disabled)
					result = { success: true }
					break
				case "toggleToolAutoApprove":
					await provider.mcpHub?.toggleToolAutoApprove(serverName, toolName, autoApprove)
					result = { success: true }
					break
				case "restartMcpServer":
					await provider.mcpHub?.restartConnection(serverName)
					result = { success: true }
					break
				case "deleteMcpServer":
					await provider.mcpHub?.deleteServer(serverName)
					result = { success: true }
					break
				case "getMcpServers":
					result = provider.mcpHub?.getServers() || []
					break
				default:
					throw new Error(`Unknown MCP action: ${action}`)
			}

			return { success: true, result }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	// Subscribe handlers
	async handleSubscribe(email) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			await provider.subscribeEmail(email)
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	// File operations
	async handleOpenFile(filePath) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			await executeVSCodeCommand("vscode.open", filePath)
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	async handleOpenImage(imagePath) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			await executeVSCodeCommand("vscode.open", imagePath)
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	async handleOpenMention(mention) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			await executeVSCodeCommand("claude.openMention", mention)
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	async handleSelectImages() {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			const images = await executeVSCodeCommand("claude.selectImages")
			return { success: true, images }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	// Checkpoint operations
	async handleCheckpointDiff(taskId, messageTs, seeNewChangesSinceLastTaskCompletion) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			if (!(await validateTaskId(provider, taskId))) {
				throw new Error("Task ID does not match current task")
			}

			await executeVSCodeCommand("claude.checkpointDiff", taskId, messageTs, seeNewChangesSinceLastTaskCompletion)
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	async handleCheckpointRestore(taskId, messageTs, restoreType) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			if (!(await validateTaskId(provider, taskId))) {
				throw new Error("Task ID does not match current task")
			}

			await executeVSCodeCommand("claude.checkpointRestore", taskId, messageTs, restoreType)
			return { success: true }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},

	async handleCheckLatestTaskCompletionChanges(taskId) {
		try {
			const provider = getClineProvider()
			if (!provider) {
				throw new Error("ClineProvider not available")
			}

			if (!(await validateTaskId(provider, taskId))) {
				throw new Error("Task ID does not match current task")
			}

			const hasNewChanges = await executeVSCodeCommand("claude.checkLatestTaskCompletionChanges", taskId)
			return { success: true, hasNewChanges }
		} catch (error) {
			return { success: false, error: error.message }
		}
	},
}

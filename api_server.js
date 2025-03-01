#!/usr/bin/env node

/**
 * Consolidated API Server for Cline
 *
 * This is a standalone version of the API server that requires the VSCode extension with a real ClineProvider.
 * It provides all the functionality of the original API server without any mock implementations.
 *
 * Features:
 * - Express-based API server with all endpoints from the original implementation
 * - API key authentication
 * - CORS support
 * - Proper error handling when ClineProvider is not available
 * - Comprehensive error handling
 */

"use strict"
const express = require("express")
const http = require("http")

/**
 * This API server requires a real ClineProvider instance from the VSCode extension.
 * It does not use any mock implementations and will return appropriate errors
 * when the real provider is not available.
 */

// Helper function to get the ClineProvider instance
const getClineProvider = () => {
	try {
		// Try to get the real ClineProvider if available
		if (typeof ClineProvider !== "undefined" && ClineProvider.getVisibleInstance) {
			return ClineProvider.getVisibleInstance()
		}
		return null
	} catch (error) {
		console.error("Error getting ClineProvider:", error.message)
		return null
	}
}
// Port configuration
const port = process.env.PORT || 3000
const app = express()

// Middleware for parsing JSON bodies with increased limit for large payloads
app.use(express.json({ limit: "50mb" }))
// CORS middleware to allow cross-origin requests
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*")
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
	res.setHeader("Access-Control-Allow-Headers", "X-API-Key, Content-Type")

	if (req.method === "OPTIONS") {
		res.status(204).end()
		return
	}

	next()
})
// API key authentication middleware
app.use((req, res, next) => {
	const apiKey = req.header("X-API-Key")

	// Get API key from global state or environment variable
	let validApiKey = null
	try {
		// Try to get from VSCode extension context if available
		const context = global.extensionContext
		if (context && context.globalState) {
			validApiKey = context.globalState.get("apiKey") || null
		}
	} catch (error) {
		console.warn("Could not access VSCode extension context:", error.message)
	}

	// Fallback to environment variable
	if (!validApiKey) {
		validApiKey = process.env.CLINE_API_KEY || "default-dev-key"
	}

	if (!apiKey || apiKey !== validApiKey) {
		res.status(401).json({ message: "Unauthorized: Invalid or missing API key." })
		return
	}

	next()
})
// Helper function to create route handlers
function createHandler(handlerFn) {
	return async (req, res) => {
		try {
			const provider = getClineProvider()
			if (!provider) {
				res.status(503).json({ message: "Cline provider not available." })
				return
			}

			const result = await handlerFn(provider, req)
			res.status(result?.status || 200).json(result?.data || result || {})
			return
		} catch (error) {
			console.error("API error:", error.message)
			res.status(500).json({ message: error.message })
			return
		}
	}
}
// Helper function to validate task ID
async function validateTaskId(provider, taskId) {
	const currentTaskId = await provider.getGlobalState("currentTaskId")
	if (currentTaskId !== taskId) {
		throw new Error("Task ID does not match current task.")
	}
}
// --- Task Management ---
app.post(
	"/api/tasks",
	createHandler(async (provider, req) => {
		const { task, images } = req.body
		await provider.initClineWithTask(task, images)
		const taskId = await provider.getGlobalState("currentTaskId")
		if (!taskId) {
			throw new Error("Failed to initialize task.")
		}
		return { status: 201, data: { taskId } }
	}),
)

app.post(
	"/api/tasks/:taskId/resume",
	createHandler(async (provider, req) => {
		const { taskId } = req.params
		const { historyItem } = await provider.getTaskWithId(taskId)
		await provider.initClineWithHistoryItem(historyItem)
		return { status: 200, data: { success: true } }
	}),
)

app.post(
	"/api/tasks/:taskId/cancel",
	createHandler(async (provider, req) => {
		const { taskId } = req.params
		await validateTaskId(provider, taskId)
		await provider.cancelTask()
		return { status: 200, data: { success: true } }
	}),
)

app.get(
	"/api/tasks",
	createHandler(async (provider) => {
		const taskHistory = (await provider.getGlobalState("taskHistory")) || []
		return taskHistory
	}),
)

app.get(
	"/api/tasks/:taskId",
	createHandler(async (provider, req) => {
		const { taskId } = req.params
		const { historyItem } = await provider.getTaskWithId(taskId)
		if (!historyItem) {
			throw new Error("Task not found.")
		}
		return historyItem
	}),
)

app.delete(
	"/api/tasks/:taskId",
	createHandler(async (provider, req) => {
		const { taskId } = req.params
		await provider.deleteTaskWithId(taskId)
		return { status: 200, data: { success: true } }
	}),
)

app.get(
	"/api/tasks/:taskId/export",
	createHandler(async (provider, req) => {
		const { taskId } = req.params
		return provider.exportTaskWithId(taskId)
	}),
)
// --- Interaction with Cline ---
app.post(
	"/api/tasks/:taskId/response",
	createHandler(async (provider, req) => {
		const { taskId } = req.params
		const { response, text, images } = req.body
		await validateTaskId(provider, taskId)
		await provider.handleWebviewAskResponse(response, text, images)
		return { status: 200, data: { success: true } }
	}),
)
// --- Webview Management ---
app.get(
	"/api/state",
	createHandler(async (provider) => {
		return provider.getStateToPostToWebview()
	}),
)

app.post(
	"/api/webview/message",
	createHandler(async (provider, req) => {
		await provider.postMessageToWebview(req.body)
		return { status: 200, data: { success: true } }
	}),
)
// --- Settings Management ---
app.put(
	"/api/settings/api",
	createHandler(async (provider, req) => {
		await provider.updateApiConfiguration(req.body)
		return { status: 200, data: { success: true } }
	}),
)

app.put(
	"/api/settings/customInstructions",
	createHandler(async (provider, req) => {
		const { instructions } = req.body
		await provider.updateCustomInstructions(instructions)
		return { status: 200, data: { success: true } }
	}),
)

app.put(
	"/api/settings/autoApproval",
	createHandler(async (provider, req) => {
		await provider.updateGlobalState("autoApprovalSettings", req.body)
		return { status: 200, data: { success: true } }
	}),
)

app.put(
	"/api/settings/browser",
	createHandler(async (provider, req) => {
		await provider.updateGlobalState("browserSettings", req.body)
		return { status: 200, data: { success: true } }
	}),
)

app.put(
	"/api/settings/chat",
	createHandler(async (provider, req) => {
		await provider.updateGlobalState("chatSettings", req.body)
		return { status: 200, data: { success: true } }
	}),
)

app.put(
	"/api/settings/chat/mode",
	createHandler(async (provider, req) => {
		const { mode } = req.body
		await provider.togglePlanActModeWithChatSettings({ mode })
		return { status: 200, data: { success: true } }
	}),
)
// --- Authentication ---
app.post(
	"/api/auth/token",
	createHandler(async (provider, req) => {
		const { token } = req.body
		await provider.setAuthToken(token)
		return { status: 200, data: { success: true } }
	}),
)

app.post(
	"/api/auth/user",
	createHandler(async (provider, req) => {
		const { displayName, email, photoURL } = req.body
		await provider.setUserInfo({ displayName, email, photoURL })
		return { status: 200, data: { success: true } }
	}),
)

app.post(
	"/api/auth/signout",
	createHandler(async (provider) => {
		await provider.handleSignOut()
		return { status: 200, data: { success: true } }
	}),
)
// --- MCP Management ---
app.get(
	"/api/mcp/marketplace",
	createHandler(async (provider) => {
		const catalog = await provider.getGlobalState("mcpMarketplaceCatalog")
		return catalog
	}),
)

app.post(
	"/api/mcp/download",
	createHandler(async (provider, req) => {
		const { mcpId } = req.body
		await provider.downloadMcp(mcpId)
		return { status: 200, data: { success: true } }
	}),
)

app.put(
	"/api/mcp/servers/:serverName/toggle",
	createHandler(async (provider, req) => {
		const { serverName } = req.params
		const { disabled } = req.body
		await provider.mcpHub?.toggleServerDisabled(serverName, disabled)
		return { status: 200, data: { success: true } }
	}),
)

app.put(
	"/api/mcp/servers/:serverName/tools/:toolName/toggleAutoApprove",
	createHandler(async (provider, req) => {
		const { serverName, toolName } = req.params
		const { autoApprove } = req.body
		await provider.mcpHub?.toggleToolAutoApprove(serverName, toolName, autoApprove)
		return { status: 200, data: { success: true } }
	}),
)

app.post(
	"/api/mcp/servers/:serverName/restart",
	createHandler(async (provider, req) => {
		const { serverName } = req.params
		await provider.mcpHub?.restartConnection(serverName)
		return { status: 200, data: { success: true } }
	}),
)

app.delete(
	"/api/mcp/servers/:serverName",
	createHandler(async (provider, req) => {
		const { serverName } = req.params
		await provider.mcpHub?.deleteServer(serverName)
		return { status: 200, data: { success: true } }
	}),
)
// --- Miscellaneous ---
app.post(
	"/api/subscribe",
	createHandler(async (provider, req) => {
		const { email } = req.body
		await provider.subscribeEmail(email)
		return { status: 200, data: { success: true } }
	}),
)
// Start the server
const server = http.createServer(app)
server.listen(port, "0.0.0.0", () => {
	console.log(`Consolidated API server listening on port ${port}`)
	console.log(`API Key: ${process.env.CLINE_API_KEY || "default-dev-key"}`)
})

// Handle graceful shutdown
process.on("SIGINT", () => {
	console.log("Shutting down server...")
	server.close(() => {
		console.log("Server shut down")
		process.exit(0)
	})
})

// Export the app for testing

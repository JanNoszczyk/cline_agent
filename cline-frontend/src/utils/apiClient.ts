import { ApiConfiguration } from "../context/ExtensionStateContext"
import { ClineAskResponse } from "../types/WebviewMessage"

// Base URL for the API server
const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:3001"

// API key for authentication
let API_KEY = process.env.REACT_APP_API_KEY || ""

/**
 * Set the API key for authentication
 * @param key The API key
 */
export const setApiKey = (key: string) => {
	API_KEY = key
}

/**
 * Base fetch function with error handling and authentication
 * @param endpoint The API endpoint
 * @param options Fetch options
 * @returns The response data
 */
async function fetchWithAuth(endpoint: string, options: RequestInit = {}) {
	const url = `${API_BASE_URL}${endpoint}`

	// Add authentication header
	const headers = {
		"Content-Type": "application/json",
		"X-API-Key": API_KEY,
		...options.headers,
	}

	try {
		const response = await fetch(url, {
			...options,
			headers,
		})

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}))
			throw new Error(errorData.message || `API request failed with status ${response.status}`)
		}

		// For 204 No Content responses
		if (response.status === 204) {
			return null
		}

		return await response.json()
	} catch (error) {
		console.error("API request failed:", error)
		throw error
	}
}

/**
 * API client for interacting with the Cline API
 */
export const apiClient = {
	/**
	 * Initialize a new task
	 * @param task The task description
	 * @param images Optional images to include with the task
	 * @returns The task ID
	 */
	initTask: async (task: string, images?: string[]) => {
		const response = await fetchWithAuth("/api/tasks", {
			method: "POST",
			body: JSON.stringify({ task, images: images || [] }),
		})
		return response.taskId
	},

	/**
	 * Resume a task
	 * @param taskId The task ID to resume
	 */
	resumeTask: async (taskId: string) => {
		await fetchWithAuth(`/api/tasks/${taskId}/resume`, {
			method: "POST",
		})
	},

	/**
	 * Cancel the current task
	 * @param taskId The task ID to cancel
	 */
	cancelTask: async (taskId: string) => {
		await fetchWithAuth(`/api/tasks/${taskId}/cancel`, {
			method: "POST",
		})
	},

	/**
	 * Get all tasks
	 * @returns Array of history items
	 */
	getTasks: async () => {
		return await fetchWithAuth("/api/tasks")
	},

	/**
	 * Get a specific task
	 * @param taskId The task ID
	 * @returns The history item for the task
	 */
	getTask: async (taskId: string) => {
		return await fetchWithAuth(`/api/tasks/${taskId}`)
	},

	/**
	 * Delete a task
	 * @param taskId The task ID to delete
	 */
	deleteTask: async (taskId: string) => {
		await fetchWithAuth(`/api/tasks/${taskId}`, {
			method: "DELETE",
		})
	},

	/**
	 * Export a task
	 * @param taskId The task ID to export
	 * @returns The exported task data
	 */
	exportTask: async (taskId: string) => {
		return await fetchWithAuth(`/api/tasks/${taskId}/export`)
	},

	/**
	 * Handle a response to Cline's ask
	 * @param taskId The current task ID
	 * @param response The response type
	 * @param text Optional text response
	 * @param images Optional images to include
	 */
	handleResponse: async (taskId: string, response: ClineAskResponse, text?: string, images?: string[]) => {
		await fetchWithAuth(`/api/tasks/${taskId}/response`, {
			method: "POST",
			body: JSON.stringify({ response, text, images }),
		})
	},

	/**
	 * Get the current extension state
	 * @returns The current extension state
	 */
	getState: async () => {
		return await fetchWithAuth("/api/state")
	},

	/**
	 * Post a message to the webview
	 * @param message The message to post
	 */
	postMessage: async (message: any) => {
		await fetchWithAuth("/api/webview/message", {
			method: "POST",
			body: JSON.stringify(message),
		})
	},

	/**
	 * Update the API configuration
	 * @param config The new API configuration
	 */
	updateApiConfiguration: async (config: ApiConfiguration) => {
		await fetchWithAuth("/api/settings/api", {
			method: "PUT",
			body: JSON.stringify(config),
		})
	},

	/**
	 * Update custom instructions
	 * @param instructions The new custom instructions
	 */
	updateCustomInstructions: async (instructions: string) => {
		await fetchWithAuth("/api/settings/customInstructions", {
			method: "PUT",
			body: JSON.stringify({ instructions }),
		})
	},

	/**
	 * Update auto approval settings
	 * @param settings The new auto approval settings
	 */
	updateAutoApprovalSettings: async (settings: any) => {
		await fetchWithAuth("/api/settings/autoApproval", {
			method: "PUT",
			body: JSON.stringify(settings),
		})
	},

	/**
	 * Update browser settings
	 * @param settings The new browser settings
	 */
	updateBrowserSettings: async (settings: any) => {
		await fetchWithAuth("/api/settings/browser", {
			method: "PUT",
			body: JSON.stringify(settings),
		})
	},

	/**
	 * Update chat settings
	 * @param settings The new chat settings
	 */
	updateChatSettings: async (settings: any) => {
		await fetchWithAuth("/api/settings/chat", {
			method: "PUT",
			body: JSON.stringify(settings),
		})
	},

	/**
	 * Toggle between plan and act mode
	 * @param mode The mode to set ('plan' or 'act')
	 */
	togglePlanActMode: async (mode: "plan" | "act") => {
		await fetchWithAuth("/api/settings/chat/mode", {
			method: "PUT",
			body: JSON.stringify({ mode }),
		})
	},

	/**
	 * Set the authentication token
	 * @param token The authentication token
	 */
	setAuthToken: async (token: string) => {
		await fetchWithAuth("/api/auth/token", {
			method: "POST",
			body: JSON.stringify({ token }),
		})
	},

	/**
	 * Set user information
	 * @param displayName The user's display name
	 * @param email The user's email
	 * @param photoURL The user's photo URL
	 */
	setUserInfo: async (displayName: string | null, email: string | null, photoURL: string | null) => {
		await fetchWithAuth("/api/auth/user", {
			method: "POST",
			body: JSON.stringify({ displayName, email, photoURL }),
		})
	},

	/**
	 * Sign out the current user
	 */
	signOut: async () => {
		await fetchWithAuth("/api/auth/signout", {
			method: "POST",
		})
	},

	/**
	 * Get the MCP marketplace catalog
	 * @returns The MCP marketplace catalog
	 */
	getMcpMarketplace: async () => {
		return await fetchWithAuth("/api/mcp/marketplace")
	},

	/**
	 * Download an MCP
	 * @param mcpId The MCP ID to download
	 */
	downloadMcp: async (mcpId: string) => {
		await fetchWithAuth("/api/mcp/download", {
			method: "POST",
			body: JSON.stringify({ mcpId }),
		})
	},

	/**
	 * Toggle an MCP server
	 * @param serverName The server name
	 * @param disabled Whether the server should be disabled
	 */
	toggleMcpServer: async (serverName: string, disabled: boolean) => {
		await fetchWithAuth(`/api/mcp/servers/${serverName}/toggle`, {
			method: "PUT",
			body: JSON.stringify({ disabled }),
		})
	},

	/**
	 * Toggle auto-approve for an MCP tool
	 * @param serverName The server name
	 * @param toolName The tool name
	 * @param autoApprove Whether the tool should be auto-approved
	 */
	toggleToolAutoApprove: async (serverName: string, toolName: string, autoApprove: boolean) => {
		await fetchWithAuth(`/api/mcp/servers/${serverName}/tools/${toolName}/toggleAutoApprove`, {
			method: "PUT",
			body: JSON.stringify({ autoApprove }),
		})
	},

	/**
	 * Restart an MCP server
	 * @param serverName The server name to restart
	 */
	restartMcpServer: async (serverName: string) => {
		await fetchWithAuth(`/api/mcp/servers/${serverName}/restart`, {
			method: "POST",
		})
	},

	/**
	 * Delete an MCP server
	 * @param serverName The server name to delete
	 */
	deleteMcpServer: async (serverName: string) => {
		await fetchWithAuth(`/api/mcp/servers/${serverName}`, {
			method: "DELETE",
		})
	},

	/**
	 * Subscribe with an email
	 * @param email The email to subscribe
	 */
	subscribeEmail: async (email: string) => {
		await fetchWithAuth("/api/subscribe", {
			method: "POST",
			body: JSON.stringify({ email }),
		})
	},
}

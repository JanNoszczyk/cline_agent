import express, { Request, Response, NextFunction, RequestHandler } from "express"
import * as vscode from "vscode"
import { ClineProvider, GlobalStateKey } from "../core/webview/ClineProvider"
import { HistoryItem } from "../shared/HistoryItem"
import { AutoApprovalSettings } from "../shared/AutoApprovalSettings"
import { BrowserSettings } from "../shared/BrowserSettings"
import { ChatSettings } from "../shared/ChatSettings"
import { ClineAskResponse } from "../shared/WebviewMessage"
import { ApiConfiguration } from "../shared/api"
import { McpMarketplaceCatalog } from "../shared/mcp"

// API key should be managed via VSCode secrets or global state for VSCode plugin context.
// Accessing API key from global state for now, consider using SecretStorage for better security.
// const CLINE_API_KEY = process.env.CLINE_API_KEY; // Environment variable is not suitable for VSCode extension context
// if (!CLINE_API_KEY) {
//   console.warn("CLINE_API_KEY environment variable not set.");
// }

type HandlerFunction = (provider: ClineProvider, req: Request) => Promise<any>

function createHandler(handlerFn: HandlerFunction): RequestHandler {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			const provider = ClineProvider.getVisibleInstance()
			if (!provider) {
				res.status(503).json({ message: "Cline provider not available." })
				return
			}
			const result = await handlerFn(provider, req)
			res.status(result?.status || 200).json(result?.data || result || {})
			return
		} catch (error: any) {
			res.status(500).json({ message: error.message })
			return
		}
	}
}

async function validateTaskId(provider: ClineProvider, taskId: string) {
	const currentTaskId = await provider.getGlobalState("currentTaskId" as GlobalStateKey)
	if (currentTaskId !== taskId) {
		throw new Error("Task ID does not match current task.")
	}
}

export function setupApiServer(context: vscode.ExtensionContext): express.Express {
	const apiServer = express()
	apiServer.use(express.json({ limit: "50mb" }))

	apiServer.use((req: Request, res: Response, next: NextFunction) => {
		let apiKey = context.globalState.get("apiKey")
		if (!apiKey) {
			// Fallback to environment variable if API key is not in global state
			apiKey = process.env.CLINE_API_KEY;
		}
		const providedApiKey = req.header("X-API-Key")

		if (!providedApiKey || providedApiKey !== apiKey) {
			res.status(401).json({ message: "Unauthorized: Invalid or missing API key." })
			return
		}

		next()
	})

	// --- Task Management ---
	apiServer.post(
		"/api/tasks",
		createHandler(async (provider, req) => {
			const { task, images } = req.body
			await provider.initClineWithTask(task, images)
			const taskId = await provider.getGlobalState("currentTaskId" as GlobalStateKey)
			if (!taskId) {
				throw new Error("Failed to initialize task.")
			}
			return { status: 201, data: { taskId } }
		}),
	)

	apiServer.post(
		"/api/tasks/:taskId/resume",
		createHandler(async (provider, req) => {
			const { taskId } = req.params
			const { historyItem } = await provider.getTaskWithId(taskId)
			await provider.initClineWithHistoryItem(historyItem)
		}),
	)

	apiServer.post(
		"/api/tasks/:taskId/cancel",
		createHandler(async (provider, req) => {
			const { taskId } = req.params
			await validateTaskId(provider, taskId)
			await provider.cancelTask()
		}),
	)

	apiServer.get(
		"/api/tasks",
		createHandler(async (provider) => {
			const taskHistory = (await provider.getGlobalState("taskHistory" as GlobalStateKey)) as HistoryItem[] | undefined
			return taskHistory || []
		}),
	)

	apiServer.get(
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

	apiServer.delete(
		"/api/tasks/:taskId",
		createHandler(async (provider, req) => {
			const { taskId } = req.params
			await provider.deleteTaskWithId(taskId)
		}),
	)

	apiServer.get(
		"/api/tasks/:taskId/export",
		createHandler(async (provider, req) => {
			const { taskId } = req.params
			return provider.exportTaskWithId(taskId)
		}),
	)

	// --- Interaction with Cline ---
	apiServer.post(
		"/api/tasks/:taskId/response",
		createHandler(async (provider, req) => {
			const { taskId } = req.params
			const { response, text, images } = req.body as { response: ClineAskResponse; text?: string; images?: string[] }
			await validateTaskId(provider, taskId)
			await provider.handleWebviewAskResponse(response, text, images)
		}),
	)

	// --- Webview Management ---
	apiServer.get(
		"/api/state",
		createHandler(async (provider) => {
			return provider.getStateToPostToWebview()
		}),
	)

	apiServer.post(
		"/api/webview/message",
		createHandler(async (provider, req) => {
			await provider.postMessageToWebview(req.body)
		}),
	)

	// --- Settings Management ---
	apiServer.put(
		"/api/settings/api",
		createHandler(async (provider, req) => {
			await provider.updateApiConfiguration(req.body as ApiConfiguration)
		}),
	)

	apiServer.put(
		"/api/settings/customInstructions",
		createHandler(async (provider, req) => {
			const { instructions } = req.body as { instructions: string }
			await provider.updateCustomInstructions(instructions)
		}),
	)

	apiServer.put(
		"/api/settings/autoApproval",
		createHandler(async (provider, req) => {
			await provider.updateGlobalState("autoApprovalSettings" as GlobalStateKey, req.body as AutoApprovalSettings)
		}),
	)

	apiServer.put(
		"/api/settings/browser",
		createHandler(async (provider, req) => {
			await provider.updateGlobalState("browserSettings" as GlobalStateKey, req.body as BrowserSettings)
		}),
	)

	apiServer.put(
		"/api/settings/chat",
		createHandler(async (provider, req) => {
			await provider.updateGlobalState("chatSettings" as GlobalStateKey, req.body as ChatSettings)
		}),
	)

	apiServer.put(
		"/api/settings/chat/mode",
		createHandler(async (provider, req) => {
			const { mode } = req.body as { mode: "plan" | "act" }
			await provider.togglePlanActModeWithChatSettings({ mode })
		}),
	)

	// --- Authentication ---
	apiServer.post(
		"/api/auth/token",
		createHandler(async (provider, req) => {
			const { token } = req.body as { token: string }
			await provider.setAuthToken(token)
		}),
	)

	apiServer.post(
		"/api/auth/user",
		createHandler(async (provider, req) => {
			const { displayName, email, photoURL } = req.body as {
				displayName: string | null
				email: string | null
				photoURL: string | null
			}
			await provider.setUserInfo({ displayName, email, photoURL })
		}),
	)

	apiServer.post(
		"/api/auth/signout",
		createHandler(async (provider) => {
			await provider.handleSignOut()
		}),
	)

	// --- MCP Management ---
	apiServer.get(
		"/api/mcp/marketplace",
		createHandler(async (provider) => {
			const catalog = await provider.getGlobalState("mcpMarketplaceCatalog" as GlobalStateKey)
			return catalog as McpMarketplaceCatalog | undefined
		}),
	)

	apiServer.post(
		"/api/mcp/download",
		createHandler(async (provider, req) => {
			const { mcpId } = req.body as { mcpId: string }
			await provider.downloadMcp(mcpId)
		}),
	)

	apiServer.put(
		"/api/mcp/servers/:serverName/toggle",
		createHandler(async (provider, req) => {
			const { serverName } = req.params
			const { disabled } = req.body as { disabled: boolean }
			await provider.mcpHub?.toggleServerDisabled(serverName, disabled)
		}),
	)

	apiServer.put(
		"/api/mcp/servers/:serverName/tools/:toolName/toggleAutoApprove",
		createHandler(async (provider, req) => {
			const { serverName, toolName } = req.params
			const { autoApprove } = req.body as { autoApprove: boolean }
			await provider.mcpHub?.toggleToolAutoApprove(serverName, toolName, autoApprove)
		}),
	)

	apiServer.post(
		"/api/mcp/servers/:serverName/restart",
		createHandler(async (provider, req) => {
			const { serverName } = req.params
			await provider.mcpHub?.restartConnection(serverName)
		}),
	)

	apiServer.delete(
		"/api/mcp/servers/:serverName",
		createHandler(async (provider, req) => {
			const { serverName } = req.params
			await provider.mcpHub?.deleteServer(serverName)
		}),
	)

	// --- Miscellaneous ---
	apiServer.post(
		"/api/subscribe",
		createHandler(async (provider, req) => {
			const { email } = req.body as { email: string }
			await provider.subscribeEmail(email)
		}),
	)

	return apiServer
}

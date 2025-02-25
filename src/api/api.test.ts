import * as express from "express"
import * as http from "http"
import * as assert from "assert"
import * as sinon from "sinon"
import * as vscode from "vscode"
import { setupApiServer } from "./api"
import { ClineProvider } from "../core/webview/ClineProvider"
import { HistoryItem } from "../shared/HistoryItem"
import { ApiConfiguration } from "../shared/api"
import { McpMarketplaceCatalog } from "../shared/mcp"

describe("Cline API Server", function () {
	let app: express.Express
	let server: http.Server
	let mockContext: vscode.ExtensionContext
	let mockProvider: any
	let sandbox: sinon.SinonSandbox

	beforeEach(function () {
		// Create a sinon sandbox
		sandbox = sinon.createSandbox()

		// Setup mock context
		mockContext = {
			globalState: {
				get: sandbox.stub().callsFake((key: string) => {
					if (key === "apiKey") return "test-api-key"
					return null
				}),
				update: sandbox.stub(),
			},
		} as unknown as vscode.ExtensionContext

		// Setup mock provider
		mockProvider = {
			getGlobalState: sandbox.stub(),
			initClineWithTask: sandbox.stub(),
			initClineWithHistoryItem: sandbox.stub(),
			cancelTask: sandbox.stub(),
			getTaskWithId: sandbox.stub(),
			deleteTaskWithId: sandbox.stub(),
			exportTaskWithId: sandbox.stub(),
			handleWebviewAskResponse: sandbox.stub(),
			getStateToPostToWebview: sandbox.stub(),
			postMessageToWebview: sandbox.stub(),
			updateApiConfiguration: sandbox.stub(),
			updateCustomInstructions: sandbox.stub(),
			updateGlobalState: sandbox.stub(),
			togglePlanActModeWithChatSettings: sandbox.stub(),
			setAuthToken: sandbox.stub(),
			setUserInfo: sandbox.stub(),
			handleSignOut: sandbox.stub(),
			downloadMcp: sandbox.stub(),
			subscribeEmail: sandbox.stub(),
			mcpHub: {
				toggleServerDisabled: sandbox.stub(),
				toggleToolAutoApprove: sandbox.stub(),
				restartConnection: sandbox.stub(),
				deleteServer: sandbox.stub(),
			},
		}

		// Mock ClineProvider.getVisibleInstance
		sandbox.stub(ClineProvider, "getVisibleInstance").returns(mockProvider)

		// Setup API server
		app = setupApiServer(mockContext)
		server = app.listen(0) // Start server on a random port
	})

	afterEach(function () {
		// Restore all stubs
		sandbox.restore()

		// Close the server
		server.close()
	})

	// Helper function to make HTTP requests to the API server
	async function makeRequest(
		method: string,
		path: string,
		headers: Record<string, string> = {},
		body?: any,
	): Promise<{ status: number; body: any }> {
		return new Promise((resolve, reject) => {
			const options = {
				hostname: "localhost",
				port: (server.address() as any).port,
				path,
				method,
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
			}

			const req = http.request(options, (res) => {
				let data = ""
				res.on("data", (chunk) => {
					data += chunk
				})
				res.on("end", () => {
					try {
						const body = data ? JSON.parse(data) : {}
						resolve({
							status: res.statusCode || 500,
							body,
						})
					} catch (e) {
						resolve({
							status: res.statusCode || 500,
							body: data,
						})
					}
				})
			})

			req.on("error", (error) => {
				reject(error)
			})

			if (body) {
				req.write(JSON.stringify(body))
			}
			req.end()
		})
	}

	describe("Authentication", function () {
		it("should reject requests without a valid API key", async function () {
			const response = await makeRequest("GET", "/api/state")
			assert.strictEqual(response.status, 401)
			assert.ok(response.body.message.includes("Unauthorized"))
		})

		it("should accept requests with a valid API key", async function () {
			mockProvider.getStateToPostToWebview.resolves({ status: "ok" })

			const response = await makeRequest("GET", "/api/state", {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
		})
	})

	describe("Task Management", function () {
		it("should create a new task", async function () {
			const taskId = "task-123"
			mockProvider.getGlobalState.resolves(taskId)

			const response = await makeRequest(
				"POST",
				"/api/tasks",
				{
					"X-API-Key": "test-api-key",
				},
				{ task: "Test task", images: [] },
			)

			assert.strictEqual(response.status, 201)
			assert.deepStrictEqual(response.body, { taskId })
			assert.ok(mockProvider.initClineWithTask.calledWith("Test task", []))
		})

		it("should resume a task", async function () {
			const taskId = "task-123"
			const historyItem = { id: taskId, task: "Test task" }
			mockProvider.getTaskWithId.resolves({ historyItem })

			const response = await makeRequest("POST", `/api/tasks/${taskId}/resume`, {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.initClineWithHistoryItem.calledWith(historyItem))
		})

		it("should cancel a task", async function () {
			const taskId = "task-123"
			mockProvider.getGlobalState.resolves(taskId)

			const response = await makeRequest("POST", `/api/tasks/${taskId}/cancel`, {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.cancelTask.called)
		})

		it("should get task history", async function () {
			const taskHistory: HistoryItem[] = [
				{ id: "task-123", task: "Test task 1" } as HistoryItem,
				{ id: "task-456", task: "Test task 2" } as HistoryItem,
			]
			mockProvider.getGlobalState.resolves(taskHistory)

			const response = await makeRequest("GET", "/api/tasks", {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
			assert.deepStrictEqual(response.body, taskHistory)
		})

		it("should get a specific task", async function () {
			const taskId = "task-123"
			const historyItem = { id: taskId, task: "Test task" }
			mockProvider.getTaskWithId.resolves({ historyItem })

			const response = await makeRequest("GET", `/api/tasks/${taskId}`, {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
			assert.deepStrictEqual(response.body, historyItem)
		})

		it("should delete a task", async function () {
			const taskId = "task-123"

			const response = await makeRequest("DELETE", `/api/tasks/${taskId}`, {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.deleteTaskWithId.calledWith(taskId))
		})

		it("should export a task", async function () {
			const taskId = "task-123"
			const exportData = { id: taskId, task: "Test task", messages: [] }
			mockProvider.exportTaskWithId.resolves(exportData)

			const response = await makeRequest("GET", `/api/tasks/${taskId}/export`, {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
			assert.deepStrictEqual(response.body, exportData)
		})
	})

	describe("Interaction with Cline", function () {
		it("should handle response to Cline", async function () {
			const taskId = "task-123"
			mockProvider.getGlobalState.resolves(taskId)
			const clineResponse = { type: "text", content: "Test response" }

			const response = await makeRequest(
				"POST",
				`/api/tasks/${taskId}/response`,
				{
					"X-API-Key": "test-api-key",
				},
				{
					response: clineResponse,
					text: "User response",
					images: ["data:image/png;base64,abc123"],
				},
			)

			assert.strictEqual(response.status, 200)
			assert.ok(
				mockProvider.handleWebviewAskResponse.calledWith(clineResponse, "User response", [
					"data:image/png;base64,abc123",
				]),
			)
		})
	})

	describe("Webview Management", function () {
		it("should get state to post to webview", async function () {
			const state = { status: "ok", mode: "act" }
			mockProvider.getStateToPostToWebview.resolves(state)

			const response = await makeRequest("GET", "/api/state", {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
			assert.deepStrictEqual(response.body, state)
		})

		it("should post message to webview", async function () {
			const message = { type: "update", content: "Test message" }

			const response = await makeRequest(
				"POST",
				"/api/webview/message",
				{
					"X-API-Key": "test-api-key",
				},
				message,
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.postMessageToWebview.calledWith(message))
		})
	})

	describe("Settings Management", function () {
		it("should update API configuration", async function () {
			const apiConfig = {
				model: "claude-3-opus-20240229",
			} as ApiConfiguration

			const response = await makeRequest(
				"PUT",
				"/api/settings/api",
				{
					"X-API-Key": "test-api-key",
				},
				apiConfig,
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.updateApiConfiguration.calledWith(apiConfig))
		})

		it("should update custom instructions", async function () {
			const instructions = "Custom instructions for Cline"

			const response = await makeRequest(
				"PUT",
				"/api/settings/customInstructions",
				{
					"X-API-Key": "test-api-key",
				},
				{ instructions },
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.updateCustomInstructions.calledWith(instructions))
		})

		it("should update auto approval settings", async function () {
			const settings = { autoApproveAll: true }

			const response = await makeRequest(
				"PUT",
				"/api/settings/autoApproval",
				{
					"X-API-Key": "test-api-key",
				},
				settings,
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.updateGlobalState.calledWith("autoApprovalSettings", settings))
		})

		it("should update browser settings", async function () {
			const settings = { headless: true }

			const response = await makeRequest(
				"PUT",
				"/api/settings/browser",
				{
					"X-API-Key": "test-api-key",
				},
				settings,
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.updateGlobalState.calledWith("browserSettings", settings))
		})

		it("should update chat settings", async function () {
			const settings = { mode: "act" }

			const response = await makeRequest(
				"PUT",
				"/api/settings/chat",
				{
					"X-API-Key": "test-api-key",
				},
				settings,
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.updateGlobalState.calledWith("chatSettings", settings))
		})

		it("should toggle plan/act mode", async function () {
			const mode = { mode: "plan" }

			const response = await makeRequest(
				"PUT",
				"/api/settings/chat/mode",
				{
					"X-API-Key": "test-api-key",
				},
				mode,
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.togglePlanActModeWithChatSettings.calledWith(mode))
		})
	})

	describe("Authentication", function () {
		it("should set auth token", async function () {
			const token = "auth-token-123"

			const response = await makeRequest(
				"POST",
				"/api/auth/token",
				{
					"X-API-Key": "test-api-key",
				},
				{ token },
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.setAuthToken.calledWith(token))
		})

		it("should set user info", async function () {
			const userInfo = {
				displayName: "Test User",
				email: "test@example.com",
				photoURL: "https://example.com/photo.jpg",
			}

			const response = await makeRequest(
				"POST",
				"/api/auth/user",
				{
					"X-API-Key": "test-api-key",
				},
				userInfo,
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.setUserInfo.calledWith(userInfo))
		})

		it("should handle sign out", async function () {
			const response = await makeRequest("POST", "/api/auth/signout", {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.handleSignOut.called)
		})
	})

	describe("MCP Management", function () {
		it("should get marketplace catalog", async function () {
			const catalog = {
				items: [{ id: "server-1", name: "Server 1", description: "Test server" }],
			}
			mockProvider.getGlobalState.resolves(catalog)

			const response = await makeRequest("GET", "/api/mcp/marketplace", {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
			assert.deepStrictEqual(response.body, catalog)
		})

		it("should download MCP", async function () {
			const mcpId = "server-1"

			const response = await makeRequest(
				"POST",
				"/api/mcp/download",
				{
					"X-API-Key": "test-api-key",
				},
				{ mcpId },
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.downloadMcp.calledWith(mcpId))
		})

		it("should toggle server disabled state", async function () {
			const serverName = "server-1"
			const disabled = true

			const response = await makeRequest(
				"PUT",
				`/api/mcp/servers/${serverName}/toggle`,
				{
					"X-API-Key": "test-api-key",
				},
				{ disabled },
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.mcpHub.toggleServerDisabled.calledWith(serverName, disabled))
		})

		it("should toggle tool auto approve", async function () {
			const serverName = "server-1"
			const toolName = "tool-1"
			const autoApprove = true

			const response = await makeRequest(
				"PUT",
				`/api/mcp/servers/${serverName}/tools/${toolName}/toggleAutoApprove`,
				{
					"X-API-Key": "test-api-key",
				},
				{ autoApprove },
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.mcpHub.toggleToolAutoApprove.calledWith(serverName, toolName, autoApprove))
		})

		it("should restart server connection", async function () {
			const serverName = "server-1"

			const response = await makeRequest("POST", `/api/mcp/servers/${serverName}/restart`, {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.mcpHub.restartConnection.calledWith(serverName))
		})

		it("should delete server", async function () {
			const serverName = "server-1"

			const response = await makeRequest("DELETE", `/api/mcp/servers/${serverName}`, {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.mcpHub.deleteServer.calledWith(serverName))
		})
	})

	describe("Miscellaneous", function () {
		it("should subscribe email", async function () {
			const email = "test@example.com"

			const response = await makeRequest(
				"POST",
				"/api/subscribe",
				{
					"X-API-Key": "test-api-key",
				},
				{ email },
			)

			assert.strictEqual(response.status, 200)
			assert.ok(mockProvider.subscribeEmail.calledWith(email))
		})
	})

	describe("Error Handling", function () {
		it("should handle provider not available", async function () {
			// Restore the original stub and create a new one that returns undefined
			sandbox.restore()
			sandbox = sinon.createSandbox()
			sandbox.stub(ClineProvider, "getVisibleInstance").returns(undefined)

			const response = await makeRequest("GET", "/api/state", {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 503)
			assert.ok(response.body.message.includes("Cline provider not available"))
		})

		it("should handle errors in handler functions", async function () {
			mockProvider.getStateToPostToWebview.rejects(new Error("Test error"))

			const response = await makeRequest("GET", "/api/state", {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 500)
			assert.strictEqual(response.body.message, "Test error")
		})

		it("should handle task ID validation failure", async function () {
			const taskId = "task-123"
			mockProvider.getGlobalState.resolves("different-task-id")

			const response = await makeRequest("POST", `/api/tasks/${taskId}/cancel`, {
				"X-API-Key": "test-api-key",
			})

			assert.strictEqual(response.status, 500)
			assert.ok(response.body.message.includes("Task ID does not match"))
		})
	})
})

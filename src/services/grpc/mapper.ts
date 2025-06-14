import {
	ExtensionState as InternalExtensionState, // Alias internal type
	Platform as InternalPlatform, // Alias internal type
	ClineMessage as InternalClineMessage, // Alias internal type
	ExtensionMessage as InternalExtensionMessage, // Import the main message type
	ClineAsk, // Keep for potential future payload mapping
	ClineSay, // Keep for potential future payload mapping
} from "../../shared/ExtensionMessage"
import { TelemetrySetting as InternalTelemetrySetting } from "../../shared/TelemetrySetting" // Alias internal type
import {
	ApiConfiguration as InternalApiConfiguration, // Alias internal type
	ApiProvider,
	ApiHandlerOptions, // Keep for reference if needed
	ModelInfo, // Keep for reference if needed
} from "../../shared/api"
import { AutoApprovalSettings as InternalAutoApprovalSettings } from "../../shared/AutoApprovalSettings" // Alias internal type
import { BrowserSettings as InternalBrowserSettings } from "../../shared/BrowserSettings" // Alias internal type
import { ChatSettings as InternalChatSettings } from "../../shared/ChatSettings" // Alias internal type
import { HistoryItem as InternalHistoryItem } from "../../shared/HistoryItem" // Alias internal type
import { ClineRulesToggles as InternalClineRulesToggles } from "../../shared/cline-rules" // Alias internal type
import { UserInfo as InternalUserInfo } from "@shared/UserInfo" // Alias internal type
import { Timestamp } from "google-protobuf/google/protobuf/timestamp_pb"
import { Logger } from "../../services/logging/Logger"
import { ToolResponse } from "../../core/task/index"
// Correct import: Use ToolUse instead of ToolBlock
import { ToolUse } from "../../core/assistant-message/index"
import * as grpc from "@grpc/grpc-js" // Keep for potential status code usage
import { Value } from "google-protobuf/google/protobuf/struct_pb"
// --- Import Generated Proto Types ---
import {
	InvokeRequest, // Keep if needed for mapping incoming requests
	AskResponseRequest, // Keep if needed for mapping incoming requests
	ExtensionMessage as ProtoExtensionMessage,
	ExtensionMessageType as ProtoExtensionMessageType, // Import the enum type
	ToolUseBlock as ProtoToolUseBlock,
	ToolResultBlock as ProtoToolResultBlock,
	ClineMessage as ProtoClineMessage,
	ClineMessage_Type as ProtoClineMessageType, // Corrected generated enum name
	ExtensionState as ProtoExtensionState,
	Platform as ProtoPlatform,
	TelemetrySettingValue as ProtoTelemetrySettingValue,
	ChatMode as ProtoChatMode,
	ApiConfiguration as ProtoApiConfiguration,
	ApiProvider as ProtoApiProvider, // Import the enum type
	AutoApprovalSettings as ProtoAutoApprovalSettings,
	AutoApprovalActions as ProtoAutoApprovalActions,
	BrowserSettings as ProtoBrowserSettings,
	BrowserViewport as ProtoBrowserViewport,
	ChatSettings as ProtoChatSettings,
	HistoryItem as ProtoHistoryItem,
	UserInfo as ProtoUserInfo,
	ClineRulesToggles as ProtoClineRulesToggles,
	// Import specific payload types if needed for detailed mapping
	// Import specific payload types for mapping
	AskFollowupPayload as ProtoAskFollowupPayload,
	AskPlanModeRespondPayload as ProtoAskPlanModeRespondPayload,
	AskCommandPayload as ProtoAskCommandPayload,
	AskCommandOutputPayload as ProtoAskCommandOutputPayload,
	AskCompletionResultPayload as ProtoAskCompletionResultPayload,
	AskToolPayload as ProtoAskToolPayload,
	AskApiReqFailedPayload as ProtoAskApiReqFailedPayload,
	AskResumeTaskPayload as ProtoAskResumeTaskPayload,
	AskResumeCompletedTaskPayload as ProtoAskResumeCompletedTaskPayload,
	AskMistakeLimitReachedPayload as ProtoAskMistakeLimitReachedPayload,
	AskAutoApprovalMaxReqReachedPayload as ProtoAskAutoApprovalMaxReqReachedPayload,
	AskBrowserActionLaunchPayload as ProtoAskBrowserActionLaunchPayload,
	AskUseMcpServerPayload as ProtoAskUseMcpServerPayload,
	AskNewTaskPayload as ProtoAskNewTaskPayload,
	SayTaskPayload as ProtoSayTaskPayload,
	SayErrorPayload as ProtoSayErrorPayload,
	SayApiReqInfoPayload as ProtoSayApiReqInfoPayload,
	SayTextPayload as ProtoSayTextPayload,
	SayReasoningPayload as ProtoSayReasoningPayload,
	SayCompletionResultPayload as ProtoSayCompletionResultPayload,
	SayUserFeedbackPayload as ProtoSayUserFeedbackPayload,
	SayUserFeedbackDiffPayload as ProtoSayUserFeedbackDiffPayload,
	SayCommandPayload as ProtoSayCommandPayload,
	SayCommandOutputPayload as ProtoSayCommandOutputPayload,
	SayToolPayload as ProtoSayToolPayload,
	SayToolType as ProtoSayToolType, // Import enum for mapping
	SayShellIntegrationWarningPayload as ProtoSayShellIntegrationWarningPayload,
	SayBrowserActionLaunchPayload as ProtoSayBrowserActionLaunchPayload,
	SayBrowserActionPayload as ProtoSayBrowserActionPayload,
	BrowserActionType as ProtoBrowserActionType, // Import enum for mapping
	SayBrowserActionResultPayload as ProtoSayBrowserActionResultPayload,
	SayMcpServerRequestStartedPayload as ProtoSayMcpServerRequestStartedPayload,
	SayMcpServerResponsePayload as ProtoSayMcpServerResponsePayload,
	SayUseMcpServerPayload as ProtoSayUseMcpServerPayload,
	SayDiffErrorPayload as ProtoSayDiffErrorPayload,
	SayDeletedApiReqsPayload as ProtoSayDeletedApiReqsPayload,
	SayClineignoreErrorPayload as ProtoSayClineignoreErrorPayload,
	SayCheckpointCreatedPayload as ProtoSayCheckpointCreatedPayload,
	SayLoadMcpDocumentationPayload as ProtoSayLoadMcpDocumentationPayload,
	ClineAskType as ProtoClineAskType, // Import enum for mapping
	ClineSayType as ProtoClineSayType, // Import enum for mapping
	AskUseMcpServerPayload_McpRequestType as ProtoMcpRequestType, // Import nested enum
	ClineApiReqCancelReason as ProtoClineApiReqCancelReason, // Added import
	// COMPLETION_RESULT_CHANGES_FLAG, // Removed import - Use string literal
} from "../../shared/proto/task_control"
// MCP Proto Types
import {
	McpServer as ProtoMcpServer,
	McpTool as ProtoMcpTool,
	McpResource as ProtoMcpResource,
	McpResourceTemplate as ProtoMcpResourceTemplate,
	McpServerStatus as ProtoMcpServerStatus,
	McpServers as ProtoMcpServers,
} from "../../shared/proto/mcp" // Import MCP proto types
// Internal MCP Types
import {
	McpServer as InternalMcpServer,
	McpTool as InternalMcpTool,
	McpResource as InternalMcpResource,
	McpResourceTemplate as InternalMcpResourceTemplate,
} from "@shared/mcp" // Import internal MCP types

import Anthropic from "@anthropic-ai/sdk" // Keep for ToolResponse type check
import { formatResponse } from "../../core/prompts/responses"
import {
	ClineAskNewTask,
	ClineAskQuestion,
	ClineAskUseMcpServer,
	ClinePlanModeResponse,
	ClineSayBrowserAction,
	ClineSayTool,
	BrowserActionResult,
	ClineApiReqInfo,
} from "@shared/ExtensionMessage" // Import internal payload types

// --- Helper Functions ---

// Returns a Timestamp instance or undefined
export function dateToProtoTimestamp(date: Date | number | undefined): Timestamp | undefined {
	if (date === undefined || date === null) {
		return undefined
	}
	const d = typeof date === "number" ? new Date(date) : date
	if (isNaN(d.getTime())) {
		return undefined
	} // Handle invalid dates
	const millis = d.getTime()
	const seconds = Math.floor(millis / 1000)
	const nanos = (millis % 1000) * 1e6
	const timestamp = new Timestamp()
	timestamp.setSeconds(seconds)
	timestamp.setNanos(nanos)
	return timestamp
}

// --- Mappers from Internal Types to Proto JS Objects ---

// Maps InternalUserInfo to Partial<ProtoUserInfo>
export function mapUserInfoToProto(userInfo: InternalUserInfo | undefined): Partial<ProtoUserInfo> | undefined {
	if (!userInfo) {
		return undefined
	}
	return {
		displayName: userInfo.displayName ?? undefined,
		email: userInfo.email ?? undefined,
		photoUrl: userInfo.photoURL ?? undefined,
	}
}

// Maps InternalHistoryItem to Partial<ProtoHistoryItem>
export function mapHistoryItemToProto(item: InternalHistoryItem): Partial<ProtoHistoryItem> {
	// Revert to Partial<>
	Logger.trace(`[gRPC-Trace: Mapper:mapHistoryItemToProto] Mapping HistoryItem ID: ${item?.id}`)
	const protoTs = dateToProtoTimestamp(item.ts)
	return {
		id: item.id, // Required in Partial as well if truly required by proto
		// Ensure ts defaults to 0 if undefined, as it's a required int64
		ts: protoTs ? protoTs.toDate().getTime() : 0,
		task: item.task, // Required in Partial as well if truly required by proto
		tokensIn: item.tokensIn ?? 0,
		tokensOut: item.tokensOut ?? 0,
		totalCost: item.totalCost ?? 0.0, // Provide default
		cacheWrites: item.cacheWrites ?? undefined,
		cacheReads: item.cacheReads ?? undefined,
		size: item.size ?? undefined,
		shadowGitConfigWorkTree: item.shadowGitConfigWorkTree ?? undefined,
		conversationHistoryDeletedRange: item.conversationHistoryDeletedRange
			? { startIndex: item.conversationHistoryDeletedRange[0], endIndex: item.conversationHistoryDeletedRange[1] }
			: undefined,
	}
}

// Maps InternalApiConfiguration to Partial<ProtoApiConfiguration> | undefined
export function mapApiConfigurationToProto(
	config: InternalApiConfiguration | undefined,
): Partial<ProtoApiConfiguration> | undefined {
	// Revert to Partial<>
	if (!config) {
		return undefined
	}

	const getPrimaryModelId = (cfg: InternalApiConfiguration): string | undefined => {
		switch (cfg.apiProvider) {
			case "openrouter":
				return cfg.openRouterModelId
			case "openai":
				return cfg.openAiModelId
			case "ollama":
				return cfg.ollamaModelId
			case "lmstudio":
				return cfg.lmStudioModelId
			case "requesty":
				return cfg.requestyModelId
			case "together":
				return cfg.togetherModelId
			case "vscode-lm":
				return cfg.vsCodeLmModelSelector?.id
			case "litellm":
				return cfg.liteLlmModelId
			default:
				return cfg.apiModelId
		}
	}

	const mapApiProvider = (provider: ApiProvider | undefined): ProtoApiProvider => {
		switch (provider) {
			case "anthropic":
				return ProtoApiProvider.ANTHROPIC
			case "openrouter":
				return ProtoApiProvider.OPENROUTER
			case "bedrock":
				return ProtoApiProvider.BEDROCK
			case "vertex":
				return ProtoApiProvider.VERTEX
			case "openai":
				return ProtoApiProvider.OPENAI
			case "ollama":
				return ProtoApiProvider.OLLAMA
			case "lmstudio":
				return ProtoApiProvider.LMSTUDIO
			case "gemini":
				return ProtoApiProvider.GEMINI
			case "openai-native":
				return ProtoApiProvider.OPENAI_NATIVE
			case "requesty":
				return ProtoApiProvider.REQUESTY
			case "together":
				return ProtoApiProvider.TOGETHER
			case "deepseek":
				return ProtoApiProvider.DEEPSEEK
			case "qwen":
				return ProtoApiProvider.QWEN
			case "doubao":
				return ProtoApiProvider.DOUBAO
			case "mistral":
				return ProtoApiProvider.MISTRAL
			case "vscode-lm":
				return ProtoApiProvider.VSCODE_LM
			case "cline":
				return ProtoApiProvider.CLINE
			case "litellm":
				return ProtoApiProvider.LITELLM
			case "asksage":
				return ProtoApiProvider.ASKSAGE
			case "xai":
				return ProtoApiProvider.XAI
			case "sambanova":
				return ProtoApiProvider.SAMBANOVA
			default:
				return ProtoApiProvider.API_PROVIDER_UNSPECIFIED
		}
	}

	// Ensure all required fields are present
	return {
		apiProvider: mapApiProvider(config.apiProvider), // Required
		apiModelId: getPrimaryModelId(config) ?? config.apiModelId ?? "", // Required, provide default ""
		favoritedModelIds: config.favoritedModelIds ?? [], // Defaults to empty array
		apiKey: config.apiKey ?? undefined,
		clineApiKey: config.clineApiKey ?? undefined,
		openRouterApiKey: config.openRouterApiKey ?? undefined,
		// Map other fields...
		openAiHeaders: config.openAiHeaders ?? {}, // Defaults to empty map
		// Removed duplicate openAiHeaders line
	}
}

// Maps InternalAutoApprovalSettings['actions'] to Partial<ProtoAutoApprovalActions> | undefined
export function mapAutoApprovalActionsToProto(
	actions: InternalAutoApprovalSettings["actions"] | undefined,
): ProtoAutoApprovalActions {
	// Changed to return full object
	// If actions is undefined, return a new object with all fields set to false
	if (!actions) {
		return {
			readFiles: false,
			readFilesExternally: false,
			editFiles: false,
			editFilesExternally: false,
			executeSafeCommands: false,
			executeAllCommands: false,
			useBrowser: false,
			useMcp: false,
		}
	}
	// Return an object with defaults for any missing or non-boolean properties
	return {
		readFiles: typeof actions.readFiles === "boolean" ? actions.readFiles : false,
		readFilesExternally: typeof actions.readFilesExternally === "boolean" ? actions.readFilesExternally : false,
		editFiles: typeof actions.editFiles === "boolean" ? actions.editFiles : false,
		editFilesExternally: typeof actions.editFilesExternally === "boolean" ? actions.editFilesExternally : false,
		executeSafeCommands: typeof actions.executeSafeCommands === "boolean" ? actions.executeSafeCommands : false,
		executeAllCommands: typeof actions.executeAllCommands === "boolean" ? actions.executeAllCommands : false,
		useBrowser: typeof actions.useBrowser === "boolean" ? actions.useBrowser : false,
		useMcp: typeof actions.useMcp === "boolean" ? actions.useMcp : false,
	}
}

// Maps InternalAutoApprovalSettings to Partial<ProtoAutoApprovalSettings>
export function mapAutoApprovalSettingsToProto(settings: InternalAutoApprovalSettings): ProtoAutoApprovalSettings {
	// Changed to return full object
	return {
		version: settings.version,
		enabled: settings.enabled,
		actions: mapAutoApprovalActionsToProto(settings.actions), // mapAutoApprovalActionsToProto now returns a full object
		maxRequests: settings.maxRequests ?? 0, // Default to 0 if undefined
		enableNotifications: settings.enableNotifications ?? false, // Default to false if undefined
	}
}

// Maps InternalBrowserSettings['viewport'] to Partial<ProtoBrowserViewport>
export function mapViewportToProto(
	viewport: InternalBrowserSettings["viewport"] | undefined,
): Partial<ProtoBrowserViewport> | undefined {
	if (!viewport) {
		return undefined
	}
	return {
		width: typeof viewport.width === "number" ? viewport.width : undefined,
		height: typeof viewport.height === "number" ? viewport.height : undefined,
	}
}

// Maps InternalBrowserSettings to Partial<ProtoBrowserSettings>
export function mapBrowserSettingsToProto(settings: InternalBrowserSettings): Partial<ProtoBrowserSettings> {
	return {
		viewport: (mapViewportToProto(settings.viewport) as ProtoBrowserViewport | undefined) ?? { width: 900, height: 600 }, // Cast & Default
		remoteBrowserHost: settings.remoteBrowserHost ?? undefined,
		remoteBrowserEnabled: settings.remoteBrowserEnabled ?? undefined,
	}
}

// Maps InternalChatSettings to Partial<ProtoChatSettings>
export function mapChatSettingsToProto(settings: InternalChatSettings): Partial<ProtoChatSettings> {
	// Revert to Partial<>
	const mapChatMode = (mode: InternalChatSettings["mode"]): ProtoChatMode => {
		switch (mode) {
			case "plan":
				return ProtoChatMode.PLAN
			case "act":
				return ProtoChatMode.ACT
			default:
				return ProtoChatMode.CHAT_MODE_UNSPECIFIED
		}
	}
	return {
		mode: mapChatMode(settings.mode), // Required in Partial as well
	}
}

// Mapper for InternalClineMessage to ProtoClineMessage
export function mapClineMessageToProto(msg: InternalClineMessage | undefined): ProtoClineMessage | undefined {
	Logger.trace(`[gRPC-Trace: Mapper:mapClineMessageToProto] Input: ${JSON.stringify(msg)}`)
	if (!msg) {
		return undefined
	}

	const mapType = (type: InternalClineMessage["type"]): ProtoClineMessageType => {
		return type === "ask" ? ProtoClineMessageType.ASK : ProtoClineMessageType.SAY
	}

	// Define as Partial, but ensure required fields like 'ts' have defaults
	const protoMsg: Partial<ProtoClineMessage> = {
		// Directly assign the number timestamp. The gRPC library handles int64 conversion.
		// Provide a default of 0 if msg.ts is undefined/null.
		ts: msg.ts ?? 0,
		type: mapType(msg.type), // Required in Partial
		actualAskType: mapInternalAskToProtoAskType(msg.ask), // Populate the new actual_ask_type
		actualSayType: mapInternalSayToProtoSayType(msg.say), // Populate the new actual_say_type
		images: msg.images ?? [],
		partial: msg.partial ?? false,
		lastCheckpointHash: msg.lastCheckpointHash ?? undefined,
		isCheckpointCheckedOut: msg.isCheckpointCheckedOut ?? false,
		isOperationOutsideWorkspace: msg.isOperationOutsideWorkspace ?? false,
		// text: undefined, // Don't initialize oneof fields directly
	}

	// Map specific payloads using $case
	try {
		if (msg.type === "ask") {
			// protoMsg.askType = mapInternalAskToProtoAskType(msg.ask) // REMOVED: askType is now actual_ask_type
			switch (msg.ask) {
				case "followup": {
					const payload: ClineAskQuestion = JSON.parse(msg.text || "{}")
					protoMsg.askFollowupPayload = {
						question: payload.question ?? "",
						options: payload.options ?? [],
					} as ProtoAskFollowupPayload
					break
				}
				case "plan_mode_respond": {
					const payload: ClinePlanModeResponse = JSON.parse(msg.text || "{}")
					protoMsg.askPlanModeRespondPayload = {
						response: payload.response ?? "",
						options: payload.options ?? [],
					} as ProtoAskPlanModeRespondPayload
					break
				}
				case "command":
					protoMsg.askCommandPayload = { commandText: msg.text ?? "" } as ProtoAskCommandPayload
					break
				case "command_output":
					protoMsg.askCommandOutputPayload = { outputText: msg.text ?? "" } as ProtoAskCommandOutputPayload
					break
				case "completion_result":
					protoMsg.askCompletionResultPayload = { resultText: msg.text ?? "" } as ProtoAskCompletionResultPayload
					break
				case "tool": {
					// msg.text is a JSON string like:
					// {"tool":"editedExistingFile","path":"calculator.html","content":"..."}
					// or {"tool":"write_to_file","path":"calculator.html","content":"..."}
					// or {"tool":"execute_command","command":"ls"}
					// or {"tool":"attempt_completion","result":"Task completed"}
					const askPayloadObject = JSON.parse(msg.text || "{}")

					// Special handling for attempt_completion - it should be mapped to completion_result
					if (askPayloadObject.tool === "attempt_completion") {
						Logger.info(`[gRPC-Info: Mapper] Mapping attempt_completion tool to completion_result`)
						protoMsg.askCompletionResultPayload = {
							resultText: askPayloadObject.result || "",
						} as ProtoAskCompletionResultPayload
						break
					}

					// Special handling for ask_followup_question - it should be mapped to followup
					if (askPayloadObject.tool === "ask_followup_question") {
						Logger.info(`[gRPC-Info: Mapper] Mapping ask_followup_question tool to followup`)
						protoMsg.askFollowupPayload = {
							question: askPayloadObject.question || "",
							options: askPayloadObject.options || [],
						} as ProtoAskFollowupPayload
						break
					}

					// Special handling for plan_mode_respond - it should be mapped to plan_mode_respond
					if (askPayloadObject.tool === "plan_mode_respond") {
						Logger.info(`[gRPC-Info: Mapper] Mapping plan_mode_respond tool to plan_mode_respond`)
						protoMsg.askPlanModeRespondPayload = {
							response: askPayloadObject.response || "",
							options: askPayloadObject.options || [],
						} as ProtoAskPlanModeRespondPayload
						break
					}

					// Special handling for new_task - it should be mapped to new_task
					if (askPayloadObject.tool === "new_task") {
						Logger.info(`[gRPC-Info: Mapper] Mapping new_task tool to new_task`)
						protoMsg.askNewTaskPayload = {
							context: askPayloadObject.context || "",
						} as ProtoAskNewTaskPayload
						break
					}

					// Special handling for browser_action - it should be mapped to browser_action_launch
					if (askPayloadObject.tool === "browser_action") {
						Logger.info(`[gRPC-Info: Mapper] Mapping browser_action tool to browser_action_launch`)
						if (askPayloadObject.action === "launch" && askPayloadObject.url) {
							protoMsg.askBrowserActionLaunchPayload = {
								url: askPayloadObject.url || "",
							} as ProtoAskBrowserActionLaunchPayload
							break
						}
						// For other browser actions, continue to tool payload handling below
					}

					// Special handling for use_mcp_tool and access_mcp_resource
					if (askPayloadObject.tool === "use_mcp_tool" || askPayloadObject.tool === "access_mcp_resource") {
						Logger.info(`[gRPC-Info: Mapper] Mapping ${askPayloadObject.tool} to use_mcp_server`)
						protoMsg.askUseMcpServerPayload = {
							serverName: askPayloadObject.server_name || "",
							type:
								askPayloadObject.tool === "use_mcp_tool"
									? ProtoMcpRequestType.USE_MCP_TOOL
									: ProtoMcpRequestType.ACCESS_MCP_RESOURCE,
							toolName: askPayloadObject.tool_name || undefined,
							argumentsJson: askPayloadObject.arguments ? JSON.stringify(askPayloadObject.arguments) : undefined,
							uri: askPayloadObject.uri || undefined,
						} as ProtoAskUseMcpServerPayload
						break
					}

					// Initialize sayToolDetails with only valid fields of ProtoSayToolPayload
					const sayToolDetails: Partial<ProtoSayToolPayload> = {
						tool: ProtoSayToolType.SAY_TOOL_TYPE_UNSPECIFIED, // Default
						path: undefined,
						content: undefined,
						diff: undefined,
						regex: undefined,
						filePattern: undefined,
						operationIsLocatedInWorkspace: undefined,
					}

					if (askPayloadObject.tool === "write_to_file" || askPayloadObject.tool === "editedExistingFile") {
						sayToolDetails.tool = ProtoSayToolType.NEW_FILE_CREATED
						sayToolDetails.path = askPayloadObject.path || ""
						sayToolDetails.content = askPayloadObject.content || ""
					} else if (askPayloadObject.tool === "read_file") {
						sayToolDetails.tool = ProtoSayToolType.READ_FILE
						sayToolDetails.path = askPayloadObject.path || ""
					} else if (askPayloadObject.tool === "replace_in_file") {
						sayToolDetails.tool = ProtoSayToolType.EDITED_EXISTING_FILE
						sayToolDetails.path = askPayloadObject.path || ""
						sayToolDetails.diff = askPayloadObject.diff || ""
					} else if (askPayloadObject.tool === "search_files") {
						sayToolDetails.tool = ProtoSayToolType.SAY_SEARCH_FILES
						sayToolDetails.regex = askPayloadObject.regex || ""
						sayToolDetails.filePattern = askPayloadObject.file_pattern || ""
					} else if (askPayloadObject.tool === "list_files") {
						sayToolDetails.tool = askPayloadObject.recursive
							? ProtoSayToolType.LIST_FILES_RECURSIVE
							: ProtoSayToolType.LIST_FILES_TOP_LEVEL
						sayToolDetails.path = askPayloadObject.path || ""
					} else if (askPayloadObject.tool === "list_code_definition_names") {
						sayToolDetails.tool = ProtoSayToolType.LIST_CODE_DEFINITION_NAMES
						sayToolDetails.path = askPayloadObject.path || ""
					} else if (askPayloadObject.tool === "execute_command") {
						sayToolDetails.tool = ProtoSayToolType.SAY_TOOL_TYPE_UNSPECIFIED
						sayToolDetails.content = askPayloadObject.command || "" // Command string goes into content
					} else if (askPayloadObject.tool === "browser_action") {
						// Non-launch browser actions get handled as generic tools
						sayToolDetails.tool = ProtoSayToolType.SAY_TOOL_TYPE_UNSPECIFIED
						sayToolDetails.content = JSON.stringify({
							action: askPayloadObject.action,
							coordinate: askPayloadObject.coordinate,
							text: askPayloadObject.text,
						})
					} else {
						// For other tools that don't have specific proto mappings, the parameters
						// are stringified and put into the 'content' field.
						// The 'tool' type remains SAY_TOOL_TYPE_UNSPECIFIED.
						// Tools that fall into this category:
						// - load_mcp_documentation
						// - condense (not in proto)
						// - report_bug (not in proto)
						// - new_rule (not in proto)
						// - any future tools not explicitly handled above
						Logger.warn(
							`[gRPC-Warn: Mapper] ASK for tool name '${askPayloadObject.tool}' has no specific mapping to SayToolPayload structure. Defaulting to UNSPECIFIED with stringified params in content.`,
						)
						sayToolDetails.tool = ProtoSayToolType.SAY_TOOL_TYPE_UNSPECIFIED
						if (typeof askPayloadObject === "object" && askPayloadObject !== null) {
							const { tool, ...otherParams } = askPayloadObject
							if (Object.keys(otherParams).length > 0) {
								try {
									sayToolDetails.content = JSON.stringify(otherParams)
								} catch (e) {
									Logger.warn(
										`[gRPC-Warn: Mapper] Could not stringify unknown tool params for ${askPayloadObject.tool}`,
									)
									sayToolDetails.content = `Error stringifying params for ${askPayloadObject.tool}`
								}
							} else {
								// If no other params, content might be empty or based on original msg.text if needed
								sayToolDetails.content = msg.text || "" // Fallback to original text if no specific params
							}
						} else {
							sayToolDetails.content = msg.text || "" // Fallback if askPayloadObject is not an object
						}
					}

					// ProtoAskToolPayload only contains toolDetails
					const protoAskToolPayload: Partial<ProtoAskToolPayload> = {
						toolDetails: sayToolDetails as ProtoSayToolPayload,
					}

					protoMsg.askToolPayload = protoAskToolPayload as ProtoAskToolPayload
					break
				}
				case "api_req_failed":
					protoMsg.askApiReqFailedPayload = { errorMessage: msg.text ?? "" } as ProtoAskApiReqFailedPayload
					break
				case "resume_task":
					protoMsg.askResumeTaskPayload = { taskId: msg.text ?? "" } as ProtoAskResumeTaskPayload
					break
				case "resume_completed_task":
					protoMsg.askResumeCompletedTaskPayload = { taskId: msg.text ?? "" } as ProtoAskResumeCompletedTaskPayload
					break
				case "mistake_limit_reached":
					protoMsg.askMistakeLimitReachedPayload = {} as ProtoAskMistakeLimitReachedPayload
					break
				case "auto_approval_max_req_reached":
					protoMsg.askAutoApprovalMaxReqReachedPayload = {} as ProtoAskAutoApprovalMaxReqReachedPayload
					break
				case "browser_action_launch":
					protoMsg.askBrowserActionLaunchPayload = { url: msg.text ?? "" } as ProtoAskBrowserActionLaunchPayload
					break
				case "use_mcp_server": {
					const payload: ClineAskUseMcpServer = JSON.parse(msg.text || "{}")
					protoMsg.askUseMcpServerPayload = {
						serverName: payload.serverName ?? "",
						type:
							payload.type === "use_mcp_tool"
								? ProtoMcpRequestType.USE_MCP_TOOL
								: payload.type === "access_mcp_resource"
									? ProtoMcpRequestType.ACCESS_MCP_RESOURCE
									: ProtoMcpRequestType.MCP_REQUEST_TYPE_UNSPECIFIED,
						toolName: payload.toolName ?? undefined,
						argumentsJson: payload.arguments ?? undefined,
						uri: payload.uri ?? undefined,
					} as ProtoAskUseMcpServerPayload
					break
				}
				case "new_task": {
					const payload: ClineAskNewTask = JSON.parse(msg.text || "{}")
					protoMsg.askNewTaskPayload = { context: payload.context ?? "" } as ProtoAskNewTaskPayload
					break
				}
				case "condense":
					Logger.warn(
						`[gRPC-Warn: Mapper:mapClineMessageToProto] Unhandled internal ask type 'condense'. Mapping to generic text.`,
					)
					protoMsg.text = msg.text ?? undefined // Fallback for unhandled type
					break
				default:
					Logger.warn(
						`[gRPC-Warn: Mapper:mapClineMessageToProto] Unknown internal ask type: ${msg.ask}. Mapping to generic text.`,
					)
					protoMsg.text = msg.text ?? undefined // Fallback for unknown type
			}
		} else if (msg.type === "say") {
			// protoMsg.sayType = mapInternalSayToProtoSayType(msg.say) // REMOVED: sayType is now actual_say_type
			switch (msg.say) {
				case "task":
					protoMsg.sayTaskPayload = { taskDescription: msg.text ?? "" } as ProtoSayTaskPayload
					break
				case "error":
					protoMsg.sayErrorPayload = { errorMessage: msg.text ?? "" } as ProtoSayErrorPayload
					break
				case "api_req_started":
				case "api_req_finished":
				case "api_req_retried": {
					const payload: ClineApiReqInfo = JSON.parse(msg.text || "{}")
					protoMsg.sayApiReqInfoPayload = {
						request: payload.request ?? undefined,
						tokensIn: payload.tokensIn ?? undefined,
						tokensOut: payload.tokensOut ?? undefined,
						cacheWrites: payload.cacheWrites ?? undefined,
						cacheReads: payload.cacheReads ?? undefined,
						cost: payload.cost ?? undefined,
						cancelReason: mapInternalCancelReasonToProto(payload.cancelReason),
						streamingFailedMessage: payload.streamingFailedMessage ?? undefined,
					} as ProtoSayApiReqInfoPayload
					break
				}
				case "text":
					protoMsg.sayTextPayload = { textContent: msg.text ?? "" } as ProtoSayTextPayload
					break
				case "reasoning":
					protoMsg.sayReasoningPayload = { reasoningText: msg.reasoning ?? msg.text ?? "" } as ProtoSayReasoningPayload
					break
				case "completion_result": {
					const changesFlag = "HAS_CHANGES" // Use string literal
					protoMsg.sayCompletionResultPayload = {
						resultText: msg.text?.replace(changesFlag, "") ?? "",
						hasChanges: msg.text?.includes(changesFlag) ?? false,
					} as ProtoSayCompletionResultPayload
					break
				}
				case "user_feedback":
					protoMsg.sayUserFeedbackPayload = { feedbackText: msg.text ?? "" } as ProtoSayUserFeedbackPayload
					break
				case "user_feedback_diff":
					protoMsg.sayUserFeedbackDiffPayload = { diffContent: msg.text ?? "" } as ProtoSayUserFeedbackDiffPayload
					break
				case "command":
					protoMsg.sayCommandPayload = { commandText: msg.text ?? "" } as ProtoSayCommandPayload
					break
				case "command_output":
					protoMsg.sayCommandOutputPayload = { outputText: msg.text ?? "" } as ProtoSayCommandOutputPayload
					break
				case "tool": {
					const payload: ClineSayTool = JSON.parse(msg.text || "{}")
					protoMsg.sayToolPayload = mapInternalSayToolToProto(payload) as ProtoSayToolPayload
					break
				}
				case "shell_integration_warning":
					protoMsg.sayShellIntegrationWarningPayload = {
						warningMessage: msg.text ?? "",
					} as ProtoSayShellIntegrationWarningPayload
					break
				case "browser_action_launch":
					protoMsg.sayBrowserActionLaunchPayload = { url: msg.text ?? "" } as ProtoSayBrowserActionLaunchPayload
					break
				case "browser_action": {
					const payload: ClineSayBrowserAction = JSON.parse(msg.text || "{}")
					protoMsg.sayBrowserActionPayload = {
						action: mapInternalBrowserActionToProto(payload.action),
						coordinate: payload.coordinate ?? undefined,
						text: payload.text ?? undefined,
					} as ProtoSayBrowserActionPayload
					break
				}
				case "browser_action_result": {
					const payload: BrowserActionResult = JSON.parse(msg.text || "{}")
					protoMsg.sayBrowserActionResultPayload = {
						screenshot: payload.screenshot ?? undefined,
						logs: payload.logs ?? undefined,
						currentUrl: payload.currentUrl ?? undefined,
						currentMousePosition: payload.currentMousePosition ?? undefined,
					} as ProtoSayBrowserActionResultPayload
					break
				}
				case "mcp_server_request_started":
					protoMsg.sayMcpServerRequestStartedPayload = {
						serverName: msg.text ?? "",
					} as ProtoSayMcpServerRequestStartedPayload
					break
				case "mcp_server_response": {
					const payload = JSON.parse(msg.text || "{}") // Assuming { serverName: string, response: any }
					protoMsg.sayMcpServerResponsePayload = {
						serverName: payload.serverName ?? "",
						responseContent: JSON.stringify(payload.response) ?? "", // Stringify the response part
					} as ProtoSayMcpServerResponsePayload
					break
				}
				case "use_mcp_server": {
					// Assuming say uses the same structure as ask
					const payload: ClineAskUseMcpServer = JSON.parse(msg.text || "{}")
					protoMsg.sayUseMcpServerPayload = {
						details: {
							serverName: payload.serverName ?? "",
							type:
								payload.type === "use_mcp_tool"
									? ProtoMcpRequestType.USE_MCP_TOOL
									: payload.type === "access_mcp_resource"
										? ProtoMcpRequestType.ACCESS_MCP_RESOURCE
										: ProtoMcpRequestType.MCP_REQUEST_TYPE_UNSPECIFIED,
							toolName: payload.toolName ?? undefined,
							argumentsJson: payload.arguments ?? undefined,
							uri: payload.uri ?? undefined,
						},
					} as ProtoSayUseMcpServerPayload
					break
				}
				case "diff_error": {
					const payload = JSON.parse(msg.text || "{}") // Assuming { error: string, path: string }
					protoMsg.sayDiffErrorPayload = {
						errorMessage: payload.error ?? "",
						path: payload.path ?? "",
					} as ProtoSayDiffErrorPayload
					break
				}
				case "deleted_api_reqs": {
					const payload = JSON.parse(msg.text || "{}") // Assuming { count: number }
					protoMsg.sayDeletedApiReqsPayload = { count: payload.count ?? 0 } as ProtoSayDeletedApiReqsPayload
					break
				}
				case "clineignore_error":
					protoMsg.sayClineignoreErrorPayload = { errorMessage: msg.text ?? "" } as ProtoSayClineignoreErrorPayload
					break
				case "checkpoint_created":
					protoMsg.sayCheckpointCreatedPayload = { checkpointHash: msg.text ?? "" } as ProtoSayCheckpointCreatedPayload
					break
				case "load_mcp_documentation":
					protoMsg.sayLoadMcpDocumentationPayload = {} as ProtoSayLoadMcpDocumentationPayload
					break
				default:
					Logger.warn(
						`[gRPC-Warn: Mapper:mapClineMessageToProto] Unknown internal say type: ${msg.say}. Mapping to generic text.`,
					)
					protoMsg.text = msg.text ?? undefined // Fallback for unknown type
			}
		} else {
			// Fallback for messages that are neither 'ask' nor 'say' (shouldn't happen with current types)
			protoMsg.text = msg.text ?? undefined
		}
	} catch (e: any) {
		Logger.error(
			`[gRPC-Error: Mapper:mapClineMessageToProto] Error parsing payload for ${msg.type} (${msg.ask || msg.say}): ${e.message}`,
		)
		// Fallback to generic text in case of parsing error
		protoMsg.text = msg.text ?? undefined
		// Clear any partially set payload
		// For oneof fields, if ts-proto uses `oneof=unions`, setting one field automatically clears others.
		// However, to be safe, explicitly clear other potential oneof fields if an error occurs during parsing a specific one.
		// This depends on the exact structure of ProtoClineMessage and its oneof fields.
		// Example: if 'askToolPayload' was being set and failed, ensure other 'ask...' fields are clear.
		// This might require listing all oneof fields. For now, this explicit deletion is removed
		// as direct assignment to the specific oneof field (e.g., protoMsg.askToolPayload = ...) should handle exclusivity.
	}

	// If a specific oneof field (e.g., protoMsg.askToolPayload) was set,
	// the generic 'text' field should be undefined.
	// This logic is now implicitly handled by setting specific oneof properties.
	// If protoMsg.askToolPayload is set, then protoMsg.text (if it was part of another oneof case or a general field)
	// should ideally not conflict. The ts-proto generated types usually handle this.
	// Let's remove the explicit clearing of protoMsg.text based on askPayload/sayPayload presence,
	// as direct assignment to oneof properties is cleaner.
	// if (protoMsg.askFollowupPayload || protoMsg.askPlanModeRespondPayload || /* ...all other oneof fields... */ ) {
	//     protoMsg.text = undefined;
	// }

	Logger.trace(`[gRPC-Trace: Mapper:mapClineMessageToProto] Output: ${JSON.stringify(protoMsg)}`)
	return protoMsg as ProtoClineMessage // Return as full object
}

// Helper to map internal ClineSayTool to ProtoSayToolPayload
function mapInternalSayToolToProto(payload: ClineSayTool | undefined): Partial<ProtoSayToolPayload> {
	if (!payload) {
		return {}
	}

	let protoToolType: ProtoSayToolType = ProtoSayToolType.SAY_TOOL_TYPE_UNSPECIFIED
	switch (payload.tool) {
		case "editedExistingFile":
			protoToolType = ProtoSayToolType.EDITED_EXISTING_FILE
			break
		case "newFileCreated":
			protoToolType = ProtoSayToolType.NEW_FILE_CREATED
			break
		case "readFile":
			protoToolType = ProtoSayToolType.READ_FILE
			break
		case "listFilesTopLevel":
			protoToolType = ProtoSayToolType.LIST_FILES_TOP_LEVEL
			break
		case "listFilesRecursive":
			protoToolType = ProtoSayToolType.LIST_FILES_RECURSIVE
			break
		case "listCodeDefinitionNames":
			protoToolType = ProtoSayToolType.LIST_CODE_DEFINITION_NAMES
			break
		case "searchFiles":
			protoToolType = ProtoSayToolType.SAY_SEARCH_FILES
			break
	}

	return {
		tool: protoToolType,
		path: payload.path ?? undefined,
		diff: payload.diff ?? undefined,
		content: payload.content ?? undefined,
		regex: payload.regex ?? undefined,
		filePattern: payload.filePattern ?? undefined,
		operationIsLocatedInWorkspace: payload.operationIsLocatedInWorkspace ?? undefined,
	}
}

// Helper to map internal BrowserAction string to ProtoBrowserActionType enum
function mapInternalBrowserActionToProto(action: ClineSayBrowserAction["action"] | undefined): ProtoBrowserActionType {
	switch (action) {
		case "launch":
			return ProtoBrowserActionType.LAUNCH
		case "click":
			return ProtoBrowserActionType.CLICK
		case "type":
			return ProtoBrowserActionType.TYPE
		case "scroll_down":
			return ProtoBrowserActionType.SCROLL_DOWN
		case "scroll_up":
			return ProtoBrowserActionType.SCROLL_UP
		case "close":
			return ProtoBrowserActionType.CLOSE
		default:
			return ProtoBrowserActionType.BROWSER_ACTION_TYPE_UNSPECIFIED
	}
}

// Helper to map internal ClineAsk string to ProtoClineAskType enum
function mapInternalAskToProtoAskType(ask: InternalClineMessage["ask"] | undefined): ProtoClineAskType {
	switch (ask) {
		case "followup":
			return ProtoClineAskType.FOLLOWUP
		case "plan_mode_respond":
			return ProtoClineAskType.PLAN_MODE_RESPOND
		case "command":
			return ProtoClineAskType.COMMAND
		case "command_output":
			return ProtoClineAskType.COMMAND_OUTPUT
		case "completion_result":
			return ProtoClineAskType.COMPLETION_RESULT
		case "tool":
			return ProtoClineAskType.TOOL
		case "api_req_failed":
			return ProtoClineAskType.API_REQ_FAILED
		case "resume_task":
			return ProtoClineAskType.RESUME_TASK
		case "resume_completed_task":
			return ProtoClineAskType.RESUME_COMPLETED_TASK
		case "mistake_limit_reached":
			return ProtoClineAskType.MISTAKE_LIMIT_REACHED
		case "auto_approval_max_req_reached":
			return ProtoClineAskType.AUTO_APPROVAL_MAX_REQ_REACHED
		case "browser_action_launch":
			return ProtoClineAskType.BROWSER_ACTION_LAUNCH
		case "use_mcp_server":
			return ProtoClineAskType.USE_MCP_SERVER
		case "new_task":
			return ProtoClineAskType.ASK_NEW_TASK // Corrected enum value
		// case "condense": // Not in proto
		default:
			return ProtoClineAskType.CLINE_ASK_TYPE_UNSPECIFIED
	}
}

// Helper to map internal ClineSay string to ProtoClineSayType enum
function mapInternalSayToProtoSayType(say: InternalClineMessage["say"] | undefined): ProtoClineSayType {
	switch (say) {
		case "task":
			return ProtoClineSayType.SAY_TASK
		case "error":
			return ProtoClineSayType.SAY_ERROR
		case "api_req_started":
			return ProtoClineSayType.API_REQ_STARTED
		case "api_req_finished":
			return ProtoClineSayType.API_REQ_FINISHED
		case "text":
			return ProtoClineSayType.SAY_TEXT
		case "reasoning":
			return ProtoClineSayType.REASONING
		case "completion_result":
			return ProtoClineSayType.SAY_COMPLETION_RESULT
		case "user_feedback":
			return ProtoClineSayType.USER_FEEDBACK
		case "user_feedback_diff":
			return ProtoClineSayType.USER_FEEDBACK_DIFF
		case "api_req_retried":
			return ProtoClineSayType.API_REQ_RETRIED
		case "command":
			return ProtoClineSayType.SAY_COMMAND
		case "command_output":
			return ProtoClineSayType.SAY_COMMAND_OUTPUT
		case "tool":
			return ProtoClineSayType.SAY_TOOL
		case "shell_integration_warning":
			return ProtoClineSayType.SHELL_INTEGRATION_WARNING
		case "browser_action_launch":
			return ProtoClineSayType.SAY_BROWSER_ACTION_LAUNCH
		case "browser_action":
			return ProtoClineSayType.BROWSER_ACTION
		case "browser_action_result":
			return ProtoClineSayType.BROWSER_ACTION_RESULT
		case "mcp_server_request_started":
			return ProtoClineSayType.MCP_SERVER_REQUEST_STARTED
		case "mcp_server_response":
			return ProtoClineSayType.MCP_SERVER_RESPONSE
		case "use_mcp_server":
			return ProtoClineSayType.SAY_USE_MCP_SERVER
		case "diff_error":
			return ProtoClineSayType.DIFF_ERROR
		case "deleted_api_reqs":
			return ProtoClineSayType.DELETED_API_REQS
		case "clineignore_error":
			return ProtoClineSayType.CLINEIGNORE_ERROR
		case "checkpoint_created":
			return ProtoClineSayType.CHECKPOINT_CREATED
		case "load_mcp_documentation":
			return ProtoClineSayType.LOAD_MCP_DOCUMENTATION
		default:
			return ProtoClineSayType.CLINE_SAY_TYPE_UNSPECIFIED
	}
}

// Mapper for ToolUse (internal) to Proto JS Object (ProtoToolUseBlock)
export function mapToolUseBlockToProto(block: ToolUse | undefined): Partial<ProtoToolUseBlock> | undefined {
	// Revert to Partial<>
	if (!block) {
		return undefined
	}
	Logger.trace(`[gRPC-Trace: Mapper:mapToolUseBlockToProto] Input: ${JSON.stringify(block)}`)
	let inputValue: Value | undefined = undefined
	if (block.params && typeof block.params === "object") {
		try {
			inputValue = Value.fromJavaScript(block.params)
		} catch (e: any) {
			Logger.warn(
				`[gRPC-Warn: Mapper:mapToolUseBlockToProto] Could not convert tool input params to google.protobuf.Value: ${e.message}`,
			)
		}
	} else if (block.params !== undefined) {
		Logger.warn(
			`[gRPC-Warn: Mapper:mapToolUseBlockToProto] Tool input params are not an object or undefined: ${typeof block.params}`,
		)
	}

	// ToolUse lacks 'id', use a placeholder or handle differently if required by proto
	let toolUseIdToUse = (block as any).id // Try to access id if it exists (e.g., if ToolUse type is updated)
	if (!toolUseIdToUse) {
		toolUseIdToUse = `tool_${Date.now()}` // Example placeholder
		Logger.warn(
			`[gRPC-Warn: Mapper:mapToolUseBlockToProto] Internal ToolUse block for '${block.name}' is missing an 'id'. Using placeholder: ${toolUseIdToUse}. The model-provided tool_use_id should be preserved.`,
		)
	}

	// Define as Partial
	const protoToolUse: Partial<ProtoToolUseBlock> = {
		toolUseId: toolUseIdToUse, // Required in Partial
		name: block.name, // Required in Partial
		input: inputValue,
	}
	Logger.trace(`[gRPC-Trace: Mapper:mapToolUseBlockToProto] Output: ${JSON.stringify(protoToolUse)}`)
	return protoToolUse // Return Partial object
}

// Helper to map internal ClineApiReqCancelReason to ProtoClineApiReqCancelReason enum
function mapInternalCancelReasonToProto(
	reason: ClineApiReqInfo["cancelReason"], // Simplified signature
): ProtoClineApiReqCancelReason {
	// Corrected return type to use the imported enum directly
	// Explicitly check for undefined before switch
	if (reason === undefined) {
		return ProtoClineApiReqCancelReason.CLINE_API_REQ_CANCEL_REASON_UNSPECIFIED
	}
	switch (reason) {
		case "streaming_failed":
			return ProtoClineApiReqCancelReason.STREAMING_FAILED
		case "user_cancelled":
			return ProtoClineApiReqCancelReason.USER_CANCELLED
		default:
			return ProtoClineApiReqCancelReason.CLINE_API_REQ_CANCEL_REASON_UNSPECIFIED
	}
}

// Mapper for ToolResponse content to Proto JS Object (ProtoToolResultBlock)
export function mapToolResultBlockToProto(
	toolUseId: string,
	content: ToolResponse | undefined,
): Partial<ProtoToolResultBlock> | undefined {
	// Revert to Partial<>
	if (!toolUseId) {
		return undefined
	}
	Logger.trace(`[gRPC-Trace: Mapper:mapToolResultBlockToProto] Input ID: ${toolUseId}, Content Type: ${typeof content}`)

	let textContent: string | undefined = undefined
	let jsonContent: Value | undefined = undefined
	let isError = false

	if (typeof content === "string") {
		textContent = content || "(tool did not return anything)"
		if (
			textContent.toLowerCase().startsWith("error:") ||
			textContent.includes("Error executing") ||
			textContent.includes("Failed to")
		) {
			isError = true
		}
	} else if (Array.isArray(content)) {
		textContent =
			content
				.filter((block): block is Anthropic.TextBlock => block.type === "text")
				.map((block) => block.text)
				.join("\n") || "(tool did not return anything)"
		if (
			textContent.toLowerCase().includes("error:") ||
			textContent.includes("Error executing") ||
			textContent.includes("Failed to")
		) {
			isError = true
		}
	} else if (typeof content === "object" && content !== null) {
		try {
			jsonContent = Value.fromJavaScript(content)
		} catch (e: any) {
			Logger.warn(
				`[gRPC-Warn: Mapper:mapToolResultBlockToProto] Could not convert object content to google.protobuf.Value: ${e.message}`,
			)
			textContent = `(Error converting tool result object: ${e.message})`
			isError = true
		}
	} else {
		textContent = "(tool did not return anything)"
	}

	// Define as Partial
	const protoToolResult: Partial<ProtoToolResultBlock> = {
		toolUseId: toolUseId, // Required in Partial
		isError: isError, // Required in Partial
		// contentPayload: undefined, // Don't initialize oneof directly
	}

	// Set the 'oneof' field using $case syntax and 'any' cast
	if (textContent !== undefined) {
		;(protoToolResult as any).contentPayload = { $case: "textContent", textContent: textContent }
	} else if (jsonContent !== undefined) {
		;(protoToolResult as any).contentPayload = { $case: "jsonContent", jsonContent: jsonContent }
	} else {
		;(protoToolResult as any).contentPayload = { $case: "textContent", textContent: "(tool did not return anything)" } // Fallback
	}

	Logger.trace(`[gRPC-Trace: Mapper:mapToolResultBlockToProto] Output: ${JSON.stringify(protoToolResult)}`)
	return protoToolResult // Return Partial object
}

// --- Mapper from Internal ExtensionMessage to Proto JS Object (ProtoExtensionMessage) ---
export function mapExtensionMessageToProto(
	message: InternalExtensionMessage, // Ensure this is the correct type from import
	clientId: string,
): Partial<ProtoExtensionMessage> | null {
	// Return Partial<> or null
	try {
		// Prioritize sending an ERROR message if message.error is set from the internal message
		if (message.error) {
			return {
				type: ProtoExtensionMessageType.ERROR,
				errorMessage: message.error,
			}
		}

		let responsePayload: Partial<ProtoExtensionMessage> = {
			type: ProtoExtensionMessageType.EXTENSION_MESSAGE_TYPE_UNSPECIFIED, // Default
		}

		// Access properties from the correctly typed 'message' parameter
		switch (message.type) {
			case "state":
				const mappedState = mapExtensionStateToProto(message.state)
				if (mappedState) {
					responsePayload.type = ProtoExtensionMessageType.STATE
					;(responsePayload as any).payload = { $case: "state", state: mappedState as ProtoExtensionState }
				} else {
					return null
				}
				break
			case "partialMessage":
				const partialMsg = mapClineMessageToProto(message.partialMessage)
				if (partialMsg) {
					responsePayload.type = ProtoExtensionMessageType.PARTIAL_MESSAGE
					;(responsePayload as any).payload = {
						$case: "partialMessage",
						partialMessage: partialMsg as ProtoClineMessage,
					}
				} else {
					return null
				}
				break
			// Removed case "text":
			// Complete text messages from the extension are expected to be of type "partialMessage"
			// with a ClineMessage payload where partial=false and say="text".
			// That flow is handled by the "partialMessage" case above.
			// ProtoExtensionMessageType.TEXT (value 3) with payload text_message (a ClineMessage)
			// would be populated by that existing path if a full text message is sent.

			// Note: A top-level "error" type from InternalExtensionMessage is handled by the initial `if (message.error)` check.
			// Task-specific errors are typically conveyed within a ClineMessage (say: "error").
			// Other InternalExtensionMessage types (like "selectedImages", "ollamaModels", etc.) would be added here
			// if they need to be streamed over gRPC during active RPCs like StartTask.
			// For now, focusing on core task flow messages.
			default:
				Logger.trace(
					`[gRPC-Trace: Mapper:mapExtensionMessageToProto] Ignoring internal message type for direct mapping: ${(message as any).type}`,
				)
				return null
		}
		return responsePayload
	} catch (error: any) {
		Logger.error(`[gRPC-Error: Mapper:mapExtensionMessageToProto] Error: ${error.message}`, error)
		return {
			// Return a ProtoExtensionMessage indicating an error
			type: ProtoExtensionMessageType.ERROR,
			errorMessage: `Internal mapping error: ${error.message}`,
		}
	}
}

// --- Mapper from Proto JS Object (ProtoToolResultBlock) to Internal ToolResponse ---
export function mapProtoToolResultToInternal(protoResult: Partial<ProtoToolResultBlock> | undefined): ToolResponse {
	if (!protoResult) {
		return "(Tool result not provided)"
	}
	Logger.trace(`[gRPC-Trace: Mapper:mapProtoToolResultToInternal] Input: ${JSON.stringify(protoResult)}`)

	let responseContent: string
	const images: string[] = []
	const isError = protoResult.isError ?? false
	let rawContent: string | undefined
	const payloadCase = (protoResult as any).contentPayload?.$case

	if (payloadCase === "textContent" && protoResult.textContent !== undefined) {
		rawContent = protoResult.textContent
	} else if (payloadCase === "jsonContent" && protoResult.jsonContent !== undefined) {
		try {
			// Ensure jsonContent is a Value object before calling toJavaScript
			const jsonValue =
				protoResult.jsonContent instanceof Value ? protoResult.jsonContent : Value.fromJavaScript(protoResult.jsonContent)
			const jsObject = jsonValue.toJavaScript()
			rawContent = JSON.stringify(jsObject, null, 2)
		} catch (e: any) {
			Logger.warn(`[gRPC-Warn: Mapper:mapProtoToolResultToInternal] Could not convert jsonContent to string: ${e.message}`)
			rawContent = `(Error converting JSON tool result: ${e.message})`
		}
	} else {
		rawContent = "(Tool did not return content)"
	}

	responseContent = isError ? formatResponse.toolError(rawContent) : rawContent
	const toolResponse = formatResponse.toolResult(responseContent, images.length > 0 ? images : undefined)

	Logger.trace(
		`[gRPC-Trace: Mapper:mapProtoToolResultToInternal] Output: ${typeof toolResponse === "string" ? toolResponse : JSON.stringify(toolResponse)}`,
	)
	return toolResponse
}

// --- Main Exported Mapper for Internal ExtensionState to Proto JS Object (ProtoExtensionState) ---
// Export the function directly
export function mapExtensionStateToProto(state: InternalExtensionState | undefined): ProtoExtensionState | undefined {
	// Changed return type from Partial<>
	Logger.trace(`[gRPC-Trace: Mapper:mapExtensionStateToProto] Input State (version: ${state?.version})`)
	if (!state) {
		return undefined
	}

	const mapPlatform = (platform: InternalPlatform | undefined): ProtoPlatform => {
		switch (platform) {
			case "aix":
				return ProtoPlatform.AIX
			case "darwin":
				return ProtoPlatform.DARWIN
			case "freebsd":
				return ProtoPlatform.FREEBSD
			case "linux":
				return ProtoPlatform.LINUX
			case "openbsd":
				return ProtoPlatform.OPENBSD
			case "sunos":
				return ProtoPlatform.SUNOS
			case "win32":
				return ProtoPlatform.WIN32
			default:
				return ProtoPlatform.UNKNOWN
		}
	}

	const mapTelemetry = (setting: InternalTelemetrySetting | undefined): ProtoTelemetrySettingValue => {
		switch (setting) {
			case "unset":
				return ProtoTelemetrySettingValue.UNSET
			case "enabled":
				return ProtoTelemetrySettingValue.ENABLED
			case "disabled":
				return ProtoTelemetrySettingValue.DISABLED
			default:
				return ProtoTelemetrySettingValue.TELEMETRY_SETTING_UNSPECIFIED
		}
	}

	const protoState: Partial<ProtoExtensionState> = {
		version: state.version, // Required
		platform: mapPlatform(state.platform), // Required
		telemetrySetting: mapTelemetry(state.telemetrySetting), // Required
		vscMachineId: state.vscMachineId, // Required
		planActSeparateModelsSetting: state.planActSeparateModelsSetting, // Required
		shouldShowAnnouncement: state.shouldShowAnnouncement, // Required
		uriScheme: state.uriScheme ?? undefined,
		checkpointTrackerErrorMessage: state.checkpointTrackerErrorMessage ?? undefined,
		mcpMarketplaceEnabled: state.mcpMarketplaceEnabled ?? undefined,
		// Note: remoteBrowserHost is also in browserSettings. Ensure consistency or pick one source.
		// Currently, this top-level one takes precedence if state.remoteBrowserHost is set.
		remoteBrowserHost: state.remoteBrowserHost ?? undefined,
		customInstructions: state.customInstructions ?? undefined,
		// Use sub-mappers returning Partial<>, cast results
		userInfo: mapUserInfoToProto(state.userInfo) as ProtoUserInfo | undefined, // Cast Partial to full (or undefined)
		taskHistory: state.taskHistory?.map((item) => mapHistoryItemToProto(item) as ProtoHistoryItem) ?? [], // Cast items
		currentTaskItem: state.currentTaskItem ? (mapHistoryItemToProto(state.currentTaskItem) as ProtoHistoryItem) : undefined, // Cast item
		apiConfiguration: mapApiConfigurationToProto(state.apiConfiguration) as ProtoApiConfiguration | undefined, // Cast
		autoApprovalSettings: mapAutoApprovalSettingsToProto(state.autoApprovalSettings), // Now returns full object
		browserSettings: mapBrowserSettingsToProto(state.browserSettings) as ProtoBrowserSettings, // Cast
		chatSettings: mapChatSettingsToProto(state.chatSettings) as ProtoChatSettings, // Cast
		// Assuming ProtoClineRulesToggles only has optional 'toggles' map
		globalClineRulesToggles: { toggles: state.globalClineRulesToggles ?? {} } as ProtoClineRulesToggles, // Cast
		localClineRulesToggles: { toggles: state.localClineRulesToggles ?? {} } as ProtoClineRulesToggles, // Cast
		// Ensure ALL required fields from ProtoExtensionState are included here with defaults
		clineMessages:
			state.clineMessages
				?.map((msg) => mapClineMessageToProto(msg) as ProtoClineMessage | undefined)
				.filter((mappedMsg): mappedMsg is ProtoClineMessage => mappedMsg !== undefined) ?? [], // Map and filter out undefined
		// Add other required fields from ProtoExtensionState with defaults if necessary
	}
	if (
		protoState.apiConfiguration &&
		!protoState.apiConfiguration.apiModelId &&
		protoState.apiConfiguration.apiProvider !== ProtoApiProvider.API_PROVIDER_UNSPECIFIED &&
		protoState.apiConfiguration.apiProvider !== ProtoApiProvider.CLINE
	) {
		Logger.warn(
			`[gRPC-Warn: Mapper:mapExtensionStateToProto] apiConfiguration is present with provider ${protoState.apiConfiguration.apiProvider} but apiModelId is empty. This might be an issue.`,
		)
	}

	// Ensure the returned object conforms to ProtoExtensionState (TypeScript will check required fields)
	Logger.trace(`[gRPC-Trace: Mapper:mapExtensionStateToProto] Output State (version: ${protoState?.version})`)
	// Cast the final object to the full type, assuming all required fields are now handled
	return protoState as ProtoExtensionState
}

// --- MCP Mappers ---

// Maps InternalMcpTool to Partial<ProtoMcpTool>
export function mapMcpToolToProto(tool: InternalMcpTool | undefined): Partial<ProtoMcpTool> | undefined {
	if (!tool) {
		return undefined
	}

	let inputSchemaString: string | undefined = undefined
	if (tool.inputSchema) {
		if (typeof tool.inputSchema === "string") {
			inputSchemaString = tool.inputSchema
		} else {
			try {
				inputSchemaString = JSON.stringify(tool.inputSchema)
			} catch (e: any) {
				Logger.error(`[GrpcMapper] Failed to stringify tool.inputSchema for ${tool.name}:`, e)
				// Fallback to undefined if stringification fails
				inputSchemaString = undefined
			}
		}
	}

	return {
		name: tool.name, // Required
		description: tool.description ?? undefined,
		inputSchema: inputSchemaString,
		autoApprove: tool.autoApprove ?? undefined,
	}
}

// Maps InternalMcpResource to Partial<ProtoMcpResource>
export function mapMcpResourceToProto(resource: InternalMcpResource | undefined): Partial<ProtoMcpResource> | undefined {
	if (!resource) {
		return undefined
	}
	return {
		uri: resource.uri, // Required
		name: resource.name, // Required
		mimeType: resource.mimeType ?? undefined,
		description: resource.description ?? undefined,
	}
}

// Maps InternalMcpResourceTemplate to Partial<ProtoMcpResourceTemplate>
export function mapMcpResourceTemplateToProto(
	template: InternalMcpResourceTemplate | undefined,
): Partial<ProtoMcpResourceTemplate> | undefined {
	if (!template) {
		return undefined
	}
	return {
		uriTemplate: template.uriTemplate, // Required
		name: template.name, // Required
		mimeType: template.mimeType ?? undefined,
		description: template.description ?? undefined,
	}
}

// Maps InternalMcpServer['status'] to ProtoMcpServerStatus
export function mapMcpServerStatusToProto(status: InternalMcpServer["status"] | undefined): ProtoMcpServerStatus {
	switch (status) {
		case "connected":
			return ProtoMcpServerStatus.MCP_SERVER_STATUS_CONNECTED
		case "connecting":
			return ProtoMcpServerStatus.MCP_SERVER_STATUS_CONNECTING
		case "disconnected":
			return ProtoMcpServerStatus.MCP_SERVER_STATUS_DISCONNECTED
		default:
			return ProtoMcpServerStatus.MCP_SERVER_STATUS_DISCONNECTED // Default to disconnected if unspecified
	}
}

// Maps InternalMcpServer to Partial<ProtoMcpServer>
export function mapMcpServerToProto(server: InternalMcpServer | undefined): Partial<ProtoMcpServer> | undefined {
	if (!server) {
		return undefined
	}

	let finalConfigString: string
	if (typeof server.config === "string") {
		finalConfigString = server.config
	} else if (server.config !== null && server.config !== undefined) {
		// If server.config is an object (or any other non-string, non-null/undefined type)
		try {
			finalConfigString = JSON.stringify(server.config)
		} catch (e) {
			Logger.error(`[GrpcMapper] Failed to stringify server.config for ${server.name}:`, e)
			finalConfigString = '{"error":"config stringification failed"}' // Fallback
		}
	} else {
		// server.config is null or undefined, default to empty string for proto
		finalConfigString = ""
	}

	return {
		name: server.name, // Required
		config: finalConfigString, // Now always a string
		status: mapMcpServerStatusToProto(server.status), // Required
		error: server.error ?? undefined,
		tools: server.tools?.map((t) => mapMcpToolToProto(t) as ProtoMcpTool) ?? [],
		resources: server.resources?.map((r) => mapMcpResourceToProto(r) as ProtoMcpResource) ?? [],
		resourceTemplates:
			server.resourceTemplates?.map((rt) => mapMcpResourceTemplateToProto(rt) as ProtoMcpResourceTemplate) ?? [],
		disabled: server.disabled ?? undefined,
		timeout: server.timeout ?? undefined,
	}
}

// Maps InternalMcpServer[] to Partial<ProtoMcpServers>
export function mapMcpServersToProto(servers: InternalMcpServer[] | undefined): Partial<ProtoMcpServers> | undefined {
	if (!servers) {
		return undefined
	}
	return {
		mcpServers: servers.map((s) => mapMcpServerToProto(s) as ProtoMcpServer) ?? [],
	}
}

// Export relevant Proto types for use in other modules
export { ProtoExtensionState, ProtoToolResultBlock, ProtoToolUseBlock, ProtoMcpServers }

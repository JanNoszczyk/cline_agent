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
	SayTextPayload as ProtoSayTextPayload,
	AskFollowupPayload as ProtoAskFollowupPayload,
} from "../../shared/proto/task_control"

import Anthropic from "@anthropic-ai/sdk" // Keep for ToolResponse type check
import { formatResponse } from "../../core/prompts/responses"

// --- Helper Functions ---

// Returns a Timestamp instance or undefined
export function dateToProtoTimestamp(date: Date | number | undefined): Timestamp | undefined {
	if (date === undefined || date === null) return undefined
	const d = typeof date === "number" ? new Date(date) : date
	if (isNaN(d.getTime())) return undefined // Handle invalid dates
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
	if (!userInfo) return undefined
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
		// Return number | undefined for timestamp
		ts: protoTs ? protoTs.toDate().getTime() : undefined,
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
	if (!config) return undefined

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
): Partial<ProtoAutoApprovalActions> | undefined {
	// Revert to Partial<>
	if (!actions) return undefined
	// Return partial, let caller handle defaults if needed
	return {
		readFiles: typeof actions.readFiles === "boolean" ? actions.readFiles : undefined,
		readFilesExternally: typeof actions.readFilesExternally === "boolean" ? actions.readFilesExternally : undefined,
		editFiles: typeof actions.editFiles === "boolean" ? actions.editFiles : undefined,
		editFilesExternally: typeof actions.editFilesExternally === "boolean" ? actions.editFilesExternally : undefined,
		executeSafeCommands: typeof actions.executeSafeCommands === "boolean" ? actions.executeSafeCommands : undefined,
		executeAllCommands: typeof actions.executeAllCommands === "boolean" ? actions.executeAllCommands : undefined,
		useBrowser: typeof actions.useBrowser === "boolean" ? actions.useBrowser : undefined,
		useMcp: typeof actions.useMcp === "boolean" ? actions.useMcp : undefined,
	}
}

// Maps InternalAutoApprovalSettings to Partial<ProtoAutoApprovalSettings>
export function mapAutoApprovalSettingsToProto(settings: InternalAutoApprovalSettings): Partial<ProtoAutoApprovalSettings> {
	// Revert to Partial<>
	return {
		version: settings.version, // Required in Partial as well
		enabled: settings.enabled, // Required in Partial as well
		// Re-add cast for actions
		actions: mapAutoApprovalActionsToProto(settings.actions) as ProtoAutoApprovalActions | undefined,
		maxRequests: settings.maxRequests ?? undefined,
		enableNotifications: settings.enableNotifications ?? undefined,
	}
}

// Maps InternalBrowserSettings['viewport'] to Partial<ProtoBrowserViewport>
export function mapViewportToProto(
	viewport: InternalBrowserSettings["viewport"] | undefined,
): Partial<ProtoBrowserViewport> | undefined {
	if (!viewport) return undefined
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

// Mapper for InternalClineMessage to Partial<ProtoClineMessage>
export function mapClineMessageToProto(msg: InternalClineMessage | undefined): Partial<ProtoClineMessage> | undefined {
	// Revert to Partial<>
	Logger.trace(`[gRPC-Trace: Mapper:mapClineMessageToProto] Input: ${JSON.stringify(msg)}`)
	if (!msg) return undefined

	const mapType = (type: InternalClineMessage["type"]): ProtoClineMessageType => {
		return type === "ask" ? ProtoClineMessageType.ASK : ProtoClineMessageType.SAY
	}

	const protoTs = dateToProtoTimestamp(msg.ts)
	// Define as Partial, but ensure required fields like 'ts' have defaults
	const protoMsg: Partial<ProtoClineMessage> = {
		// Ensure ts is always a number, default to 0
		ts: protoTs ? protoTs.toDate().getTime() : 0,
		type: mapType(msg.type), // Required in Partial
		images: msg.images ?? [],
		partial: msg.partial ?? false,
		lastCheckpointHash: msg.lastCheckpointHash ?? undefined,
		isCheckpointCheckedOut: msg.isCheckpointCheckedOut ?? false,
		isOperationOutsideWorkspace: msg.isOperationOutsideWorkspace ?? false,
		// text: undefined, // Don't initialize oneof fields directly
	}

	// Map specific payloads using $case
	if (msg.type === "say" && msg.say === "text") {
		// Use $case syntax for oneof
		;(protoMsg as any).sayPayload = { $case: "sayTextPayload", sayTextPayload: { textContent: msg.text ?? "" } }
	} else if (msg.type === "ask" && msg.ask === "followup") {
		try {
			const askPayloadContent = JSON.parse(msg.text || "{}")
			// Use $case syntax for oneof
			;(protoMsg as any).askPayload = {
				$case: "askFollowupPayload",
				askFollowupPayload: {
					question: askPayloadContent.question ?? "",
					options: askPayloadContent.options ?? [],
				},
			}
		} catch (e) {
			Logger.warn("Failed to parse followup ask payload")
			protoMsg.text = msg.text ?? undefined // Fallback to text
		}
	}
	// ... Add mappings for ALL other ask/say types and payloads ...
	else {
		// Fallback to generic text field if no specific payload mapped
		protoMsg.text = msg.text ?? undefined
	}

	// Clear generic text if a specific payload was set (optional, depends on client handling)
	// Use 'any' cast to access $case for check
	if ((protoMsg as any).askPayload?.$case || (protoMsg as any).sayPayload?.$case) {
		protoMsg.text = undefined
	}

	Logger.trace(`[gRPC-Trace: Mapper:mapClineMessageToProto] Output: ${JSON.stringify(protoMsg)}`)
	return protoMsg // Return Partial object
}

// Mapper for ToolUse (internal) to Proto JS Object (ProtoToolUseBlock)
export function mapToolUseBlockToProto(block: ToolUse | undefined): Partial<ProtoToolUseBlock> | undefined {
	// Revert to Partial<>
	if (!block) return undefined
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
	const toolUseIdPlaceholder = `tool_${Date.now()}` // Example placeholder

	// Removed duplicate toolUseIdPlaceholder declaration

	// Define as Partial
	const protoToolUse: Partial<ProtoToolUseBlock> = {
		toolUseId: toolUseIdPlaceholder, // Required in Partial
		name: block.name, // Required in Partial
		input: inputValue,
	}
	Logger.trace(`[gRPC-Trace: Mapper:mapToolUseBlockToProto] Output: ${JSON.stringify(protoToolUse)}`)
	return protoToolUse // Return Partial object
}

// Mapper for ToolResponse content to Proto JS Object (ProtoToolResultBlock)
export function mapToolResultBlockToProto(
	toolUseId: string,
	content: ToolResponse | undefined,
): Partial<ProtoToolResultBlock> | undefined {
	// Revert to Partial<>
	if (!toolUseId) return undefined
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
		// Define as Partial
		let responsePayload: Partial<ProtoExtensionMessage> = {
			// Use 0 as the default enum value (common practice)
			type: 0, // Required: Provide default (assuming 0 is UNSPECIFIED)
			errorMessage: undefined,
			// payload: undefined, // Don't initialize oneof directly
		}

		// Access properties from the correctly typed 'message' parameter
		switch (message.type) {
			case "state":
				// Access payload via message.state
				const mappedState = mapExtensionStateToProto(message.state) // Use message.state
				if (mappedState) {
					responsePayload.type = ProtoExtensionMessageType.STATE
					// Assign oneof using $case and cast sub-message
					;(responsePayload as any).payload = { $case: "state", state: mappedState as ProtoExtensionState } // Cast needed here
				} else {
					return null
				}
				break
			case "partialMessage": // Handle partial message type
				// Access payload via message.partialMessage
				const partialMsg = mapClineMessageToProto(message.partialMessage) // Use message.partialMessage
				if (partialMsg) {
					responsePayload.type = ProtoExtensionMessageType.PARTIAL_MESSAGE
					// Assign oneof using $case and cast sub-message
					;(responsePayload as any).payload = {
						$case: "partialMessage",
						partialMessage: partialMsg as ProtoClineMessage,
					} // Cast needed here
				} else {
					return null
				}
				break
			// Removed case "text": as it's not a top-level type in InternalExtensionMessage
			// Removed case "tool_use": as it's not a top-level type in InternalExtensionMessage
			// Removed case "error": as it's not a top-level type in InternalExtensionMessage
			// Add cases for other InternalExtensionMessage types if they need mapping
			default:
				// Use exhaustive check pattern if possible, or log unhandled types
				Logger.trace(`[gRPC-Trace: Mapper:mapExtensionMessageToProto] Ignoring internal message type: ${message.type}`)
				return null
		}
		return responsePayload // Return Partial object
	} catch (error: any) {
		Logger.error(`[gRPC-Error: Mapper:mapExtensionMessageToProto] Error mapping ExtensionMessage: ${error.message}`, error)
		try {
			// Return a Partial error message, don't set payload directly
			return {
				type: ProtoExtensionMessageType.ERROR,
				errorMessage: `Internal mapping error: ${error.message}`,
				// payload should not be set here for Partial
			}
		} catch {
			return null
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
	if (!state) return undefined

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
		remoteBrowserHost: state.remoteBrowserHost ?? undefined,
		customInstructions: state.customInstructions ?? undefined,
		// Use sub-mappers returning Partial<>, cast results
		userInfo: mapUserInfoToProto(state.userInfo) as ProtoUserInfo | undefined, // Cast Partial to full (or undefined)
		taskHistory: state.taskHistory?.map((item) => mapHistoryItemToProto(item) as ProtoHistoryItem) ?? [], // Cast items
		currentTaskItem: state.currentTaskItem ? (mapHistoryItemToProto(state.currentTaskItem) as ProtoHistoryItem) : undefined, // Cast item
		apiConfiguration: mapApiConfigurationToProto(state.apiConfiguration) as ProtoApiConfiguration | undefined, // Cast
		autoApprovalSettings: mapAutoApprovalSettingsToProto(state.autoApprovalSettings) as ProtoAutoApprovalSettings, // Cast
		browserSettings: mapBrowserSettingsToProto(state.browserSettings) as ProtoBrowserSettings, // Cast
		chatSettings: mapChatSettingsToProto(state.chatSettings) as ProtoChatSettings, // Cast
		// Assuming ProtoClineRulesToggles only has optional 'toggles' map
		globalClineRulesToggles: { toggles: state.globalClineRulesToggles ?? {} } as ProtoClineRulesToggles, // Cast
		localClineRulesToggles: { toggles: state.localClineRulesToggles ?? {} } as ProtoClineRulesToggles, // Cast
		// Ensure ALL required fields from ProtoExtensionState are included here with defaults
		clineMessages: [], // Provide default for required array
		// Add other required fields from ProtoExtensionState with defaults if necessary
	}

	// Ensure the returned object conforms to ProtoExtensionState (TypeScript will check required fields)
	Logger.trace(`[gRPC-Trace: Mapper:mapExtensionStateToProto] Output State (version: ${protoState?.version})`)
	// Cast the final object to the full type, assuming all required fields are now handled
	return protoState as ProtoExtensionState
}

// Export relevant Proto types for use in other modules
export { ProtoExtensionState, ProtoToolResultBlock, ProtoToolUseBlock }

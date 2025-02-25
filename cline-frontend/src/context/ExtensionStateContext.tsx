import React, { createContext, useContext, useState, useEffect } from "react"
import { apiClient } from "../utils/apiClient"

// Define types based on the Cline extension
export interface ClineMessage {
	type: "say" | "ask"
	say?: string
	ask?: string
	text?: string
	ts: number
	partial?: boolean
	images?: string[]
	lastCheckpointHash?: string
	isCheckpointCheckedOut?: boolean
}

export interface HistoryItem {
	id: string
	task: string
	timestamp: number
	messages: ClineMessage[]
}

export interface ApiConfiguration {
	apiProvider?: string
	apiModelId?: string
	apiKey?: string
	liteLlmBaseUrl?: string
	liteLlmModelId?: string
	liteLlmApiKey?: string
	anthropicBaseUrl?: string
	openRouterApiKey?: string
	openRouterModelId?: string
	openRouterModelInfo?: {
		maxTokens?: number
		contextWindow?: number
		supportsImages?: boolean
		supportsComputerUse?: boolean
		supportsPromptCache: boolean
		inputPrice?: number
		outputPrice?: number
		cacheWritesPrice?: number
		cacheReadsPrice?: number
		description?: string
	}
	awsAccessKey?: string
	awsSecretKey?: string
	awsSessionToken?: string
	awsRegion?: string
	awsUseCrossRegionInference?: boolean
	awsUseProfile?: boolean
	awsProfile?: string
	vertexProjectId?: string
	vertexRegion?: string
	openAiBaseUrl?: string
	openAiApiKey?: string
	openAiModelId?: string
	openAiModelInfo?: {
		maxTokens?: number
		contextWindow?: number
		supportsImages?: boolean
		supportsComputerUse?: boolean
		supportsPromptCache: boolean
		inputPrice?: number
		outputPrice?: number
	}
	ollamaModelId?: string
	ollamaBaseUrl?: string
	lmStudioModelId?: string
	lmStudioBaseUrl?: string
	geminiApiKey?: string
	openAiNativeApiKey?: string
	deepSeekApiKey?: string
	requestyApiKey?: string
	requestyModelId?: string
	togetherApiKey?: string
	togetherModelId?: string
	qwenApiKey?: string
	mistralApiKey?: string
	azureApiVersion?: string
	vsCodeLmModelSelector?: any
	o3MiniReasoningEffort?: string
	qwenApiLine?: string
}

export interface AutoApprovalSettings {
	enabled: boolean
	maxRequests: number
	tools: string[]
}

export interface BrowserSettings {
	autoApprove: boolean
}

export interface ChatSettings {
	mode: "plan" | "act"
}

export interface McpServer {
	name: string
	disabled: boolean
	tools?: {
		name: string
		description: string
		autoApprove: boolean
	}[]
	resources?: {
		uri: string
		name: string
		mimeType?: string
		description?: string
	}[]
	resourceTemplates?: {
		uriTemplate: string
		name: string
		mimeType?: string
		description?: string
	}[]
}

export interface McpMarketplaceCatalog {
	items: {
		id: string
		name: string
		description: string
		author: string
		version: string
		downloadCount: number
		stars: number
	}[]
}

export interface ExtensionState {
	version: string
	clineMessages: ClineMessage[]
	taskHistory: HistoryItem[]
	shouldShowAnnouncement: boolean
	apiConfiguration?: ApiConfiguration
	customInstructions?: string
	autoApprovalSettings: AutoApprovalSettings
	browserSettings: BrowserSettings
	chatSettings: ChatSettings
	isLoggedIn: boolean
	platform: string
}

// Default values
export const DEFAULT_AUTO_APPROVAL_SETTINGS: AutoApprovalSettings = {
	enabled: false,
	maxRequests: 10,
	tools: [],
}

export const DEFAULT_BROWSER_SETTINGS: BrowserSettings = {
	autoApprove: false,
}

export const DEFAULT_CHAT_SETTINGS: ChatSettings = {
	mode: "act",
}

export const DEFAULT_PLATFORM = "darwin"

interface ExtensionStateContextType extends ExtensionState {
	didHydrateState: boolean
	showWelcome: boolean
	theme: any
	mcpServers: McpServer[]
	mcpMarketplaceCatalog: McpMarketplaceCatalog
	filePaths: string[]
	setApiConfiguration: (config: ApiConfiguration) => void
	setCustomInstructions: (value?: string) => void
	setShowAnnouncement: (value: boolean) => void
}

const ExtensionStateContext = createContext<ExtensionStateContextType | undefined>(undefined)

export const ExtensionStateContextProvider: React.FC<{
	children: React.ReactNode
}> = ({ children }) => {
	// Initialize state with default values
	const [state, setState] = useState<ExtensionState>({
		version: "1.0.0",
		clineMessages: [],
		taskHistory: [],
		shouldShowAnnouncement: false,
		autoApprovalSettings: DEFAULT_AUTO_APPROVAL_SETTINGS,
		browserSettings: DEFAULT_BROWSER_SETTINGS,
		chatSettings: DEFAULT_CHAT_SETTINGS,
		isLoggedIn: false,
		platform: DEFAULT_PLATFORM,
	})

	// State for additional context values
	const [didHydrateState, setDidHydrateState] = useState(false)
	const [mcpServers, setMcpServers] = useState<McpServer[]>([])
	const [mcpMarketplaceCatalog, setMcpMarketplaceCatalog] = useState<McpMarketplaceCatalog>({ items: [] })
	const [filePaths, setFilePaths] = useState<string[]>([])
	const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)

	// Fetch initial state from the API
	useEffect(() => {
		const fetchInitialState = async () => {
			try {
				const extensionState = await apiClient.getState()
				setState(extensionState)
				setDidHydrateState(true)

				// If there's a current task, store its ID
				if (extensionState.clineMessages && extensionState.clineMessages.length > 0) {
					const taskMessage = extensionState.clineMessages.find(
						(msg: ClineMessage) => msg.type === "say" && msg.say === "task",
					)
					if (taskMessage) {
						// The task ID might be stored in the state or we might need to extract it
						// This is a placeholder - adjust based on your actual data structure
						setCurrentTaskId(extensionState.currentTaskId || null)
					}
				}

				// Fetch MCP marketplace catalog
				try {
					const catalog = await apiClient.getMcpMarketplace()
					if (catalog) {
						setMcpMarketplaceCatalog(catalog)
					}
				} catch (error) {
					console.error("Failed to fetch MCP marketplace catalog:", error)
				}
			} catch (error) {
				console.error("Failed to fetch initial state:", error)
				// Use default state if API fails
				setDidHydrateState(true)
			}
		}

		fetchInitialState()
	}, [])

	// Update API configuration and sync with server
	const setApiConfiguration = async (config: ApiConfiguration) => {
		try {
			await apiClient.updateApiConfiguration(config)
			setState((prevState) => ({
				...prevState,
				apiConfiguration: config,
			}))
		} catch (error) {
			console.error("Failed to update API configuration:", error)
		}
	}

	// Update custom instructions and sync with server
	const setCustomInstructions = async (value?: string) => {
		try {
			if (value !== undefined) {
				await apiClient.updateCustomInstructions(value)
			}
			setState((prevState) => ({
				...prevState,
				customInstructions: value,
			}))
		} catch (error) {
			console.error("Failed to update custom instructions:", error)
		}
	}

	// Update show announcement state
	const setShowAnnouncement = (value: boolean) => {
		setState((prevState) => ({
			...prevState,
			shouldShowAnnouncement: value,
		}))
	}

	const contextValue: ExtensionStateContextType = {
		...state,
		didHydrateState,
		showWelcome: !didHydrateState || state.clineMessages.length === 0,
		theme: {}, // This could be expanded if theme support is needed
		mcpServers,
		mcpMarketplaceCatalog,
		filePaths,
		setApiConfiguration,
		setCustomInstructions,
		setShowAnnouncement,
	}

	return <ExtensionStateContext.Provider value={contextValue}>{children}</ExtensionStateContext.Provider>
}

export const useExtensionState = () => {
	const context = useContext(ExtensionStateContext)
	if (context === undefined) {
		throw new Error("useExtensionState must be used within an ExtensionStateContextProvider")
	}
	return context
}

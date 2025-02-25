import { ApiConfiguration } from "../context/ExtensionStateContext"
import {
	anthropicDefaultModelId,
	anthropicModels,
	bedrockDefaultModelId,
	bedrockModels,
	deepSeekDefaultModelId,
	deepSeekModels,
	geminiDefaultModelId,
	geminiModels,
	liteLlmDefaultModelId,
	liteLlmModelInfoSaneDefaults,
	mistralDefaultModelId,
	mistralModels,
	openAiModelInfoSaneDefaults,
	openAiNativeDefaultModelId,
	openAiNativeModels,
	openRouterDefaultModelId,
	openRouterDefaultModelInfo,
	qwenDefaultModelId,
	qwenModels,
	vertexDefaultModelId,
	vertexModels,
} from "./modelInfo"

/**
 * Implementation of the normalizeApiConfiguration function from the VSCode extension.
 * This is used by the TaskHeader component to get information about the selected model.
 */
export function normalizeApiConfiguration(apiConfiguration: ApiConfiguration | undefined) {
	if (!apiConfiguration) {
		return {
			selectedModelInfo: {
				contextWindow: 100000,
				inputPrice: 0.0001,
				outputPrice: 0.0002,
				supportsPromptCache: false,
			},
		}
	}

	const { apiProvider, apiModelId } = apiConfiguration

	let selectedModelInfo = {
		contextWindow: 100000,
		inputPrice: 0.0001,
		outputPrice: 0.0002,
		supportsPromptCache: false,
	}

	if (apiProvider === "anthropic") {
		const modelId = apiModelId || anthropicDefaultModelId
		selectedModelInfo = anthropicModels[modelId as keyof typeof anthropicModels] || selectedModelInfo
	} else if (apiProvider === "bedrock") {
		const modelId = apiModelId || bedrockDefaultModelId
		selectedModelInfo = bedrockModels[modelId as keyof typeof bedrockModels] || selectedModelInfo
	} else if (apiProvider === "vertex") {
		const modelId = apiModelId || vertexDefaultModelId
		selectedModelInfo = vertexModels[modelId as keyof typeof vertexModels] || selectedModelInfo
	} else if (apiProvider === "openrouter") {
		selectedModelInfo = apiConfiguration.openRouterModelInfo || openRouterDefaultModelInfo
	} else if (apiProvider === "openai") {
		selectedModelInfo = openAiModelInfoSaneDefaults
	} else if (apiProvider === "gemini") {
		const modelId = apiModelId || geminiDefaultModelId
		selectedModelInfo = geminiModels[modelId as keyof typeof geminiModels] || selectedModelInfo
	} else if (apiProvider === "openai-native") {
		const modelId = apiModelId || openAiNativeDefaultModelId
		selectedModelInfo = openAiNativeModels[modelId as keyof typeof openAiNativeModels] || selectedModelInfo
	} else if (apiProvider === "deepseek") {
		const modelId = apiModelId || deepSeekDefaultModelId
		selectedModelInfo = deepSeekModels[modelId as keyof typeof deepSeekModels] || selectedModelInfo
	} else if (apiProvider === "qwen") {
		const modelId = apiModelId || qwenDefaultModelId
		selectedModelInfo = qwenModels[modelId as keyof typeof qwenModels] || selectedModelInfo
	} else if (apiProvider === "mistral") {
		const modelId = apiModelId || mistralDefaultModelId
		selectedModelInfo = mistralModels[modelId as keyof typeof mistralModels] || selectedModelInfo
	} else if (apiProvider === "litellm") {
		selectedModelInfo = liteLlmModelInfoSaneDefaults
	}

	return { selectedModelInfo }
}

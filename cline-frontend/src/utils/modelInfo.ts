/**
 * This file contains model information for various API providers.
 * It's based on the original implementation in the VSCode extension.
 */

export interface ModelInfo {
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

// Anthropic
export type AnthropicModelId = keyof typeof anthropicModels
export const anthropicDefaultModelId: AnthropicModelId = "claude-3-5-sonnet-20241022"
export const anthropicModels = {
  "claude-3-5-sonnet-20241022": {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: true,
    supportsComputerUse: true,
    supportsPromptCache: true,
    inputPrice: 3.0,
    outputPrice: 15.0,
    cacheWritesPrice: 3.75,
    cacheReadsPrice: 0.3,
  },
  "claude-3-5-haiku-20241022": {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: false,
    supportsPromptCache: true,
    inputPrice: 0.8,
    outputPrice: 4.0,
    cacheWritesPrice: 1.0,
    cacheReadsPrice: 0.08,
  },
  "claude-3-opus-20240229": {
    maxTokens: 4096,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: true,
    inputPrice: 15.0,
    outputPrice: 75.0,
    cacheWritesPrice: 18.75,
    cacheReadsPrice: 1.5,
  },
  "claude-3-haiku-20240307": {
    maxTokens: 4096,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: true,
    inputPrice: 0.25,
    outputPrice: 1.25,
    cacheWritesPrice: 0.3,
    cacheReadsPrice: 0.03,
  },
} as const

// AWS Bedrock
export type BedrockModelId = keyof typeof bedrockModels
export const bedrockDefaultModelId: BedrockModelId = "anthropic.claude-3-5-sonnet-20241022-v2:0"
export const bedrockModels = {
  "anthropic.claude-3-5-sonnet-20241022-v2:0": {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: true,
    supportsComputerUse: true,
    supportsPromptCache: false,
    inputPrice: 3.0,
    outputPrice: 15.0,
  },
  "anthropic.claude-3-5-haiku-20241022-v1:0": {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: false,
    supportsPromptCache: false,
    inputPrice: 1.0,
    outputPrice: 5.0,
  },
  "anthropic.claude-3-5-sonnet-20240620-v1:0": {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 3.0,
    outputPrice: 15.0,
  },
  "anthropic.claude-3-opus-20240229-v1:0": {
    maxTokens: 4096,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 15.0,
    outputPrice: 75.0,
  },
  "anthropic.claude-3-sonnet-20240229-v1:0": {
    maxTokens: 4096,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 3.0,
    outputPrice: 15.0,
  },
  "anthropic.claude-3-haiku-20240307-v1:0": {
    maxTokens: 4096,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 0.25,
    outputPrice: 1.25,
  },
} as const

// OpenRouter
export const openRouterDefaultModelId = "anthropic/claude-3.5-sonnet"
export const openRouterDefaultModelInfo: ModelInfo = {
  maxTokens: 8192,
  contextWindow: 200_000,
  supportsImages: true,
  supportsComputerUse: true,
  supportsPromptCache: true,
  inputPrice: 3.0,
  outputPrice: 15.0,
  cacheWritesPrice: 3.75,
  cacheReadsPrice: 0.3,
  description:
    "The new Claude 3.5 Sonnet delivers better-than-Opus capabilities, faster-than-Sonnet speeds, at the same Sonnet prices.",
}

// Vertex AI
export type VertexModelId = keyof typeof vertexModels
export const vertexDefaultModelId: VertexModelId = "claude-3-5-sonnet-v2@20241022"
export const vertexModels = {
  "claude-3-5-sonnet-v2@20241022": {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: true,
    supportsComputerUse: true,
    supportsPromptCache: false,
    inputPrice: 3.0,
    outputPrice: 15.0,
  },
  "claude-3-5-sonnet@20240620": {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 3.0,
    outputPrice: 15.0,
  },
  "claude-3-5-haiku@20241022": {
    maxTokens: 8192,
    contextWindow: 200_000,
    supportsImages: false,
    supportsPromptCache: false,
    inputPrice: 1.0,
    outputPrice: 5.0,
  },
  "claude-3-opus@20240229": {
    maxTokens: 4096,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 15.0,
    outputPrice: 75.0,
  },
  "claude-3-haiku@20240307": {
    maxTokens: 4096,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 0.25,
    outputPrice: 1.25,
  },
} as const

export const openAiModelInfoSaneDefaults: ModelInfo = {
  maxTokens: -1,
  contextWindow: 128_000,
  supportsImages: true,
  supportsPromptCache: false,
  inputPrice: 0,
  outputPrice: 0,
}

// Gemini
export type GeminiModelId = keyof typeof geminiModels
export const geminiDefaultModelId: GeminiModelId = "gemini-2.0-flash-001"
export const geminiModels = {
  "gemini-2.0-flash-001": {
    maxTokens: 8192,
    contextWindow: 1_048_576,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
  },
  "gemini-1.5-flash-002": {
    maxTokens: 8192,
    contextWindow: 1_048_576,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
  },
  "gemini-1.5-pro-002": {
    maxTokens: 8192,
    contextWindow: 2_097_152,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 0,
    outputPrice: 0,
  },
} as const

// OpenAI Native
export type OpenAiNativeModelId = keyof typeof openAiNativeModels
export const openAiNativeDefaultModelId: OpenAiNativeModelId = "gpt-4o"
export const openAiNativeModels = {
  "o3-mini": {
    maxTokens: 100_000,
    contextWindow: 200_000,
    supportsImages: false,
    supportsPromptCache: false,
    inputPrice: 1.1,
    outputPrice: 4.4,
  },
  o1: {
    maxTokens: 100_000,
    contextWindow: 200_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 15,
    outputPrice: 60,
  },
  "gpt-4o": {
    maxTokens: 4_096,
    contextWindow: 128_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 2.5,
    outputPrice: 10,
  },
  "gpt-4o-mini": {
    maxTokens: 16_384,
    contextWindow: 128_000,
    supportsImages: true,
    supportsPromptCache: false,
    inputPrice: 0.15,
    outputPrice: 0.6,
  },
} as const

// DeepSeek
export type DeepSeekModelId = keyof typeof deepSeekModels
export const deepSeekDefaultModelId: DeepSeekModelId = "deepseek-chat"
export const deepSeekModels = {
  "deepseek-chat": {
    maxTokens: 8_000,
    contextWindow: 64_000,
    supportsImages: false,
    supportsPromptCache: true,
    inputPrice: 0,
    outputPrice: 0.28,
    cacheWritesPrice: 0.14,
    cacheReadsPrice: 0.014,
  },
  "deepseek-reasoner": {
    maxTokens: 8_000,
    contextWindow: 64_000,
    supportsImages: false,
    supportsPromptCache: true,
    inputPrice: 0,
    outputPrice: 2.19,
    cacheWritesPrice: 0.55,
    cacheReadsPrice: 0.14,
  },
} as const

// Qwen
export type QwenModelId = keyof typeof qwenModels
export const qwenDefaultModelId: QwenModelId = "qwen-coder-plus-latest"
export const qwenModels = {
  "qwen2.5-coder-32b-instruct": {
    maxTokens: 8_192,
    contextWindow: 131_072,
    supportsImages: false,
    supportsPromptCache: false,
    inputPrice: 0.002,
    outputPrice: 0.006,
    cacheWritesPrice: 0.002,
    cacheReadsPrice: 0.006,
  },
  "qwen-coder-plus-latest": {
    maxTokens: 129_024,
    contextWindow: 131_072,
    supportsImages: false,
    supportsPromptCache: false,
    inputPrice: 3.5,
    outputPrice: 7,
    cacheWritesPrice: 3.5,
    cacheReadsPrice: 7,
  },
} as const

// Mistral
export type MistralModelId = keyof typeof mistralModels
export const mistralDefaultModelId: MistralModelId = "codestral-2501"
export const mistralModels = {
  "mistral-large-2411": {
    maxTokens: 131_000,
    contextWindow: 131_000,
    supportsImages: false,
    supportsPromptCache: false,
    inputPrice: 2.0,
    outputPrice: 6.0,
  },
  "codestral-2501": {
    maxTokens: 256_000,
    contextWindow: 256_000,
    supportsImages: false,
    supportsPromptCache: false,
    inputPrice: 0.3,
    outputPrice: 0.9,
  },
} as const

// LiteLLM
export type LiteLLMModelId = string
export const liteLlmDefaultModelId = "gpt-3.5-turbo"
export const liteLlmModelInfoSaneDefaults: ModelInfo = {
  maxTokens: -1,
  contextWindow: 128_000,
  supportsImages: true,
  supportsPromptCache: false,
  inputPrice: 0,
  outputPrice: 0,
}

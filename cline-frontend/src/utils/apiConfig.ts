/**
 * Mock implementation of the normalizeApiConfiguration function from the VSCode extension.
 * This is used by the TaskHeader component to get information about the selected model.
 */
export function normalizeApiConfiguration(apiConfiguration: any) {
	return {
		selectedModelInfo: {
			contextWindow: 100000,
			inputPrice: 0.0001,
			outputPrice: 0.0002,
		},
	}
}

/**
 * Mock of the WebviewMessage type from the VSCode extension.
 * This is used by the vscode.ts utility to provide a similar interface.
 */
export interface WebviewMessage {
	type: string
	text?: string
	[key: string]: any
}

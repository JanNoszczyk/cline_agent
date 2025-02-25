import { WebviewMessage } from "../types/WebviewMessage"

/**
 * A web-compatible version of the VSCode API wrapper.
 * This provides a similar interface to the VSCode API but works in a web browser.
 */
class VSCodeAPIWrapper {
	/**
	 * Post a message (i.e. send arbitrary data) to the owner of the webview.
	 * In a web context, this just logs to the console.
	 *
	 * @param message Arbitrary data to send
	 */
	public postMessage(message: WebviewMessage) {
		console.log("VSCode message (web mock):", message)

		// Handle specific message types that would normally be handled by VSCode
		if (message.type === "openMention" && typeof message.text === "string") {
			console.log(`Would open mention: @${message.text}`)
		} else if (message.type === "openImage" && typeof message.text === "string") {
			window.open(message.text, "_blank")
		} else if (message.type === "deleteTaskWithId" && typeof message.text === "string") {
			console.log(`Would delete task with ID: ${message.text}`)
		}
	}

	/**
	 * Get the persistent state stored for this webview.
	 * In a web context, this uses localStorage.
	 *
	 * @return The current state or `undefined` if no state has been set.
	 */
	public getState(): unknown | undefined {
		const state = localStorage.getItem("vscodeState")
		return state ? JSON.parse(state) : undefined
	}

	/**
	 * Set the persistent state stored for this webview.
	 * In a web context, this uses localStorage.
	 *
	 * @param newState New persisted state. This must be a JSON serializable object.
	 * @return The new state.
	 */
	public setState<T extends unknown | undefined>(newState: T): T {
		localStorage.setItem("vscodeState", JSON.stringify(newState))
		return newState
	}
}

// Export class singleton
export const vscode = new VSCodeAPIWrapper()

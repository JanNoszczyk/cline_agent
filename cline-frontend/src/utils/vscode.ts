import { WebviewMessage } from "../types/WebviewMessage"
import { apiClient } from "./apiClient"

/**
 * A web-compatible version of the VSCode API wrapper.
 * This provides a similar interface to the VSCode API but works in a web browser.
 */
class VSCodeAPIWrapper {
	/**
	 * Post a message (i.e. send arbitrary data) to the owner of the webview.
	 * In a web context, this forwards the message to the API server.
	 *
	 * @param message Arbitrary data to send
	 */
	public postMessage(message: WebviewMessage) {
		console.log("VSCode message (web mock):", message)

		// Forward the message to the API server
		apiClient.postMessage(message).catch(error => {
			console.error("Failed to post message to API server:", error)
		})

		// Handle specific message types that would normally be handled by VSCode
		if (message.type === "openMention" && typeof message.text === "string") {
			console.log(`Would open mention: @${message.text}`)
		} else if (message.type === "openImage" && typeof message.text === "string") {
			window.open(message.text, "_blank")
		} else if (message.type === "deleteTaskWithId" && typeof message.text === "string") {
			apiClient.deleteTask(message.text).catch(error => {
				console.error("Failed to delete task:", error)
			})
		} else if (message.type === "clearTask") {
			// Clear the task in the UI
			console.log("Clearing task")
		} else if (message.type === "cancelTask" && typeof message.text === "string") {
			apiClient.cancelTask(message.text).catch(error => {
				console.error("Failed to cancel task:", error)
			})
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

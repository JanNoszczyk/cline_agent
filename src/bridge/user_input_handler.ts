// This file is no longer needed as the logic has been moved into the Task class
// (src/core/task/index.ts) within the processNewUserInput method.

// import { Anthropic } from "@anthropic-ai/sdk"
// import pWaitFor from "p-wait-for"
// import { Task, UserContent } from "../core/task" // Assuming UserContent is exported from task/index.ts or moved elsewhere
// import { formatResponse } from "../core/prompts/responses"
// import { Logger } from "../services/logging/Logger"

// // Method to handle new user input and restart the processing loop
// export async function processNewUserInput(task: Task, newUserContent: UserContent) {
// 	if (task.abort) {
// 		// Task was aborted (e.g., by Controller or user action), don't restart loop
// 		Logger.log(`Task ${task.taskId}: processNewUserInput called, but task is aborted. Ignoring.`) // Assuming Logger is available
// 		return
// 	}
// 	// Check if task is still initializing
// 	if (!task.isInitialized) {
// 		Logger.log(`Task ${task.taskId}: processNewUserInput called, but task not initialized. Waiting.`)
// 		await pWaitFor(() => task.isInitialized === true, { timeout: 3000 }).catch(() => {
// 			Logger.log(`Task ${task.taskId}: Timeout waiting for task initialization in processNewUserInput.`)
// 			// Consider throwing or handling error if init fails
// 		})
// 	}

// 	Logger.log(`Task ${task.taskId}: processNewUserInput called. Restarting request loop.`)

// 	// It's generally safer to let the normal context management handle history trimming.
// 	// Explicitly popping here might interfere if the last message wasn't 'noToolsUsed'.
// 	// // Optional: Overwrite the last user message in API history if it was just the 'noToolsUsed' prompt
// 	// const lastApiMessage = task.apiConversationHistory.at(-1);
// 	// if (lastApiMessage?.role === 'user' && lastApiMessage.content.length === 1 && lastApiMessage.content[0].type === 'text') {
// 	//     const textContent = lastApiMessage.content[0].text;
// 	//     if (textContent === formatResponse.noToolsUsed()) {
// 	//         Logger.log(`Task ${task.taskId}: Removing last 'noToolsUsed' user message from API history.`);
// 	//         task.apiConversationHistory.pop();
// 	//         // Don't save yet, will be saved when new user message is added by recursivelyMakeClineRequests
// 	//     }
// 	// }

// 	// Start the loop again with the new user content
// 	// The loop should handle adding the newUserContent to the API history itself.
// 	try {
// 		Logger.log(`Task ${task.taskId}: Calling recursivelyMakeClineRequests with new user input.`)
// 		// Assuming recursivelyMakeClineRequests is public or accessible
// 		const didEndLoop = await task.recursivelyMakeClineRequests(newUserContent, false) // false = don't include file details again
// 		if (didEndLoop) {
// 			Logger.log(`Task ${task.taskId}: Loop ended after processing new user input.`)
// 			// Handle task completion if necessary (though currently loop doesn't end this way)
// 		}
// 	} catch (error) {
// 		// Log error, potentially show error in UI
// 		const errorMessage = error instanceof Error ? error.message : String(error)
// 		Logger.log(`Task ${task.taskId}: Error during recursivelyMakeClineRequests after new user input: ${errorMessage}`)
// 		// Assuming say is public or accessible
// 		await task.say("error", `Failed to process user message: ${errorMessage}`)
// 		// Consider if task should be fully cleared or state reset depending on the error
// 		// If the error was due to abort, it might already be handled within the Task class methods.
// 		// if (!task.abort) { ... } // Logic likely handled within recursivelyMakeClineRequests or say
// 	}
// }

// // Need to ensure UserContent is correctly typed and imported.
// // It might need exporting from `../core/task/index.ts` like:
// // export type UserContent = Array<Anthropic.ContentBlockParam | Anthropic.ImageBlockParam>;
// // Also ensure Task class is exported from `../core/task/index.ts`
// // export class Task { ... }

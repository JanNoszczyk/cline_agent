import type { OutputChannel, ExtensionContext } from "vscode"
import * as vscode from "vscode" // Required for ExtensionContext
import * as fs from "node:fs"
import * as path from "node:path"
import { ErrorService } from "../error/ErrorService"

/**
 * Simple logging utility for the extension's backend code.
 * Uses VS Code's OutputChannel and also streams to a file in globalStorageUri.
 * OutputChannel must be initialized from extension.ts.
 */
export class Logger {
	private static outputChannel: OutputChannel
	private static logFilePath: string

	private static writeToFile(fullMessage: string) {
		if (!Logger.logFilePath) {
			// Fallback to console if file path not set, though this shouldn't happen if initialized properly.
			console.log("[Logger/writeToFile-Error] Log file path not initialized. Message:", fullMessage)
			return
		}
		try {
			const timestamp = new Date().toISOString()
			fs.appendFileSync(Logger.logFilePath, `${timestamp} - ${fullMessage}\n`, "utf8")
		} catch (err) {
			// Log error to output channel itself if file writing fails
			const errorMessage = `ERROR: Failed to write to log file ${Logger.logFilePath}: ${err instanceof Error ? err.message : String(err)}`
			if (Logger.outputChannel) {
				Logger.outputChannel.appendLine(errorMessage)
			} else {
				console.error(errorMessage) // Fallback if output channel also fails
			}
		}
	}

	static initialize(outputChannel: OutputChannel, context: ExtensionContext) {
		Logger.outputChannel = outputChannel
		// Use a path that is mounted from the host via docker-compose.yml
		const logDir = "/app/logs" // This path is mounted from ./run_logs on the host
		try {
			if (!fs.existsSync(logDir)) {
				// This directory should ideally be created by the entrypoint or Dockerfile,
				// but create it here defensively if it's missing.
				fs.mkdirSync(logDir, { recursive: true })
			}
			Logger.logFilePath = path.join(logDir, "cline_extension.log")
			// Initial log to the file to confirm it's working
			Logger.writeToFile(`LOG: Logger initialized. Log file: ${Logger.logFilePath}`)
		} catch (err) {
			const initErrorMsg = `ERROR: Failed to initialize file logger: ${err instanceof Error ? err.message : String(err)}`
			Logger.outputChannel.appendLine(initErrorMsg) // Log error to output channel
			console.error(initErrorMsg) // Also to console as fallback
			// logFilePath will remain undefined, so writeToFile will fallback or log errors
		}
	}

	static error(message: string, exception?: Error) {
		const fullMessage = `ERROR: ${message}`
		Logger.outputChannel.appendLine(fullMessage)
		Logger.writeToFile(fullMessage)
		ErrorService.logMessage(message, "error")
		exception && ErrorService.logException(exception)
	}
	static warn(message: string) {
		const fullMessage = `WARN: ${message}`
		Logger.outputChannel.appendLine(fullMessage)
		Logger.writeToFile(fullMessage)
		ErrorService.logMessage(message, "warning")
	}
	static log(message: string) {
		const fullMessage = `LOG: ${message}`
		Logger.outputChannel.appendLine(fullMessage)
		Logger.writeToFile(fullMessage)
	}
	static debug(message: string) {
		const fullMessage = `DEBUG: ${message}`
		Logger.outputChannel.appendLine(fullMessage)
		Logger.writeToFile(fullMessage)
	}
	static info(message: string) {
		const fullMessage = `INFO: ${message}`
		Logger.outputChannel.appendLine(fullMessage)
		Logger.writeToFile(fullMessage)
	}
	static trace(message: string) {
		const fullMessage = `TRACE: ${message}`
		Logger.outputChannel.appendLine(fullMessage)
		Logger.writeToFile(fullMessage)
	}
}

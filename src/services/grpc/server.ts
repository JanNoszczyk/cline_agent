import * as grpc from "@grpc/grpc-js"
// Removed incorrect lookupService import
// Removed incorrect stream import: import *sl from 'node:stream';
import * as fs from "fs" // Added for file logging
import * as protoLoader from "@grpc/proto-loader"
import * as path from "path"
import * as vscode from "vscode"
import { Logger } from "../../services/logging/Logger" // Import Logger class
import util from "util" // Import util for inspect
// Removed GrpcRequest, GrpcResponse import as types.ts not found and types not used directly here
// import { GrpcRequest, GrpcResponse } from '../../shared/types';
import { EventEmitter } from "events"
import { setTimeout as setTimeoutPromise } from "node:timers/promises" // Import setTimeoutPromise
// Removed incorrect service implementation imports - these should be passed in or created differently
// import { TaskControlServiceImpl } from './mapper';
// import { BrowserServiceImpl } from './browser-mapper';
// import { CheckpointsServiceImpl } from './checkpoints-mapper';
// import { McpServiceImpl } from './mcp-mapper';
// Removed incorrect getProtoPath import
// Duplicate util import removed
import { Controller } from "../../core/controller" // Import Controller type

// --- Proto loading moved inside startExternalGrpcServer ---

export class GrpcNotifier extends EventEmitter {}

let server: grpc.Server | null = null
let grpcNotifier: GrpcNotifier | null = null
let grpcLogFilePath: string | null = null // Variable for log file path

// Helper function to append to log file
function appendToGrpcLogFile(message: string) {
	if (grpcLogFilePath) {
		try {
			const timestamp = new Date().toISOString()
			fs.appendFileSync(grpcLogFilePath, `${timestamp} - ${message}\n`, "utf8")
		} catch (e: any) {
			// Log error to console if file logging fails
			console.error(`[CONSOLE GRPC LOG FILE ERROR] Failed to write to ${grpcLogFilePath}: ${e.message}`)
		}
	}
}

export function getGrpcNotifier(): GrpcNotifier | null {
	return grpcNotifier
}

export function getGrpcServer(): grpc.Server | null {
	return server
}

// Define expected structure for service implementations (adjust as needed based on Controller)
interface ServiceImplementations {
	taskControl: grpc.UntypedServiceImplementation
	browser: grpc.UntypedServiceImplementation
	checkpoints: grpc.UntypedServiceImplementation
	mcp: grpc.UntypedServiceImplementation
}

export async function startExternalGrpcServer(
	context: vscode.ExtensionContext,
	controller: Controller, // Use imported Controller type
	// Assume implementations are provided, e.g., via the controller or a dedicated factory
	serviceImplementations: ServiceImplementations,
): Promise<{ server: grpc.Server; notifier: GrpcNotifier }> {
	// Initialize log file path
	if (!grpcLogFilePath) {
		// Initialize only once
		let logDir: string | null = null
		let logFilename = "grpc_server_debug.log"
		if (context.storageUri && context.storageUri.fsPath) {
			logDir = context.storageUri.fsPath
			console.log(`[CONSOLE External GRPC] Attempting to use context.storageUri.fsPath for logs: ${logDir}`)
			appendToGrpcLogFile(`[CONSOLE External GRPC] Attempting to use context.storageUri.fsPath for logs: ${logDir}`)
		} else {
			console.warn(
				"[CONSOLE External GRPC] context.storageUri.fsPath is not available or context.storageUri is null. Falling back to /tmp for logs.",
			)
			appendToGrpcLogFile(
				"[CONSOLE External GRPC] context.storageUri.fsPath is not available or context.storageUri is null. Falling back to /tmp for logs.",
			)
			logDir = "/tmp" // Fallback directory
		}

		try {
			if (!fs.existsSync(logDir)) {
				console.log(`[CONSOLE External GRPC] Log directory ${logDir} does not exist. Creating...`)
				appendToGrpcLogFile(`[CONSOLE External GRPC] Log directory ${logDir} does not exist. Creating...`)
				fs.mkdirSync(logDir, { recursive: true })
				console.log(`[CONSOLE External GRPC] Log directory ${logDir} created.`)
				appendToGrpcLogFile(`[CONSOLE External GRPC] Log directory ${logDir} created.`)
			}
			grpcLogFilePath = path.join(logDir, logFilename)
			const initMessage = `GRPC Server Log Initialized at ${new Date().toISOString()} (Log Path: ${grpcLogFilePath})\n`
			fs.writeFileSync(grpcLogFilePath, initMessage, "utf8")
			console.log(`[CONSOLE External GRPC] Logging to file: ${grpcLogFilePath}`)
			// appendToGrpcLogFile is called by log() below, no need to call it directly here for this message
		} catch (e: any) {
			console.error(
				`[CONSOLE External GRPC] Failed to initialize log file in ${logDir}: ${e.message}. File logging disabled.`,
			)
			// No appendToGrpcLogFile here as it might be the source of an error or grpcLogFilePath is null
			grpcLogFilePath = null // Disable file logging if setup fails
		}
	}

	const log = (message: string) => {
		console.log(message)
		appendToGrpcLogFile(message)
	}
	const logError = (message: string) => {
		console.error(message)
		appendToGrpcLogFile(`ERROR: ${message}`)
	}

	log("[CONSOLE External GRPC] Top of startExternalGrpcServer function.")
	if (server) {
		Logger.info("[External GRPC] Server already running.") // Use Logger.info
		log("[CONSOLE External GRPC] Server already running.")
		return { server, notifier: grpcNotifier! }
	}

	Logger.info("[External GRPC] Starting startExternalGrpcServer function...") // Use Logger.info
	log("[CONSOLE External GRPC] Starting startExternalGrpcServer function...")

	try {
		log("[CONSOLE External GRPC] Inside try block, before loading protos.")
		// --- Load Protos using context.extensionPath ---
		Logger.info("[External GRPC] Constructing proto paths using context.extensionPath...")
		log("[CONSOLE External GRPC] Constructing proto paths using context.extensionPath...")
		const protoDir = path.join(context.extensionPath, "proto") // Use extensionPath
		// --- Restore loading all protos ---
		const protoPaths = [
			path.join(protoDir, "task_control.proto"),
			path.join(protoDir, "browser.proto"),
			path.join(protoDir, "checkpoints.proto"),
			path.join(protoDir, "mcp.proto"),
			// Add other necessary proto file paths here
		]
		Logger.info(`[External GRPC] Proto directory resolved to: ${protoDir}`)
		log(`[CONSOLE External GRPC] Proto directory resolved to: ${protoDir}`)
		Logger.info(`[External GRPC] Loading protos from paths: ${protoPaths.join(", ")}`) // Restored log
		log(`[CONSOLE External GRPC] Loading protos from paths: ${protoPaths.join(", ")}`)

		const packageDefinition = protoLoader.loadSync(protoPaths, {
			// Load all protos again
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true,
			includeDirs: [protoDir], // Add includeDirs for potential imports within protos
		})

		const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any
		Logger.info("[External GRPC] Proto definitions loaded successfully.")
		log("[CONSOLE External GRPC] Proto definitions loaded successfully.")
		Logger.info(`[External GRPC] Top-level keys in protoDescriptor: ${Object.keys(protoDescriptor).join(", ")}`) // <-- ADDED LOG
		log(`[CONSOLE External GRPC] Top-level keys in protoDescriptor: ${Object.keys(protoDescriptor).join(", ")}`)

		// Extract service definitions (assuming 'cline' package)
		const clineProto = protoDescriptor.cline
		if (!clineProto) {
			// Log the descriptor structure if 'cline' is not found
			const errorMsg = `[External GRPC] Failed to load 'cline' package. Descriptor structure: ${util.inspect(protoDescriptor, { depth: 2 })}`
			Logger.error(errorMsg)
			logError(errorMsg)
			throw new Error("Failed to load 'cline' package from proto descriptor. Check proto package definitions.")
		} else {
			Logger.info(`[External GRPC] Keys within protoDescriptor.cline: ${Object.keys(clineProto).join(", ")}`)
			log(`[CONSOLE External GRPC] Keys within protoDescriptor.cline: ${Object.keys(clineProto).join(", ")}`)
		}
		// const taskControlProto = clineProto.task_control // Keep for reference, but try direct lookup below
		// Remove remaining sub-package extractions
		// const browserProto = clineProto.browser; // Will need adjustment if used
		// const checkpointsProto = clineProto.checkpoints;
		// const mcpProto = clineProto.mcp;
		// --- End Proto Loading ---

		server = new grpc.Server()
		grpcNotifier = new GrpcNotifier()
		Logger.info("[External GRPC] gRPC server instance and notifier created.") // Use Logger.info
		log("[CONSOLE External GRPC] gRPC server instance and notifier created.")

		// --- Browser Service ---
		const browserServiceFQN = "cline.BrowserService" // Keep for logging clarity
		const browserServiceDefinition = clineProto?.BrowserService?.service as grpc.ServiceDefinition<any> | undefined
		if (browserServiceDefinition && serviceImplementations.browser) {
			Logger.info(`[External GRPC] Registering ${browserServiceFQN} (found via nested access)...`)
			log(`[CONSOLE External GRPC] Registering ${browserServiceFQN} (found via nested access)...`)
			server.addService(browserServiceDefinition, serviceImplementations.browser)
			Logger.info(`[External GRPC] Registered ${browserServiceFQN}.`)
			log(`[CONSOLE External GRPC] Registered ${browserServiceFQN}.`)
		} else {
			const errorMsg = `[External GRPC] BrowserService definition ${!browserServiceDefinition ? `not found via nested property access ('${browserServiceFQN}')!` : "implementation not provided!"}`
			Logger.error(errorMsg)
			logError(errorMsg)
		}

		// --- Checkpoints Service ---
		const checkpointsServiceFQN = "cline.CheckpointsService" // Keep for logging clarity
		const checkpointsServiceDefinition = clineProto?.CheckpointsService?.service as grpc.ServiceDefinition<any> | undefined
		if (checkpointsServiceDefinition && serviceImplementations.checkpoints) {
			Logger.info(`[External GRPC] Registering ${checkpointsServiceFQN} (found via nested access)...`)
			log(`[CONSOLE External GRPC] Registering ${checkpointsServiceFQN} (found via nested access)...`)
			server.addService(checkpointsServiceDefinition, serviceImplementations.checkpoints)
			Logger.info(`[External GRPC] Registered ${checkpointsServiceFQN}.`)
			log(`[CONSOLE External GRPC] Registered ${checkpointsServiceFQN}.`)
		} else {
			const errorMsg = `[External GRPC] CheckpointsService definition ${!checkpointsServiceDefinition ? `not found via nested property access ('${checkpointsServiceFQN}')!` : "implementation not provided!"}`
			Logger.error(errorMsg)
			logError(errorMsg)
		}

		// --- MCP Service ---
		const mcpServiceFQN = "cline.McpService" // Keep for logging clarity
		const mcpServiceDefinition = clineProto?.McpService?.service as grpc.ServiceDefinition<any> | undefined
		if (mcpServiceDefinition && serviceImplementations.mcp) {
			Logger.info(`[External GRPC] Registering ${mcpServiceFQN} (found via nested access)...`)
			log(`[CONSOLE External GRPC] Registering ${mcpServiceFQN} (found via nested access)...`)
			server.addService(mcpServiceDefinition, serviceImplementations.mcp)
			Logger.info(`[External GRPC] Registered ${mcpServiceFQN}.`)
			log(`[CONSOLE External GRPC] Registered ${mcpServiceFQN}.`)
		} else {
			const errorMsg = `[External GRPC] McpService definition ${!mcpServiceDefinition ? `not found via nested property access ('${mcpServiceFQN}')!` : "implementation not provided!"}`
			Logger.error(errorMsg)
			logError(errorMsg)
		}

		// --- TaskControl Service ---
		// Revert to nested property access based on package structure
		const taskControlProto = clineProto?.task_control // Access nested package
		const taskControlServiceDefinition = taskControlProto?.TaskControlService?.service as
			| grpc.ServiceDefinition<any>
			| undefined // Access service definition

		if (taskControlServiceDefinition && serviceImplementations.taskControl) {
			Logger.info(
				`[External GRPC] TaskControlService Definition found via nested property access (cline.task_control.TaskControlService).`,
			) // Updated log
			// Add detailed logging
			Logger.info(
				`[External GRPC] TaskControlService Definition Object: ${util.inspect(taskControlServiceDefinition, { depth: 2 })}`,
			)
			log(
				`[CONSOLE External GRPC] TaskControlService Definition Object: ${util.inspect(taskControlServiceDefinition, { depth: 2 })}`,
			)
			Logger.info(
				`[External GRPC] TaskControlService Implementation Object Keys: ${Object.keys(serviceImplementations.taskControl).join(", ")}`,
			)
			log(
				`[CONSOLE External GRPC] TaskControlService Implementation Object Keys: ${Object.keys(serviceImplementations.taskControl).join(", ")}`,
			)

			Logger.info(
				// Use Logger.info
				`[External GRPC] Registration requested for TaskControlService (addService called).`, // Keep log simple
			)
			log(`[CONSOLE External GRPC] Registration requested for TaskControlService (addService called).`)
			try {
				// Add try-catch around addService
				server.addService(
					taskControlServiceDefinition, // Use the definition found via nested access
					serviceImplementations.taskControl, // Use provided implementation
				)
				Logger.info(`[External GRPC] server.addService(TaskControlService) completed without throwing immediate error.`) // Keep log simple
				log(`[CONSOLE External GRPC] server.addService(TaskControlService) completed without throwing immediate error.`)
			} catch (addServiceError: any) {
				const errorMsg = `[External GRPC] Error during server.addService(TaskControlService): ${addServiceError.message}`
				Logger.error(errorMsg)
				logError(errorMsg)
				// Optionally re-throw or handle differently
			}
		} else {
			const errorMsg = `[External GRPC] TaskControlService definition ${!taskControlServiceDefinition ? `not found via nested property access ('cline.task_control.TaskControlService')!` : "implementation not provided!"}`
			Logger.error(errorMsg)
			logError(errorMsg)
			// Logger.debug removed for verbosity
			// Logger.debug removed for verbosity
			// Logger.debug removed for verbosity
		}
		// Add log *after* the if/else
		Logger.info("[External GRPC] Finished attempting TaskControlService registration.") // NEW LOG
		log("[CONSOLE External GRPC] Finished attempting TaskControlService registration.")

		Logger.info("[External GRPC] Finished service registration.") // Use Logger.info
		log("[CONSOLE External GRPC] Finished service registration.")

		const port = 50051
		const host = "0.0.0.0"

		return new Promise((resolve, reject) => {
			Logger.info("[External GRPC] bindAsync initiated. Waiting for callback...") // Use Logger.info
			log("[CONSOLE External GRPC] bindAsync initiated. Waiting for callback...")
			server!.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), async (err, boundPort) => {
				// Added async here
				Logger.info("[External GRPC] bindAsync callback executed.") // Use Logger.info
				log("[CONSOLE External GRPC] bindAsync callback executed.")
				if (err) {
					const errorMsg = `[External GRPC] Server binding error: ${err.message}`
					Logger.error(errorMsg)
					logError(errorMsg)
					server = null // Reset server instance on error
					grpcNotifier = null
					return reject(err)
				}
				Logger.info(
					// Use Logger.info
					`[External GRPC] Server bound successfully to port ${boundPort}. Attempting to start server...`,
				)
				log(`[CONSOLE External GRPC] Server bound successfully to port ${boundPort}. Attempting to start server...`)
				try {
					server!.start()
					Logger.info(
						`[External GRPC] server.start() called synchronously. Server should be listening now on ${host}:${boundPort}.`,
					) // NEW LOG
					log(
						`[CONSOLE External GRPC] server.start() called synchronously. Server should be listening now on ${host}:${boundPort}.`,
					)
					Logger.info(
						// Use Logger.info
						`[External GRPC] Server reported as started after binding, listening on ${host}:${boundPort}. Adding 1s delay before resolving...`, // Slightly rephrased log
					)
					log(
						`[CONSOLE External GRPC] Server reported as started after binding, listening on ${host}:${boundPort}. Adding 1s delay before resolving...`,
					)
					// Add a longer delay (1000ms) before resolving
					await setTimeoutPromise(1000)
					Logger.info("[External GRPC] 1s Delay finished. Attempting self-connection test...")
					log("[CONSOLE External GRPC] 1s Delay finished. Attempting self-connection test...")

					// Self-connection test
					const net = await import("net")
					const client = new net.Socket()
					let connected = false
					let connectionError = ""

					client.connect(port, "127.0.0.1", () => {
						Logger.info(`[External GRPC] Self-connection to 127.0.0.1:${port} SUCCEEDED.`)
						log(`[CONSOLE External GRPC] Self-connection to 127.0.0.1:${port} SUCCEEDED.`)
						connected = true
						client.end()
					})

					client.on("error", (err) => {
						const errorMsg = `[External GRPC] Self-connection to 127.0.0.1:${port} FAILED: ${err.message}`
						Logger.error(errorMsg)
						logError(errorMsg)
						connectionError = err.message
						client.destroy() // Ensure socket is destroyed on error
					})

					// Wait for connection attempt to resolve or timeout
					await new Promise((r) => {
						const timeoutId = setTimeout(() => {
							if (!connected && !connectionError) {
								const errorMsg = `[External GRPC] Self-connection to 127.0.0.1:${port} TIMED OUT after 2s.`
								Logger.error(errorMsg)
								logError(errorMsg)
								connectionError = "timeout"
							}
							client.destroy() // Ensure cleanup
							r(undefined)
						}, 2000) // 2-second timeout for self-connection

						client.on("close", () => {
							clearTimeout(timeoutId)
							r(undefined)
						})
					})

					if (connected) {
						Logger.info("[External GRPC] Self-connection test passed. Resolving startExternalGrpcServer promise.")
						log("[CONSOLE External GRPC] Self-connection test passed. Resolving startExternalGrpcServer promise.")
						resolve({ server: server!, notifier: grpcNotifier! })
					} else {
						const errorMsg = `[External GRPC] Self-connection test FAILED. Error: ${connectionError || "Unknown"}. Rejecting startExternalGrpcServer promise.`
						Logger.error(errorMsg)
						logError(errorMsg)
						// Optionally try to shutdown the server more gracefully here if needed
						server?.tryShutdown(() => {})
						server = null
						grpcNotifier = null
						reject(new Error(`Self-connection test failed: ${connectionError || "Unknown"}`))
					}
				} catch (startErr: any) {
					const errorMsg = `[External GRPC] Server start error after binding: ${startErr.message}`
					Logger.error(errorMsg)
					logError(errorMsg)
					server = null // Reset server instance on error
					grpcNotifier = null
					reject(startErr)
				}
			})
		})
	} catch (error: any) {
		const errorMsg = `[External GRPC] Error during server setup: ${error.message}`
		Logger.error(errorMsg)
		logError(errorMsg)
		if (server) {
			// Attempt graceful shutdown if server instance exists
			server.tryShutdown(() => {
				Logger.info("[External GRPC] Server shut down after setup error.") // Use Logger.info
				log("[CONSOLE External GRPC] Server shut down after setup error.")
			})
		}
		server = null
		grpcNotifier = null
		throw error // Re-throw the error to indicate failure
	}
}

export function stopExternalGrpcServer(): Promise<void> {
	const log = (message: string) => {
		// Local log function for stop server
		console.log(message)
		appendToGrpcLogFile(message)
	}
	log("[CONSOLE External GRPC] stopExternalGrpcServer called.")
	return new Promise((resolve) => {
		if (server) {
			Logger.info("[External GRPC] Shutting down gRPC server...") // Use Logger.info
			log("[CONSOLE External GRPC] Shutting down gRPC server...")
			server.tryShutdown(() => {
				Logger.info("[External GRPC] gRPC server shut down.") // Use Logger.info
				log("[CONSOLE External GRPC] gRPC server shut down.")
				server = null
				grpcNotifier = null
				resolve()
			})
		} else {
			Logger.info("[External GRPC] Server not running, no need to shut down.") // Use Logger.info
			log("[CONSOLE External GRPC] Server not running, no need to shut down.")
			resolve()
		}
	})
}

// Example of how the notifier might be used (implementation details depend on your controller)
// grpcNotifier?.emit('someEvent', { data: 'example' });

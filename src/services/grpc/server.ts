import * as grpc from "@grpc/grpc-js"
// Removed incorrect lookupService import
// Removed incorrect stream import: import *sl from 'node:stream';
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
	if (server) {
		Logger.info("[External GRPC] Server already running.") // Use Logger.info
		return { server, notifier: grpcNotifier! }
	}

	Logger.info("[External GRPC] Starting startExternalGrpcServer function...") // Use Logger.info

	try {
		// --- Load Protos using context.extensionPath ---
		Logger.info("[External GRPC] Constructing proto paths using context.extensionPath...")
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
		Logger.info(`[External GRPC] Loading protos from paths: ${protoPaths.join(", ")}`) // Restored log

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
		Logger.info(`[External GRPC] Top-level keys in protoDescriptor: ${Object.keys(protoDescriptor).join(", ")}`) // <-- ADDED LOG

		// Extract service definitions (assuming 'cline' package)
		const clineProto = protoDescriptor.cline
		if (!clineProto) {
			// Log the descriptor structure if 'cline' is not found
			Logger.error(
				`[External GRPC] Failed to load 'cline' package. Descriptor structure: ${util.inspect(protoDescriptor, { depth: 2 })}`,
			)
			throw new Error("Failed to load 'cline' package from proto descriptor. Check proto package definitions.")
		} else {
			Logger.info(`[External GRPC] Keys within protoDescriptor.cline: ${Object.keys(clineProto).join(", ")}`)
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

		// --- Browser Service ---
		// Revert to direct property access
		const browserServiceFQN = "cline.BrowserService"
		const browserServiceDefinition = protoDescriptor[browserServiceFQN] as grpc.ServiceDefinition<any> | undefined
		if (browserServiceDefinition && serviceImplementations.browser) {
			Logger.info(`[External GRPC] Registering ${browserServiceFQN}...`)
			server.addService(browserServiceDefinition, serviceImplementations.browser)
			Logger.info(`[External GRPC] Registered ${browserServiceFQN}.`)
		} else {
			Logger.error(
				`[External GRPC] BrowserService definition ${!browserServiceDefinition ? `not found via FQN lookup ('${browserServiceFQN}')!` : "implementation not provided!"}`,
			)
		}

		// --- Checkpoints Service ---
		// Revert to direct property access
		const checkpointsServiceFQN = "cline.CheckpointsService"
		const checkpointsServiceDefinition = protoDescriptor[checkpointsServiceFQN] as grpc.ServiceDefinition<any> | undefined
		if (checkpointsServiceDefinition && serviceImplementations.checkpoints) {
			Logger.info(`[External GRPC] Registering ${checkpointsServiceFQN}...`)
			server.addService(checkpointsServiceDefinition, serviceImplementations.checkpoints)
			Logger.info(`[External GRPC] Registered ${checkpointsServiceFQN}.`)
		} else {
			Logger.error(
				`[External GRPC] CheckpointsService definition ${!checkpointsServiceDefinition ? `not found via FQN lookup ('${checkpointsServiceFQN}')!` : "implementation not provided!"}`,
			)
		}

		// --- MCP Service ---
		// Revert to direct property access
		const mcpServiceFQN = "cline.McpService"
		const mcpServiceDefinition = protoDescriptor[mcpServiceFQN] as grpc.ServiceDefinition<any> | undefined
		if (mcpServiceDefinition && serviceImplementations.mcp) {
			Logger.info(`[External GRPC] Registering ${mcpServiceFQN}...`)
			server.addService(mcpServiceDefinition, serviceImplementations.mcp)
			Logger.info(`[External GRPC] Registered ${mcpServiceFQN}.`)
		} else {
			Logger.error(
				`[External GRPC] McpService definition ${!mcpServiceDefinition ? `not found via FQN lookup ('${mcpServiceFQN}')!` : "implementation not provided!"}`,
			)
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
			Logger.info(
				`[External GRPC] TaskControlService Implementation Object Keys: ${Object.keys(serviceImplementations.taskControl).join(", ")}`,
			)

			Logger.info(
				// Use Logger.info
				`[External GRPC] Registration requested for TaskControlService (addService called).`, // Keep log simple
			)
			try {
				// Add try-catch around addService
				server.addService(
					taskControlServiceDefinition, // Use the definition found via nested access
					serviceImplementations.taskControl, // Use provided implementation
				)
				Logger.info(`[External GRPC] server.addService(TaskControlService) completed without throwing immediate error.`) // Keep log simple
			} catch (addServiceError: any) {
				Logger.error(`[External GRPC] Error during server.addService(TaskControlService): ${addServiceError.message}`) // Keep log simple
				// Optionally re-throw or handle differently
			}
		} else {
			Logger.error(
				// Use Logger.error
				`[External GRPC] TaskControlService definition ${!taskControlServiceDefinition ? `not found via nested property access ('cline.task_control.TaskControlService')!` : "implementation not provided!"}`, // Updated log
			)
			// Logger.debug removed for verbosity
			// Logger.debug removed for verbosity
			// Logger.debug removed for verbosity
		}
		// Add log *after* the if/else
		Logger.info("[External GRPC] Finished attempting TaskControlService registration.") // NEW LOG

		Logger.info("[External GRPC] Finished service registration.") // Use Logger.info

		const port = 50051
		const host = "0.0.0.0"

		return new Promise((resolve, reject) => {
			Logger.info("[External GRPC] bindAsync initiated. Waiting for callback...") // Use Logger.info
			server!.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), async (err, boundPort) => {
				// Added async here
				Logger.info("[External GRPC] bindAsync callback executed.") // Use Logger.info
				if (err) {
					Logger.error(`[External GRPC] Server binding error: ${err.message}`) // Use Logger.error
					server = null // Reset server instance on error
					grpcNotifier = null
					return reject(err)
				}
				Logger.info(
					// Use Logger.info
					`[External GRPC] Server bound successfully to port ${boundPort}. Attempting to start server...`,
				)
				try {
					server!.start()
					Logger.info(
						// Use Logger.info
						`[External GRPC] Server started successfully after binding, listening on ${host}:${boundPort}. Adding 1s delay before resolving...`, // Updated log
					)
					// Add a longer delay (1000ms) before resolving
					await setTimeoutPromise(1000)
					Logger.info("[External GRPC] 1s Delay finished, resolving startExternalGrpcServer promise.")
					resolve({ server: server!, notifier: grpcNotifier! })
				} catch (startErr: any) {
					Logger.error(
						// Use Logger.error
						`[External GRPC] Server start error after binding: ${startErr.message}`,
					)
					server = null // Reset server instance on error
					grpcNotifier = null
					reject(startErr)
				}
			})
		})
	} catch (error: any) {
		Logger.error(`[External GRPC] Error during server setup: ${error.message}`) // Use Logger.error
		if (server) {
			// Attempt graceful shutdown if server instance exists
			server.tryShutdown(() => {
				Logger.info("[External GRPC] Server shut down after setup error.") // Use Logger.info
			})
		}
		server = null
		grpcNotifier = null
		throw error // Re-throw the error to indicate failure
	}
}

export function stopExternalGrpcServer(): Promise<void> {
	return new Promise((resolve) => {
		if (server) {
			Logger.info("[External GRPC] Shutting down gRPC server...") // Use Logger.info
			server.tryShutdown(() => {
				Logger.info("[External GRPC] gRPC server shut down.") // Use Logger.info
				server = null
				grpcNotifier = null
				resolve()
			})
		} else {
			Logger.info("[External GRPC] Server not running, no need to shut down.") // Use Logger.info
			resolve()
		}
	})
}

// Example of how the notifier might be used (implementation details depend on your controller)
// grpcNotifier?.emit('someEvent', { data: 'example' });

import * as grpc from "@grpc/grpc-js"
// Removed incorrect stream import: import *sl from 'node:stream';
import * as protoLoader from "@grpc/proto-loader"
import * as path from "path"
import * as vscode from "vscode"
import { Logger } from "../../services/logging/Logger" // Import Logger class
// Removed GrpcRequest, GrpcResponse import as types.ts not found and types not used directly here
// import { GrpcRequest, GrpcResponse } from '../../shared/types';
import { EventEmitter } from "events"
// Removed incorrect service implementation imports - these should be passed in or created differently
// import { TaskControlServiceImpl } from './mapper';
// import { BrowserServiceImpl } from './browser-mapper';
// import { CheckpointsServiceImpl } from './checkpoints-mapper';
// import { McpServiceImpl } from './mcp-mapper';
// Removed incorrect getProtoPath import
import util from "util" // Import util for inspect
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
		const protoPaths = [
			path.join(protoDir, "task_control.proto"),
			path.join(protoDir, "browser.proto"),
			path.join(protoDir, "checkpoints.proto"),
			path.join(protoDir, "mcp.proto"),
			// Add other necessary proto file paths here
		]
		Logger.info(`[External GRPC] Proto directory resolved to: ${protoDir}`)
		Logger.info(`[External GRPC] Loading protos from paths: ${protoPaths.join(", ")}`)

		const packageDefinition = protoLoader.loadSync(protoPaths, {
			keepCase: true,
			longs: String,
			enums: String,
			defaults: true,
			oneofs: true,
			includeDirs: [protoDir], // Add includeDirs for potential imports within protos
		})

		const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any
		Logger.info("[External GRPC] Proto definitions loaded successfully.")

		// Extract service definitions (assuming 'cline' package)
		const clineProto = protoDescriptor.cline
		if (!clineProto) {
			throw new Error("Failed to load 'cline' package from proto descriptor. Check proto package definitions.")
		}
		const taskControlProto = clineProto.task_control
		// Remove remaining sub-package extractions
		// const browserProto = clineProto.browser;
		// const checkpointsProto = clineProto.checkpoints;
		// const mcpProto = clineProto.mcp;
		// --- End Proto Loading ---

		server = new grpc.Server()
		grpcNotifier = new GrpcNotifier()
		Logger.info("[External GRPC] gRPC server instance and notifier created.") // Use Logger.info

		// --- Browser Service ---
		// Access directly under clineProto as confirmed by browser.proto
		if (clineProto?.BrowserService?.service && serviceImplementations.browser) {
			Logger.info("[External GRPC] Registering BrowserService...") // Use Logger.info
			server.addService(clineProto.BrowserService.service, serviceImplementations.browser) // Use provided implementation
			Logger.info("[External GRPC] Registered BrowserService.") // Use Logger.info
		} else {
			Logger.error(
				// Use Logger.error
				`[External GRPC] BrowserService definition ${!clineProto?.BrowserService?.service ? "not found in proto!" : "implementation not provided!"}`,
			)
		}

		// --- Checkpoints Service ---
		// Access directly under clineProto
		if (clineProto?.CheckpointsService?.service && serviceImplementations.checkpoints) {
			Logger.info("[External GRPC] Registering CheckpointsService...") // Use Logger.info
			server.addService(clineProto.CheckpointsService.service, serviceImplementations.checkpoints) // Use provided implementation
			Logger.info("[External GRPC] Registered CheckpointsService.") // Use Logger.info
		} else {
			Logger.error(
				// Use Logger.error
				`[External GRPC] CheckpointsService definition ${!clineProto?.CheckpointsService?.service ? "not found in proto!" : "implementation not provided!"}`,
			)
		}

		// --- MCP Service ---
		// Access directly under clineProto
		if (clineProto?.McpService?.service && serviceImplementations.mcp) {
			Logger.info("[External GRPC] Registering McpService...") // Use Logger.info
			server.addService(clineProto.McpService.service, serviceImplementations.mcp) // Use provided implementation
			Logger.info("[External GRPC] Registered McpService.") // Use Logger.info
		} else {
			Logger.error(
				// Use Logger.error
				`[External GRPC] McpService definition ${!clineProto?.McpService?.service ? "not found in proto!" : "implementation not provided!"}`,
			)
		}

		// --- TaskControl Service ---
		if (taskControlProto?.TaskControlService?.service && serviceImplementations.taskControl) {
			Logger.info("[External GRPC] TaskControlService Definition found.") // Use Logger.info
			// const taskControlServiceImpl = TaskControlServiceImpl(controller, grpcNotifier); // Removed

			// Logger.debug removed for verbosity
			// Logger.debug removed for verbosity

			Logger.info(
				// Use Logger.info
				"[External GRPC] Registration requested for TaskControlService (addService called).",
			)
			server.addService(
				taskControlProto.TaskControlService.service,
				serviceImplementations.taskControl, // Use provided implementation
			)
		} else {
			Logger.error(
				// Use Logger.error
				`[External GRPC] TaskControlService definition ${!taskControlProto?.TaskControlService?.service ? "not found in proto descriptor!" : "implementation not provided!"}`,
			)
			// Logger.debug removed for verbosity
			// Logger.debug removed for verbosity
			// Logger.debug removed for verbosity
		}

		Logger.info("[External GRPC] Finished service registration.") // Use Logger.info

		const port = 50051
		const host = "0.0.0.0"

		return new Promise((resolve, reject) => {
			Logger.info("[External GRPC] bindAsync initiated. Waiting for callback...") // Use Logger.info
			server!.bindAsync(`${host}:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
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
						`[External GRPC] Server started successfully after binding, listening on ${host}:${boundPort}`,
					)
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

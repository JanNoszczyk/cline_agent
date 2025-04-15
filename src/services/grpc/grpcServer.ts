import * as grpc from "@grpc/grpc-js"
import * as protoLoader from "@grpc/proto-loader"
import path from "path"
import { Controller } from "../../core/controller" // Adjust path as necessary
import { Logger } from "../logging/Logger" // Corrected path to Logger.ts
import { ClineControllerHandler } from "./handler"
// Removed problematic import for generated service type
// import { ClineControllerService } from './generated/cline_control_grpc_pb';
// We will rely on the loaded definition at runtime

const PROTO_PATH = path.join(__dirname, "./cline_control.proto")
const GRPC_DEFAULT_PORT = 50051 // Consider making this configurable

// Load the package definition
const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
	keepCase: true,
	longs: String,
	enums: String,
	defaults: true,
	oneofs: true,
	includeDirs: [path.join(__dirname, "../../../node_modules/google-proto-files")], // Ensure google types are found
})
// Load the gRPC object (contains service definitions)
const protoDescriptor = grpc.loadPackageDefinition(packageDefinition)
// Access the specific package and service
const clineControlPackage = protoDescriptor.clinecontrol as any // Cast needed as structure isn't strongly typed here

let serverInstance: grpc.Server | null = null

/**
 * Starts the gRPC server.
 * @param controller - The core Controller instance.
 * @param port - The port number to bind the server to.
 */
export function startGrpcServer(controller: Controller, port: number = GRPC_DEFAULT_PORT): grpc.Server {
	if (serverInstance) {
		Logger.warn("gRPC server already running.")
		return serverInstance
	}

	const server = new grpc.Server()

	// Use the loaded service definition
	if (!clineControlPackage?.ClineController?.service) {
		const errorMsg = "Failed to load gRPC service definition for ClineController from protoDescriptor."
		Logger.error(errorMsg)
		throw new Error(errorMsg)
	}
	// The first argument to addService should be the service definition from the loaded object
	// The second argument is the implementation (our handler)
	// Cast handler to 'any' temporarily to bypass type checking until handler implements the service interface
	server.addService(clineControlPackage.ClineController.service, new ClineControllerHandler(controller) as any)

	server.bindAsync(`0.0.0.0:${port}`, grpc.ServerCredentials.createInsecure(), (err, boundPort) => {
		if (err) {
			Logger.error(`Error starting gRPC server: ${err.message}`)
			serverInstance = null // Ensure instance is null on failure
			// Optionally re-throw or handle more gracefully
			return
		}
		Logger.info(`gRPC server listening on port ${boundPort}`)
		server.start()
	})

	serverInstance = server
	return server
}

/**
 * Stops the gRPC server gracefully.
 * @param callback - Optional callback to run after shutdown.
 */
export function stopGrpcServer(callback?: () => void): void {
	if (!serverInstance) {
		Logger.warn("gRPC server is not running.")
		callback?.()
		return
	}

	Logger.info("Attempting to shut down gRPC server...")
	serverInstance.tryShutdown((err) => {
		if (err) {
			Logger.error(`Error shutting down gRPC server: ${err.message}`)
		} else {
			Logger.info("gRPC server shut down successfully.")
		}
		serverInstance = null
		callback?.()
	})
}

// Optional: Helper to get the current server instance if needed elsewhere
export function getGrpcServerInstance(): grpc.Server | null {
	return serverInstance
}

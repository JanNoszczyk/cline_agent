#!/usr/bin/env node

import * as fs from "fs/promises"
import * as path from "path"
import { fileURLToPath } from "url"
import { execSync } from "child_process"
import { globby } from "globby"
import chalk from "chalk"

import { createRequire } from "module"
const require = createRequire(import.meta.url)
const protoc = path.join(require.resolve("grpc-tools"), "../bin/protoc")

const __filename = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(__filename)
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..")

const isWindows = process.platform === "win32"
const tsProtoPlugin = isWindows
	? path.join(ROOT_DIR, "node_modules", ".bin", "protoc-gen-ts_proto.cmd") // Use the .bin directory path for Windows
	: require.resolve("ts-proto/protoc-gen-ts_proto")

// List of gRPC services
// To add a new service, simply add it to this map and run this script
// The service handler will be automatically discovered and used by grpc-handler.ts
const serviceNameMap = {
	account: "cline.AccountService",
	browser: "cline.BrowserService",
	checkpoints: "cline.CheckpointsService",
	file: "cline.FileService",
	mcp: "cline.McpService",
	state: "cline.StateService",
	task: "cline.TaskService",
	web: "cline.WebService",
	models: "cline.ModelsService",
	slash: "cline.SlashService",
	ui: "cline.UiService",
	// Add new services here - no other code changes needed!
}
const serviceDirs = Object.keys(serviceNameMap).map((serviceKey) => path.join(ROOT_DIR, "src", "core", "controller", serviceKey))

async function main() {
	console.log(chalk.bold.blue("Starting Protocol Buffer code generation..."))

	// Define output directories
	const TS_OUT_DIR_HOST_GRPC_JS = path.join(ROOT_DIR, "src", "shared", "proto") // For grpc-js backend
	const TS_OUT_DIR_HOST_GENERIC_DEF = path.join(ROOT_DIR, "src", "shared", "proto_generic_def") // For generic-definitions (webview client helper)
	const TS_OUT_DIR_WEBVIEW = path.join(ROOT_DIR, "src", "shared", "proto_webview_types")
	const GO_OUT_DIR = path.join(ROOT_DIR, "sandbox-client") // Output Go files directly into sandbox-client, protoc will create genproto automatically based on paths

	// Create output directories if they don't exist
	await fs.mkdir(TS_OUT_DIR_HOST_GRPC_JS, { recursive: true })
	await fs.mkdir(TS_OUT_DIR_HOST_GENERIC_DEF, { recursive: true })
	await fs.mkdir(TS_OUT_DIR_WEBVIEW, { recursive: true })
	await fs.mkdir(GO_OUT_DIR, { recursive: true }) // Ensure sandbox-client exists

	// Clean up existing generated files
	console.log(chalk.cyan("Cleaning up existing generated TypeScript files (host grpc-js)..."))
	const existingHostGrpcJsTsFiles = await globby("**/*.ts", { cwd: TS_OUT_DIR_HOST_GRPC_JS })
	for (const file of existingHostGrpcJsTsFiles) {
		await fs.unlink(path.join(TS_OUT_DIR_HOST_GRPC_JS, file))
	}

	console.log(chalk.cyan("Cleaning up existing generated TypeScript files (host generic-def)..."))
	const existingHostGenericDefTsFiles = await globby("**/*.ts", { cwd: TS_OUT_DIR_HOST_GENERIC_DEF })
	for (const file of existingHostGenericDefTsFiles) {
		await fs.unlink(path.join(TS_OUT_DIR_HOST_GENERIC_DEF, file))
	}

	console.log(chalk.cyan("Cleaning up existing generated TypeScript files (webview)..."))
	const existingWebviewTsFiles = await globby("**/*.ts", { cwd: TS_OUT_DIR_WEBVIEW })
	for (const file of existingWebviewTsFiles) {
		await fs.unlink(path.join(TS_OUT_DIR_WEBVIEW, file))
	}

	// Clean up existing generated Go files (within sandbox-client/genproto)
	console.log(chalk.cyan("Cleaning up existing generated Go files..."))
	const goGenProtoDir = path.join(GO_OUT_DIR, "genproto")
	try {
		await fs.rm(goGenProtoDir, { recursive: true, force: true })
		console.log(chalk.cyan(`Removed directory: ${goGenProtoDir}`))
	} catch (error) {
		console.warn(chalk.yellow(`Could not remove ${goGenProtoDir} (might not exist): ${error.message}`))
	}

	// Process all proto files
	console.log(chalk.cyan("Processing proto files from"), SCRIPT_DIR)
	const protoFiles = await globby("*.proto", { cwd: SCRIPT_DIR, realpath: true })

	// REMOVED initial tsProtocCommand block as generation is now per-file in the loop

	const descriptorOutDir = path.join(ROOT_DIR, "dist-standalone", "proto")
	await fs.mkdir(descriptorOutDir, { recursive: true })

	const descriptorFile = path.join(descriptorOutDir, "descriptor_set.pb")
	const descriptorProtocCommand = [
		protoc,
		`--proto_path="${SCRIPT_DIR}"`,
		`--descriptor_set_out="${descriptorFile}"`,
		"--include_imports",
		...protoFiles,
	].join(" ")
	try {
		console.log(chalk.cyan("Generating descriptor set..."))
		execSync(descriptorProtocCommand, { stdio: "inherit" })
	} catch (error) {
		console.error(chalk.red("Error generating descriptor set for proto file:"), error)
		process.exit(1)
	}
	// protoFiles is already defined above
	const execOptions = { stdio: "inherit" }

	for (const protoFile of protoFiles) {
		// Generate Host Types (grpc-js for backend)
		console.log(chalk.cyan(`Generating TypeScript code (host grpc-js) for ${protoFile}...`))
		const protocCommandHostGrpcJs = [
			protoc,
			`--plugin=protoc-gen-ts_proto="${tsProtoPlugin}"`,
			`--ts_proto_out="${TS_OUT_DIR_HOST_GRPC_JS}"`,
			"--ts_proto_opt=outputServices=grpc-js,env=node,esModuleInterop=true,useDate=false,useOptionals=messages,useAbortSignal=true,bytes=buffer", // For backend server
			`--proto_path="${SCRIPT_DIR}"`,
			`"${path.join(SCRIPT_DIR, protoFile)}"`, // Ensure protoFile is correctly joined with SCRIPT_DIR
		].join(" ")

		try {
			execSync(protocCommandHostGrpcJs, execOptions)
		} catch (error) {
			console.error(chalk.red(`Error generating TypeScript (host grpc-js) for ${protoFile}:`), error)
			process.exit(1)
		}

		// POST-PROCESSING STEP TO FIX DESERIALIZERS in grpc-js outputs
		const generatedHostGrpcJsFilePath = path.join(TS_OUT_DIR_HOST_GRPC_JS, path.basename(protoFile).replace(".proto", ".ts"))
		try {
			let fileContent = await fs.readFile(generatedHostGrpcJsFilePath, "utf8")
			const requestDeserializeRegex = /requestDeserialize:\s*\(value:\s*Buffer\)\s*=>\s*([a-zA-Z0-9_.]+)\.decode\(value\)/g
			const responseDeserializeRegex =
				/responseDeserialize:\s*\(value:\s*Buffer\)\s*=>\s*([a-zA-Z0-9_.]+)\.decode\(value\)/g

			let contentModified = false
			fileContent = fileContent.replace(requestDeserializeRegex, (match, messageType) => {
				contentModified = true
				return `requestDeserialize: (value: Buffer) => ${messageType}.decode(new Uint8Array(value.buffer, value.byteOffset, value.length))`
			})
			fileContent = fileContent.replace(responseDeserializeRegex, (match, messageType) => {
				contentModified = true
				return `responseDeserialize: (value: Buffer) => ${messageType}.decode(new Uint8Array(value.buffer, value.byteOffset, value.length))`
			})

			if (contentModified) {
				await fs.writeFile(generatedHostGrpcJsFilePath, fileContent, "utf8")
				console.log(chalk.yellow(`Applied Buffer to Uint8Array fix in deserializers for ${generatedHostGrpcJsFilePath}`))
			}
		} catch (error) {
			console.error(chalk.red(`Error post-processing ${generatedHostGrpcJsFilePath} for Buffer fix:`), error)
			// Consider if this should be a fatal error, for now, it logs and continues
		}

		// Generate Host Types (generic-definitions for webview client helper)
		console.log(chalk.cyan(`Generating TypeScript code (host generic-def) for ${protoFile}...`))
		const protocCommandHostGenericDef = [
			protoc,
			`--plugin=protoc-gen-ts_proto="${tsProtoPlugin}"`,
			`--ts_proto_out="${TS_OUT_DIR_HOST_GENERIC_DEF}"`,
			"--ts_proto_opt=outputServices=generic-definitions,env=browser,esModuleInterop=true,useDate=false,useOptionals=messages,useAbortSignal=true,bytes=uint8array", // For webview client helper
			`--proto_path="${SCRIPT_DIR}"`,
			`"${path.join(SCRIPT_DIR, protoFile)}"`, // Ensure protoFile is correctly joined with SCRIPT_DIR
		].join(" ")

		try {
			execSync(protocCommandHostGenericDef, execOptions)
		} catch (error) {
			console.error(chalk.red(`Error generating TypeScript (host generic-def) for ${protoFile}:`), error)
			process.exit(1)
		}

		console.log(chalk.cyan(`Generating TypeScript code (webview_types) for ${protoFile}...`))
		const webviewTsProtoOpts = [
			"outputServices=false",
			"outputClientImpl=false",
			"env=browser",
			"esModuleInterop=false", // Changed
			"useDate=false",
			"useOptionals=messages",
			// "useAbortSignal=true", // Typically for client stubs, may not be needed for types only
			"forceLong=string",
			"outputJsonMethods=false", // Already false, keep
			"outputPartialMethods=false", // Already false, keep
			"outputTypeAnnotations=true", // Already true, keep
			"outputIndex=false", // Already false, keep
			"initializeFieldsAsUndefined=true", // New: leaner constructors
			"exportCommonSymbols=false", // New: reduce re-exports
			"unknownFields=false", // New: strip unknown field handling
			"usePrototypeForDefaults=true", // New: potentially leaner/more tree-shakable
		].join(",")

		const protocCommandWebview = [
			protoc,
			`--plugin=protoc-gen-ts_proto="${tsProtoPlugin}"`,
			`--ts_proto_out="${TS_OUT_DIR_WEBVIEW}"`,
			`--ts_proto_opt=${webviewTsProtoOpts}`,
			`--proto_path="${SCRIPT_DIR}"`,
			`"${path.join(SCRIPT_DIR, protoFile)}"`,
		].join(" ")

		try {
			execSync(protocCommandWebview, execOptions)
		} catch (error) {
			console.error(chalk.red(`Error generating TypeScript (webview_types) for ${protoFile}:`), error)
			process.exit(1)
		}

		// --- Generate Go ---
		console.log(chalk.cyan(`  -> Generating Go for ${protoFile}...`))
		const goProtoCommand = [
			protoc,
			`--proto_path="${SCRIPT_DIR}"`,
			`--go_out="${GO_OUT_DIR}"`,
			`--go_opt=module=sandboxclient`,
			`--go-grpc_out="${GO_OUT_DIR}"`,
			`--go-grpc_opt=module=sandboxclient`,
			`"${path.join(SCRIPT_DIR, protoFile)}"`,
		].join(" ")

		try {
			execSync(goProtoCommand, execOptions)
		} catch (error) {
			console.error(chalk.red(`Error generating Go for ${protoFile}:`), error.message)
			console.error(chalk.yellow("Ensure protoc-gen-go and protoc-gen-go-grpc are installed and in your PATH."))
			console.error(chalk.yellow("Run: go install google.golang.org/protobuf/cmd/protoc-gen-go@latest"))
			console.error(chalk.yellow("Run: go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest"))
			process.exit(1)
		}
	}

	console.log(chalk.green("Protocol Buffer code generation completed successfully."))
	console.log(chalk.green(`TypeScript (host grpc-js) files generated in: ${TS_OUT_DIR_HOST_GRPC_JS}`))
	console.log(chalk.green(`TypeScript (host generic-def) files generated in: ${TS_OUT_DIR_HOST_GENERIC_DEF}`))
	console.log(chalk.green(`TypeScript (webview_types) files generated in: ${TS_OUT_DIR_WEBVIEW}`))
	console.log(chalk.green(`Go files should be generated in: ${path.join(GO_OUT_DIR, "genproto")}`))

	await generateMethodRegistrations(protoFiles) // Pass protoFiles
	await generateServiceConfig()
	await generateGrpcClientConfig()
}

/**
 * Generate a gRPC client configuration file for the webview
 * This eliminates the need for manual imports and client creation in grpc-client.ts
 */
async function generateGrpcClientConfig() {
	console.log(chalk.cyan("Generating gRPC client configuration..."))

	const serviceImports = []
	const serviceClientCreations = []
	const serviceExports = []

	// Process each service in the serviceNameMap
	for (const [dirName, fullServiceName] of Object.entries(serviceNameMap)) {
		const capitalizedName = dirName.charAt(0).toUpperCase() + dirName.slice(1)

		// Add import statement
		serviceImports.push(`import { ${capitalizedName}ServiceDefinition } from "@shared/proto_generic_def/${dirName}"`) // Updated path

		// Add client creation
		serviceClientCreations.push(
			`const ${capitalizedName}ServiceClient = createGrpcClient(${capitalizedName}ServiceDefinition)`,
		)

		// Add to exports
		serviceExports.push(`${capitalizedName}ServiceClient`)
	}

	// Generate the file content
	const content = `// AUTO-GENERATED FILE - DO NOT MODIFY DIRECTLY
// Generated by proto/build-proto.js

import { createGrpcClient } from "./grpc-client-base"
${serviceImports.join("\n")}

${serviceClientCreations.join("\n")}

export {
	${serviceExports.join(",\n\t")}
}`

	const configPath = path.join(ROOT_DIR, "webview-ui", "src", "services", "grpc-client.ts")
	await fs.writeFile(configPath, content)
	console.log(chalk.green(`Generated gRPC client at ${configPath}`))
}

/**
 * Parse proto files to extract streaming method information
 * @param protoFiles Array of proto file names
 * @param scriptDir Directory containing proto files
 * @returns Map of service names to their streaming methods
 */
// protoFiles is passed as an argument
async function parseProtoForStreamingMethods(protoFiles, scriptDir) {
	console.log(chalk.cyan("Parsing proto files for streaming methods..."))

	// Map of service name to array of streaming method names
	const streamingMethodsMap = new Map()

	for (const protoFile of protoFiles) {
		const content = await fs.readFile(path.join(scriptDir, protoFile), "utf8")

		// Extract package name
		const packageMatch = content.match(/package\s+([^;]+);/)
		const packageName = packageMatch ? packageMatch[1].trim() : "unknown"

		// Extract service definitions
		const serviceMatches = Array.from(content.matchAll(/service\s+(\w+)\s*\{([^}]+)\}/g))
		for (const serviceMatch of serviceMatches) {
			const serviceName = serviceMatch[1]
			const serviceBody = serviceMatch[2]
			const fullServiceName = `${packageName}.${serviceName}`

			// Extract method definitions with streaming
			const methodMatches = Array.from(
				serviceBody.matchAll(/rpc\s+(\w+)\s*\(\s*(stream\s+)?(\w+)\s*\)\s*returns\s*\(\s*(stream\s+)?(\w+)\s*\)/g),
			)

			const streamingMethods = []
			for (const methodMatch of methodMatches) {
				const methodName = methodMatch[1]
				const isRequestStreaming = !!methodMatch[2]
				const requestType = methodMatch[3]
				const isResponseStreaming = !!methodMatch[4]
				const responseType = methodMatch[5]

				if (isResponseStreaming) {
					streamingMethods.push({
						name: methodName,
						requestType,
						responseType,
						isRequestStreaming,
					})
				}
			}

			if (streamingMethods.length > 0) {
				streamingMethodsMap.set(fullServiceName, streamingMethods)
			}
		}
	}

	return streamingMethodsMap
}

async function generateMethodRegistrations(protoFiles) {
	// Receive protoFiles
	console.log(chalk.cyan("Generating method registration files..."))

	// Parse proto files for streaming methods
	const streamingMethodsMap = await parseProtoForStreamingMethods(protoFiles, SCRIPT_DIR)

	for (const serviceDir of serviceDirs) {
		try {
			await fs.access(serviceDir)
		} catch (error) {
			console.log(chalk.cyan(`Creating directory ${serviceDir} for new service`))
			await fs.mkdir(serviceDir, { recursive: true })
		}

		const serviceName = path.basename(serviceDir)
		const registryFile = path.join(serviceDir, "methods.ts")
		const indexFile = path.join(serviceDir, "index.ts")

		const fullServiceName = serviceNameMap[serviceName]
		const streamingMethods = streamingMethodsMap.get(fullServiceName) || []

		console.log(chalk.cyan(`Generating method registrations for ${serviceName}...`))

		// Get all TypeScript files in the service directory
		const files = await globby("*.ts", { cwd: serviceDir })

		// Filter out index.ts and methods.ts
		const implementationFiles = files.filter((file) => file !== "index.ts" && file !== "methods.ts")

		// Create the methods.ts file with header
		let methodsContent = `// AUTO-GENERATED FILE - DO NOT MODIFY DIRECTLY
// Generated by proto/build-proto.js

// Import all method implementations
import { registerMethod } from "./index"\n`

		// Add imports for all implementation files
		for (const file of implementationFiles) {
			const baseName = path.basename(file, ".ts")
			methodsContent += `import { ${baseName} } from "./${baseName}"\n`
		}

		// Add streaming methods information
		if (streamingMethods.length > 0) {
			methodsContent += `\n// Streaming methods for this service
export const streamingMethods = ${JSON.stringify(
				streamingMethods.map((m) => m.name),
				null,
				2,
			)}\n`
		}

		// Add registration function
		methodsContent += `\n// Register all ${serviceName} service methods
export function registerAllMethods(): void {
\t// Register each method with the registry\n`

		// Add registration statements
		for (const file of implementationFiles) {
			const baseName = path.basename(file, ".ts")
			const isStreaming = streamingMethods.some((m) => m.name === baseName)

			if (isStreaming) {
				methodsContent += `\tregisterMethod("${baseName}", ${baseName}, { isStreaming: true })\n`
			} else {
				methodsContent += `\tregisterMethod("${baseName}", ${baseName})\n`
			}
		}

		// Close the function
		methodsContent += `}`

		// Write the methods.ts file
		await fs.writeFile(registryFile, methodsContent)
		console.log(chalk.green(`Generated ${registryFile}`))

		// Generate index.ts file
		const capitalizedServiceName = serviceName.charAt(0).toUpperCase() + serviceName.slice(1)
		const indexContent = `// AUTO-GENERATED FILE - DO NOT MODIFY DIRECTLY
// Generated by proto/build-proto.js

import { createServiceRegistry, ServiceMethodHandler, StreamingMethodHandler } from "../grpc-service"
import { StreamingResponseHandler } from "../grpc-handler"
import { registerAllMethods } from "./methods"

// Create ${serviceName} service registry
const ${serviceName}Service = createServiceRegistry("${serviceName}")

// Export the method handler types and registration function
export type ${capitalizedServiceName}MethodHandler = ServiceMethodHandler
export type ${capitalizedServiceName}StreamingMethodHandler = StreamingMethodHandler
export const registerMethod = ${serviceName}Service.registerMethod

// Export the request handlers
export const handle${capitalizedServiceName}ServiceRequest = ${serviceName}Service.handleRequest
export const handle${capitalizedServiceName}ServiceStreamingRequest = ${serviceName}Service.handleStreamingRequest
export const isStreamingMethod = ${serviceName}Service.isStreamingMethod

// Register all ${serviceName} methods
registerAllMethods()`

		// Write the index.ts file
		await fs.writeFile(indexFile, indexContent)
		console.log(chalk.green(`Generated ${indexFile}`))
	}

	console.log(chalk.green("Method registration files generated successfully."))
}

/**
 * Generate a service configuration file that maps service names to their handlers
 * This eliminates the need for manual switch/case statements in grpc-handler.ts
 */
async function generateServiceConfig() {
	console.log(chalk.cyan("Generating service configuration file..."))

	const serviceImports = []
	const serviceConfigs = []

	// Add all services from the serviceNameMap
	for (const [dirName, fullServiceName] of Object.entries(serviceNameMap)) {
		const capitalizedName = dirName.charAt(0).toUpperCase() + dirName.slice(1)
		serviceImports.push(
			`import { handle${capitalizedName}ServiceRequest, handle${capitalizedName}ServiceStreamingRequest } from "./${dirName}/index"`,
		)
		serviceConfigs.push(`
  "${fullServiceName}": {
    requestHandler: handle${capitalizedName}ServiceRequest,
    streamingHandler: handle${capitalizedName}ServiceStreamingRequest
  }`)
	}

	const content = `// AUTO-GENERATED FILE - DO NOT MODIFY DIRECTLY
// Generated by proto/build-proto.js

import { Controller } from "./index"
import { StreamingResponseHandler } from "./grpc-handler"
${serviceImports.join("\n")}

/**
 * Configuration for a service handler
 */
export interface ServiceHandlerConfig {
  requestHandler: (controller: Controller, method: string, message: any) => Promise<any>;
  streamingHandler: (controller: Controller, method: string, message: any, responseStream: StreamingResponseHandler, requestId?: string) => Promise<void>;
}

/**
 * Map of service names to their handler configurations
 */
export const serviceHandlers: Record<string, ServiceHandlerConfig> = {${serviceConfigs.join(",")}
};`

	const configPath = path.join(ROOT_DIR, "src", "core", "controller", "grpc-service-config.ts")
	await fs.writeFile(configPath, content)
	console.log(chalk.green(`Generated service configuration at ${configPath}`))
}

/**
 * Ensure that a .proto file exists for each service in the serviceNameMap
 * If a .proto file doesn't exist, create a template file
 */
async function ensureProtoFilesExist() {
	console.log(chalk.cyan("Checking for missing proto files..."))

	// Get existing proto files
	const existingProtoFiles = await globby("*.proto", { cwd: SCRIPT_DIR })
	const existingProtoServices = existingProtoFiles.map((file) => path.basename(file, ".proto"))

	// Check each service in serviceNameMap
	for (const [serviceName, fullServiceName] of Object.entries(serviceNameMap)) {
		if (!existingProtoServices.includes(serviceName)) {
			console.log(chalk.yellow(`Creating template proto file for ${serviceName}...`))

			// Extract service class name from full name (e.g., "cline.ModelsService" -> "ModelsService")
			const serviceClassName = fullServiceName.split(".").pop()

			// Create template proto file
			const protoContent = `syntax = "proto3";

package cline;
option java_package = "bot.cline.proto";
option java_multiple_files = true;

import "common.proto";

// ${serviceClassName} provides methods for managing ${serviceName}
service ${serviceClassName} {
  // Add your RPC methods here
  // Example (String is from common.proto, responses should be generic types):
  // rpc YourMethod(YourRequest) returns (String);
}

// Add your message definitions here
// Example (Requests must always start with Metadata):
// message YourRequest {
//   Metadata metadata = 1;
//   string stringField = 2;
//   int32 int32Field = 3;
// }
` // Corrected closing backtick

			// Write the template proto file
			const protoFilePath = path.join(SCRIPT_DIR, `${serviceName}.proto`) // Corrected template literal
			await fs.writeFile(protoFilePath, protoContent)
			console.log(chalk.green(`Created template proto file at ${protoFilePath}`)) // Corrected template literal
		}
	}
}

// Run the main function
main().catch((error) => {
	console.error(chalk.red("Error:"), error)
	process.exit(1)
})

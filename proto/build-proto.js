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
const tsProtoPlugin = require.resolve("ts-proto/protoc-gen-ts_proto")

// Get script directory and root directory
const __filename = fileURLToPath(import.meta.url)
const SCRIPT_DIR = path.dirname(__filename)
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..")

async function main() {
	console.log(chalk.bold.blue("Starting Protocol Buffer code generation..."))

	// Define output directories
	const TS_OUT_DIR_HOST = path.join(ROOT_DIR, "src", "shared", "proto")
	const TS_OUT_DIR_WEBVIEW = path.join(ROOT_DIR, "src", "shared", "proto_webview_types")
	const GO_OUT_DIR = path.join(ROOT_DIR, "sandbox-client") // Output Go files directly into sandbox-client, protoc will create genproto automatically based on paths

	// Create output directories if they don't exist
	await fs.mkdir(TS_OUT_DIR_HOST, { recursive: true })
	await fs.mkdir(TS_OUT_DIR_WEBVIEW, { recursive: true })
	await fs.mkdir(GO_OUT_DIR, { recursive: true }) // Ensure sandbox-client exists

	// Clean up existing generated files
	console.log(chalk.cyan("Cleaning up existing generated TypeScript files (host)..."))
	const existingHostTsFiles = await globby("**/*.ts", { cwd: TS_OUT_DIR_HOST })
	for (const file of existingHostTsFiles) {
		await fs.unlink(path.join(TS_OUT_DIR_HOST, file))
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
	const protoFiles = await globby("*.proto", { cwd: SCRIPT_DIR })
	const execOptions = { stdio: "inherit" }

	for (const protoFile of protoFiles) {
		console.log(chalk.cyan(`Generating TypeScript code (host) for ${protoFile}...`))
		const protocCommandHost = [
			protoc,
			`--plugin=protoc-gen-ts_proto="${tsProtoPlugin}"`,
			`--ts_proto_out="${TS_OUT_DIR_HOST}"`,
			"--ts_proto_opt=outputServices=grpc-js,env=node,esModuleInterop=true,useDate=false,useOptionals=messages,useAbortSignal=true",
			`--proto_path="${SCRIPT_DIR}"`,
			`"${path.join(SCRIPT_DIR, protoFile)}"`,
		].join(" ")

		try {
			execSync(protocCommandHost, execOptions)
		} catch (error) {
			console.error(chalk.red(`Error generating TypeScript (host) for ${protoFile}:`), error)
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
	console.log(chalk.green(`TypeScript (host) files generated in: ${TS_OUT_DIR_HOST}`))
	console.log(chalk.green(`TypeScript (webview_types) files generated in: ${TS_OUT_DIR_WEBVIEW}`))
	console.log(chalk.green(`Go files should be generated in: ${path.join(GO_OUT_DIR, "genproto")}`))

	// Generate method registration files
	await generateMethodRegistrations()

	// Make the script executable
	try {
		await fs.chmod(path.join(SCRIPT_DIR, "build-proto.js"), 0o755)
	} catch (error) {
		console.warn(chalk.yellow("Warning: Could not make script executable:"), error)
	}
}

async function generateMethodRegistrations() {
	console.log(chalk.cyan("Generating method registration files..."))

	const serviceDirs = [
		path.join(ROOT_DIR, "src", "core", "controller", "account"),
		path.join(ROOT_DIR, "src", "core", "controller", "browser"),
		path.join(ROOT_DIR, "src", "core", "controller", "checkpoints"),
		path.join(ROOT_DIR, "src", "core", "controller", "file"),
		path.join(ROOT_DIR, "src", "core", "controller", "mcp"),
		path.join(ROOT_DIR, "src", "core", "controller", "task"),
		path.join(ROOT_DIR, "src", "core", "controller", "web-content"),
		// Add more service directories here as needed
	]

	for (const serviceDir of serviceDirs) {
		try {
			await fs.access(serviceDir)
		} catch (error) {
			console.log(chalk.gray(`Skipping ${serviceDir} - directory does not exist`))
			continue
		}

		const serviceName = path.basename(serviceDir)
		const registryFile = path.join(serviceDir, "methods.ts")

		console.log(chalk.cyan(`Generating method registrations for ${serviceName}...`))

		// Get all TypeScript files in the service directory
		const files = await globby("*.ts", { cwd: serviceDir })

		// Filter out index.ts and methods.ts
		const implementationFiles = files.filter((file) => file !== "index.ts" && file !== "methods.ts")

		// Create the output file with header
		let content = `// AUTO-GENERATED FILE - DO NOT MODIFY DIRECTLY
// Generated by proto/build-proto.js

// Import all method implementations
import { registerMethod } from "./index"\n`

		// Add imports for all implementation files
		for (const file of implementationFiles) {
			const baseName = path.basename(file, ".ts")
			content += `import { ${baseName} } from "./${baseName}"\n`
		}

		// Add registration function
		content += `\n// Register all ${serviceName} service methods
export function registerAllMethods(): void {
\t// Register each method with the registry\n`

		// Add registration statements
		for (const file of implementationFiles) {
			const baseName = path.basename(file, ".ts")
			content += `\tregisterMethod("${baseName}", ${baseName})\n`
		}

		// Close the function
		content += `}`

		// Write the file
		await fs.writeFile(registryFile, content)
		console.log(chalk.green(`Generated ${registryFile}`))
	}

	console.log(chalk.green("Method registration files generated successfully."))
}

// Run the main function
main().catch((error) => {
	console.error(chalk.red("Error:"), error)
	process.exit(1)
})

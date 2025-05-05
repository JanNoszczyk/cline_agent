// Webview-safe MCP conversion functions that don't import Node.js proto files
import { McpServer } from "../../mcp"
import { McpServer as ProtoMcpServer, McpServerStatus } from "../../proto_webview_types/mcp"

// Helper to convert Proto status enum to TS string
function protoStatusToTsStatus(status: McpServerStatus): "connected" | "connecting" | "disconnected" {
	switch (status) {
		case McpServerStatus.MCP_SERVER_STATUS_CONNECTED:
			return "connected"
		case McpServerStatus.MCP_SERVER_STATUS_CONNECTING:
			return "connecting"
		case McpServerStatus.MCP_SERVER_STATUS_DISCONNECTED:
		case McpServerStatus.UNRECOGNIZED:
		default:
			return "disconnected"
	}
}

// Convert proto McpServers to regular McpServer array
export function convertProtoMcpServersToMcpServers(protoServers: ProtoMcpServer[] | undefined): McpServer[] {
	if (!protoServers) {
		return []
	}

	return protoServers.map((server) => ({
		name: server.name,
		config: server.config || "",
		disabled: server.disabled ?? false,
		status: protoStatusToTsStatus(server.status),
		error: server.error,
		timeout: server.timeout ? parseInt(server.timeout.toString()) : undefined,
		tools:
			server.tools?.map((tool: any) => ({
				name: tool.name,
				description: tool.description,
				inputSchema: tool.inputSchema ? JSON.parse(tool.inputSchema) : undefined,
				autoApprove: tool.autoApprove ?? false,
			})) ?? [],
		resources:
			server.resources?.map((resource: any) => ({
				uri: resource.uri,
				name: resource.name,
				description: resource.description,
				mimeType: resource.mimeType,
			})) ?? [],
		resourceTemplates:
			server.resourceTemplates?.map((template: any) => ({
				uriTemplate: template.uriTemplate,
				name: template.name,
				description: template.description,
				mimeType: template.mimeType,
			})) ?? [],
	}))
}

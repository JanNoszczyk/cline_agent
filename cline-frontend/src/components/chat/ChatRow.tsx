import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import styled from "styled-components"
import { VSCodeBadge, VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"
import { ClineMessage } from "../../context/ExtensionStateContext"
import MarkdownBlock from "../common/MarkdownBlock"
import CodeAccordian, { cleanPathPrefix } from "../common/CodeAccordian"
import { CODE_BLOCK_BG_COLOR } from "../common/CodeAccordian"

const ChatRowContainer = styled.div`
	padding: 10px 6px 10px 15px;
	position: relative;
`

interface ChatRowProps {
	message: ClineMessage
	isExpanded: boolean
	onToggleExpand: () => void
	lastModifiedMessage?: ClineMessage
	isLast: boolean
	onHeightChange: (isTaller: boolean) => void
}

const ChatRow = memo((props: ChatRowProps) => {
	const { isLast, onHeightChange, message, lastModifiedMessage } = props
	const prevHeightRef = useRef(0)
	const [height, setHeight] = useState(0)

	// Measure height changes
	const containerRef = useCallback((node: HTMLDivElement | null) => {
		if (node) {
			setHeight(node.getBoundingClientRect().height)
		}
	}, [])

	// Check if we should show checkpoints
	const shouldShowCheckpoints =
		message.lastCheckpointHash != null &&
		(message.say === "tool" ||
			message.ask === "tool" ||
			message.say === "command" ||
			message.ask === "command" ||
			message.say === "use_mcp_server" ||
			message.ask === "use_mcp_server")

	useEffect(() => {
		const isInitialRender = prevHeightRef.current === 0
		if (isLast && height !== 0 && height !== prevHeightRef.current) {
			if (!isInitialRender) {
				onHeightChange(height > prevHeightRef.current)
			}
			prevHeightRef.current = height
		}
	}, [height, isLast, onHeightChange, message])

	return (
		<ChatRowContainer ref={containerRef}>
			<ChatRowContent {...props} />
			{shouldShowCheckpoints && (
				<div
					style={{
						position: "absolute",
						top: 0,
						right: 0,
						bottom: 0,
						width: "4px",
						backgroundColor: "var(--vscode-charts-green)",
						opacity: 0.6,
						borderTopRightRadius: "3px",
						borderBottomRightRadius: "3px",
					}}
				/>
			)}
		</ChatRowContainer>
	)
})

export default ChatRow

interface ChatRowContentProps extends Omit<ChatRowProps, "onHeightChange"> {}

export const ChatRowContent = ({ message, isExpanded, onToggleExpand, lastModifiedMessage, isLast }: ChatRowContentProps) => {
	const type = message.type === "ask" ? message.ask : message.say

	const normalColor = "var(--vscode-foreground)"
	const errorColor = "var(--vscode-errorForeground)"
	const successColor = "var(--vscode-charts-green)"
	const cancelledColor = "var(--vscode-descriptionForeground)"

	const isCommandExecuting = isLast && (lastModifiedMessage?.ask === "command" || lastModifiedMessage?.say === "command")

	const isMcpServerResponding = isLast && lastModifiedMessage?.say === "mcp_server_request_started"

	const [icon, title] = useMemo(() => {
		switch (type) {
			case "error":
				return [
					<span
						className="codicon codicon-error"
						style={{
							color: errorColor,
							marginBottom: "-1.5px",
						}}></span>,
					<span style={{ color: errorColor, fontWeight: "bold" }}>Error</span>,
				]
			case "mistake_limit_reached":
				return [
					<span
						className="codicon codicon-error"
						style={{
							color: errorColor,
							marginBottom: "-1.5px",
						}}></span>,
					<span style={{ color: errorColor, fontWeight: "bold" }}>Cline is having trouble...</span>,
				]
			case "auto_approval_max_req_reached":
				return [
					<span
						className="codicon codicon-warning"
						style={{
							color: errorColor,
							marginBottom: "-1.5px",
						}}></span>,
					<span style={{ color: errorColor, fontWeight: "bold" }}>Maximum Requests Reached</span>,
				]
			case "command":
				return [
					isCommandExecuting ? (
						<ProgressIndicator />
					) : (
						<span
							className="codicon codicon-terminal"
							style={{
								color: normalColor,
								marginBottom: "-1.5px",
							}}></span>
					),
					<span style={{ color: normalColor, fontWeight: "bold" }}>Cline wants to execute this command:</span>,
				]
			case "use_mcp_server":
				return [
					isMcpServerResponding ? (
						<ProgressIndicator />
					) : (
						<span
							className="codicon codicon-server"
							style={{
								color: normalColor,
								marginBottom: "-1.5px",
							}}></span>
					),
					<span style={{ color: normalColor, fontWeight: "bold", wordBreak: "break-word" }}>
						Cline wants to use an MCP server
					</span>,
				]
			case "completion_result":
				return [
					<span
						className="codicon codicon-check"
						style={{
							color: successColor,
							marginBottom: "-1.5px",
						}}></span>,
					<span style={{ color: successColor, fontWeight: "bold" }}>Task Completed</span>,
				]
			case "api_req_started":
				return [<ProgressIndicator />, <span style={{ color: normalColor, fontWeight: "bold" }}>API Request...</span>]
			case "followup":
				return [
					<span
						className="codicon codicon-question"
						style={{
							color: normalColor,
							marginBottom: "-1.5px",
						}}></span>,
					<span style={{ color: normalColor, fontWeight: "bold" }}>Cline has a question:</span>,
				]
			default:
				return [null, null]
		}
	}, [type, normalColor, errorColor, successColor, isCommandExecuting, isMcpServerResponding])

	const headerStyle: React.CSSProperties = {
		display: "flex",
		alignItems: "center",
		gap: "10px",
		marginBottom: "12px",
	}

	const pStyle: React.CSSProperties = {
		margin: 0,
		whiteSpace: "pre-wrap",
		wordBreak: "break-word",
		overflowWrap: "anywhere",
	}

	// Handle tool messages
	if ((message.ask === "tool" || message.say === "tool") && message.text) {
		try {
			const tool = JSON.parse(message.text)

			switch (tool.tool) {
				case "newFileCreated":
					return (
						<>
							<div style={headerStyle}>
								<span
									className="codicon codicon-new-file"
									style={{
										color: normalColor,
										marginBottom: "-1.5px",
									}}></span>
								<span style={{ fontWeight: "bold" }}>Cline wants to create a new file:</span>
							</div>
							<CodeAccordian
								isLoading={message.partial}
								code={tool.content}
								path={tool.path}
								isExpanded={isExpanded}
								onToggleExpand={onToggleExpand}
							/>
						</>
					)
				case "editedExistingFile":
					return (
						<>
							<div style={headerStyle}>
								<span
									className="codicon codicon-edit"
									style={{
										color: normalColor,
										marginBottom: "-1.5px",
									}}></span>
								<span style={{ fontWeight: "bold" }}>Cline wants to edit this file:</span>
							</div>
							<CodeAccordian
								code={tool.content}
								path={tool.path}
								isExpanded={isExpanded}
								onToggleExpand={onToggleExpand}
							/>
						</>
					)
				case "readFile":
					return (
						<>
							<div style={headerStyle}>
								<span
									className="codicon codicon-file-code"
									style={{
										color: normalColor,
										marginBottom: "-1.5px",
									}}></span>
								<span style={{ fontWeight: "bold" }}>Cline wants to read this file:</span>
							</div>
							<div
								style={{
									borderRadius: 3,
									backgroundColor: CODE_BLOCK_BG_COLOR,
									overflow: "hidden",
									border: "1px solid var(--vscode-editorGroup-border)",
								}}>
								<div
									style={{
										color: "var(--vscode-descriptionForeground)",
										display: "flex",
										alignItems: "center",
										padding: "9px 10px",
										cursor: "pointer",
										userSelect: "none",
									}}>
									{tool.path?.startsWith(".") && <span>.</span>}
									<span
										style={{
											whiteSpace: "nowrap",
											overflow: "hidden",
											textOverflow: "ellipsis",
											marginRight: "8px",
											direction: "rtl",
											textAlign: "left",
										}}>
										{cleanPathPrefix(tool.path ?? "") + "\u200E"}
									</span>
									<div style={{ flexGrow: 1 }}></div>
									<span
										className={`codicon codicon-link-external`}
										style={{
											fontSize: 13.5,
											margin: "1px 0",
										}}></span>
								</div>
							</div>
						</>
					)
				case "listFilesTopLevel":
				case "listFilesRecursive":
					return (
						<>
							<div style={headerStyle}>
								<span
									className="codicon codicon-folder-opened"
									style={{
										color: normalColor,
										marginBottom: "-1.5px",
									}}></span>
								<span style={{ fontWeight: "bold" }}>
									{message.type === "ask"
										? `Cline wants to ${tool.tool === "listFilesRecursive" ? "recursively " : ""}view ${tool.tool === "listFilesRecursive" ? "all " : "the top level "}files in this directory:`
										: `Cline ${tool.tool === "listFilesRecursive" ? "recursively " : ""}viewed ${tool.tool === "listFilesRecursive" ? "all " : "the top level "}files in this directory:`}
								</span>
							</div>
							<CodeAccordian
								code={tool.content}
								path={tool.path}
								language="shell-session"
								isExpanded={isExpanded}
								onToggleExpand={onToggleExpand}
							/>
						</>
					)
				case "listCodeDefinitionNames":
					return (
						<>
							<div style={headerStyle}>
								<span
									className="codicon codicon-file-code"
									style={{
										color: normalColor,
										marginBottom: "-1.5px",
									}}></span>
								<span style={{ fontWeight: "bold" }}>
									{message.type === "ask"
										? "Cline wants to view source code definition names used in this directory:"
										: "Cline viewed source code definition names used in this directory:"}
								</span>
							</div>
							<CodeAccordian
								code={tool.content}
								path={tool.path}
								isExpanded={isExpanded}
								onToggleExpand={onToggleExpand}
							/>
						</>
					)
				case "searchFiles":
					return (
						<>
							<div style={headerStyle}>
								<span
									className="codicon codicon-search"
									style={{
										color: normalColor,
										marginBottom: "-1.5px",
									}}></span>
								<span style={{ fontWeight: "bold" }}>
									Cline wants to search this directory for <code>{tool.regex}</code>:
								</span>
							</div>
							<CodeAccordian
								code={tool.content}
								path={tool.path + (tool.filePattern ? `/(${tool.filePattern})` : "")}
								language="plaintext"
								isExpanded={isExpanded}
								onToggleExpand={onToggleExpand}
							/>
						</>
					)
				default:
					return null
			}
		} catch (e) {
			console.error("Error parsing tool JSON:", e)
			return null
		}
	}

	if (message.ask === "command" || message.say === "command") {
		const command = message.text || ""
		const output = ""

		return (
			<>
				<div style={headerStyle}>
					{icon}
					{title}
				</div>
				<div
					style={{
						borderRadius: 3,
						border: "1px solid var(--vscode-editorGroup-border)",
						overflow: "hidden",
						backgroundColor: CODE_BLOCK_BG_COLOR,
					}}>
					<CodeBlock source={`${"```"}shell\n${command}\n${"```"}`} forceWrap={true} />
					{output.length > 0 && (
						<div style={{ width: "100%" }}>
							<div
								onClick={onToggleExpand}
								style={{
									display: "flex",
									alignItems: "center",
									gap: "4px",
									width: "100%",
									justifyContent: "flex-start",
									cursor: "pointer",
									padding: `2px 8px ${isExpanded ? 0 : 8}px 8px`,
								}}>
								<span className={`codicon codicon-chevron-${isExpanded ? "down" : "right"}`}></span>
								<span style={{ fontSize: "0.8em" }}>Command Output</span>
							</div>
							{isExpanded && <CodeBlock source={`${"```"}shell\n${output}\n${"```"}`} />}
						</div>
					)}
				</div>
			</>
		)
	}

	// Handle different message types
	switch (message.type) {
		case "say":
			switch (message.say) {
				case "api_req_started":
					return (
						<>
							<div
								style={{
									...headerStyle,
									marginBottom: 0,
									justifyContent: "space-between",
									cursor: "pointer",
									userSelect: "none",
								}}
								onClick={onToggleExpand}>
								<div
									style={{
										display: "flex",
										alignItems: "center",
										gap: "10px",
									}}>
									{icon}
									{title}
								</div>
								<span className={`codicon codicon-chevron-${isExpanded ? "up" : "down"}`}></span>
							</div>
							{isExpanded && (
								<div style={{ marginTop: "10px" }}>
									<CodeAccordian
										code={message.text ? JSON.parse(message.text).request || "{}" : "{}"}
										language="markdown"
										isExpanded={true}
										onToggleExpand={onToggleExpand}
									/>
								</div>
							)}
						</>
					)
				case "text":
					return (
						<div>
							<Markdown markdown={message.text} />
						</div>
					)
				case "user_feedback":
					return (
						<div
							style={{
								backgroundColor: "var(--vscode-badge-background)",
								color: "var(--vscode-badge-foreground)",
								borderRadius: "3px",
								padding: "9px",
								whiteSpace: "pre-line",
								wordWrap: "break-word",
							}}>
							<span style={{ display: "block" }}>{message.text}</span>
							{message.images && message.images.length > 0 && (
								<div style={{ marginTop: "8px", display: "flex", flexWrap: "wrap", gap: "8px" }}>
									{message.images.map((image, index) => (
										<div
											key={index}
											style={{
												width: "60px",
												height: "60px",
												borderRadius: "3px",
												overflow: "hidden",
											}}>
											<img
												src={image}
												alt={`Image ${index + 1}`}
												style={{ width: "100%", height: "100%", objectFit: "cover" }}
											/>
										</div>
									))}
								</div>
							)}
						</div>
					)
				case "error":
					return (
						<>
							{title && (
								<div style={headerStyle}>
									{icon}
									{title}
								</div>
							)}
							<p
								style={{
									...pStyle,
									color: "var(--vscode-errorForeground)",
								}}>
								{message.text}
							</p>
						</>
					)
				case "completion_result":
					return (
						<>
							<div
								style={{
									...headerStyle,
									marginBottom: "10px",
								}}>
								{icon}
								{title}
							</div>
							<div
								style={{
									color: "var(--vscode-charts-green)",
									paddingTop: 10,
								}}>
								<Markdown markdown={message.text} />
							</div>
						</>
					)
				default:
					return (
						<>
							{title && (
								<div style={headerStyle}>
									{icon}
									{title}
								</div>
							)}
							<div style={{ paddingTop: 10 }}>
								<Markdown markdown={message.text} />
							</div>
						</>
					)
			}
		case "ask":
			switch (message.ask) {
				case "mistake_limit_reached":
					return (
						<>
							<div style={headerStyle}>
								{icon}
								{title}
							</div>
							<p
								style={{
									...pStyle,
									color: "var(--vscode-errorForeground)",
								}}>
								{message.text}
							</p>
						</>
					)
				case "auto_approval_max_req_reached":
					return (
						<>
							<div style={headerStyle}>
								{icon}
								{title}
							</div>
							<p
								style={{
									...pStyle,
									color: "var(--vscode-errorForeground)",
								}}>
								{message.text}
							</p>
						</>
					)
				case "completion_result":
					if (message.text) {
						return (
							<div>
								<div
									style={{
										...headerStyle,
										marginBottom: "10px",
									}}>
									{icon}
									{title}
								</div>
								<div
									style={{
										color: "var(--vscode-charts-green)",
										paddingTop: 10,
									}}>
									<Markdown markdown={message.text} />
								</div>
							</div>
						)
					} else {
						return null
					}
				case "followup":
					return (
						<>
							{title && (
								<div style={headerStyle}>
									{icon}
									{title}
								</div>
							)}
							<div style={{ paddingTop: 10 }}>
								<Markdown markdown={message.text} />
							</div>
						</>
					)
				case "plan_mode_response":
					return (
						<div style={{}}>
							<Markdown markdown={message.text} />
						</div>
					)
				default:
					return null
			}
	}
}

export const ProgressIndicator = () => (
	<div
		style={{
			width: "16px",
			height: "16px",
			display: "flex",
			alignItems: "center",
			justifyContent: "center",
		}}>
		<div style={{ transform: "scale(0.55)", transformOrigin: "center" }}>
			<VSCodeProgressRing />
		</div>
	</div>
)

const Markdown = memo(({ markdown }: { markdown?: string }) => {
	return (
		<div
			style={{
				wordBreak: "break-word",
				overflowWrap: "anywhere",
				marginBottom: -15,
				marginTop: -15,
			}}>
			<MarkdownBlock markdown={markdown} />
		</div>
	)
})

// Simple CodeBlock component for rendering code
const CodeBlock = ({ source, forceWrap = false }: { source: string; forceWrap?: boolean }) => {
	return (
		<pre
			style={{
				margin: 0,
				padding: "10px",
				overflow: "auto",
				backgroundColor: CODE_BLOCK_BG_COLOR,
				color: "var(--vscode-editor-foreground)",
				fontFamily: "monospace",
				fontSize: "13px",
				lineHeight: "1.5",
				whiteSpace: forceWrap ? "pre-wrap" : "pre",
				wordBreak: forceWrap ? "break-word" : "normal",
			}}>
			{source.replace(/```\w*\n|\n```/g, "")}
		</pre>
	)
}

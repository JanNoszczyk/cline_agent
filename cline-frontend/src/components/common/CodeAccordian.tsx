import React, { memo, useMemo } from "react"
import styled from "styled-components"
import { VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"

interface CodeAccordianProps {
	code?: string
	diff?: string
	language?: string | undefined
	path?: string
	isFeedback?: boolean
	isConsoleLogs?: boolean
	isExpanded: boolean
	onToggleExpand: () => void
	isLoading?: boolean
}

export const CODE_BLOCK_BG_COLOR = "var(--vscode-textCodeBlock-background)"

const CodeAccordianContainer = styled.div`
	border-radius: 3px;
	overflow: hidden;
	border: 1px solid var(--vscode-editorGroup-border);
	margin-bottom: 8px;
`

const HeaderContainer = styled.div`
	color: var(--vscode-descriptionForeground);
	display: flex;
	align-items: center;
	padding: 9px 10px;
	cursor: pointer;
	user-select: none;
	background-color: ${CODE_BLOCK_BG_COLOR};
`

const PathText = styled.span`
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	margin-right: 8px;
	direction: rtl;
	text-align: left;
`

const CodeContainer = styled.div`
	max-height: 400px;
	overflow: auto;
	background-color: ${CODE_BLOCK_BG_COLOR};
	font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, Courier, monospace;
	font-size: 13px;
	line-height: 1.5;
	padding: 12px;
	white-space: pre;
	color: var(--vscode-editor-foreground);
`

/*
We need to remove leading non-alphanumeric characters from the path in order for our leading ellipses trick to work.
^: Anchors the match to the start of the string.
[^a-zA-Z0-9]+: Matches one or more characters that are not alphanumeric.
The replace method removes these matched characters, effectively trimming the string up to the first alphanumeric character.
*/
export const cleanPathPrefix = (path: string): string => path.replace(/^[^\u4e00-\u9fa5a-zA-Z0-9]+/, "")

export const getLanguageFromPath = (path: string): string => {
	const extension = path.split(".").pop()?.toLowerCase()

	switch (extension) {
		case "js":
			return "javascript"
		case "ts":
			return "typescript"
		case "jsx":
			return "jsx"
		case "tsx":
			return "tsx"
		case "html":
			return "html"
		case "css":
			return "css"
		case "json":
			return "json"
		case "md":
			return "markdown"
		case "py":
			return "python"
		case "rb":
			return "ruby"
		case "java":
			return "java"
		case "c":
			return "c"
		case "cpp":
		case "cc":
			return "cpp"
		case "go":
			return "go"
		case "rs":
			return "rust"
		case "php":
			return "php"
		case "sh":
			return "shell"
		default:
			return "plaintext"
	}
}

const CodeAccordian = ({
	code,
	diff,
	language,
	path,
	isFeedback,
	isConsoleLogs,
	isExpanded,
	onToggleExpand,
	isLoading,
}: CodeAccordianProps) => {
	const inferredLanguage = useMemo(
		() => code && (language ?? (path ? getLanguageFromPath(path) : undefined)),
		[path, language, code],
	)

	return (
		<CodeAccordianContainer>
			{(path || isFeedback || isConsoleLogs) && (
				<HeaderContainer
					onClick={isLoading ? undefined : onToggleExpand}
					style={{
						opacity: isLoading ? 0.7 : 1,
						cursor: isLoading ? "wait" : "pointer",
					}}>
					{isLoading ? (
						<div style={{ marginRight: 8 }}>
							<VSCodeProgressRing />
						</div>
					) : (
						<span className={`codicon codicon-chevron-${isExpanded ? "down" : "right"}`} style={{ marginRight: 8 }} />
					)}

					{isFeedback || isConsoleLogs ? (
						<div style={{ display: "flex", alignItems: "center" }}>
							<span
								className={`codicon codicon-${isFeedback ? "feedback" : "output"}`}
								style={{ marginRight: "6px" }}></span>
							<span
								style={{
									whiteSpace: "nowrap",
									overflow: "hidden",
									textOverflow: "ellipsis",
									marginRight: "8px",
								}}>
								{isFeedback ? "User Edits" : "Console Logs"}
							</span>
						</div>
					) : (
						<>
							{path?.startsWith(".") && <span>.</span>}
							<PathText>{cleanPathPrefix(path ?? "") + "\u200E"}</PathText>
						</>
					)}

					<div style={{ flexGrow: 1 }} />

					<span className={`codicon codicon-chevron-${isExpanded ? "up" : "down"}`}></span>
				</HeaderContainer>
			)}

			{(!(path || isFeedback || isConsoleLogs) || isExpanded) && !isLoading && (
				<div
					style={{
						overflowX: "auto",
						overflowY: "hidden",
						maxWidth: "100%",
					}}>
					<CodeBlock
						source={`${"```"}${diff !== undefined ? "diff" : inferredLanguage}\n${(
							code ??
							diff ??
							""
						).trim()}\n${"```"}`}
					/>
				</div>
			)}
		</CodeAccordianContainer>
	)
}

// Simple CodeBlock component for rendering code
const CodeBlock = ({ source }: { source: string }) => {
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
				whiteSpace: "pre",
			}}>
			{source.replace(/```\w*\n|\n```/g, "")}
		</pre>
	)
}

// memo does shallow comparison of props, so if you need it to re-render when a nested object changes, you need to pass a custom comparison function
export default memo(CodeAccordian)

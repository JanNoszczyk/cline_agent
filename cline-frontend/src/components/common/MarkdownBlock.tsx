import React, { memo, useEffect, useState } from "react"
import styled from "styled-components"
import { CODE_BLOCK_BG_COLOR } from "./CodeAccordian"

interface MarkdownBlockProps {
	markdown?: string
}

const StyledMarkdown = styled.div`
	pre {
		background-color: ${CODE_BLOCK_BG_COLOR};
		border-radius: 3px;
		margin: 13px 0;
		padding: 10px 10px;
		max-width: calc(100vw - 20px);
		overflow-x: auto;
		overflow-y: hidden;
	}

	pre > code {
		.hljs-deletion {
			background-color: var(--vscode-diffEditor-removedTextBackground);
			display: inline-block;
			width: 100%;
		}
		.hljs-addition {
			background-color: var(--vscode-diffEditor-insertedTextBackground);
			display: inline-block;
			width: 100%;
		}
	}

	code {
		span.line:empty {
			display: none;
		}
		word-wrap: break-word;
		border-radius: 3px;
		background-color: ${CODE_BLOCK_BG_COLOR};
		font-size: var(--vscode-editor-font-size, var(--vscode-font-size, 12px));
		font-family: var(--vscode-editor-font-family);
	}

	code:not(pre > code) {
		font-family: var(--vscode-editor-font-family, monospace);
		color: var(--vscode-textPreformat-foreground, #f78383);
		background-color: var(--vscode-textCodeBlock-background, #1e1e1e);
		padding: 0px 2px;
		border-radius: 3px;
		border: 1px solid var(--vscode-textSeparator-foreground, #424242);
		white-space: pre-line;
		word-break: break-word;
		overflow-wrap: anywhere;
	}

	font-family:
		var(--vscode-font-family),
		system-ui,
		-apple-system,
		BlinkMacSystemFont,
		"Segoe UI",
		Roboto,
		Oxygen,
		Ubuntu,
		Cantarell,
		"Open Sans",
		"Helvetica Neue",
		sans-serif;
	font-size: var(--vscode-font-size, 13px);

	p,
	li,
	ol,
	ul {
		line-height: 1.25;
	}

	ol,
	ul {
		padding-left: 2.5em;
		margin-left: 0;
	}

	p {
		white-space: pre-wrap;
	}

	a {
		text-decoration: none;
	}
	a {
		&:hover {
			text-decoration: underline;
		}
	}

	h1,
	h2,
	h3,
	h4,
	h5,
	h6 {
		margin-top: 24px;
		margin-bottom: 16px;
		font-weight: 600;
		line-height: 1.25;
	}

	h1 {
		font-size: 2em;
		border-bottom: 1px solid var(--vscode-editorGroup-border);
		padding-bottom: 0.3em;
	}

	h2 {
		font-size: 1.5em;
		border-bottom: 1px solid var(--vscode-editorGroup-border);
		padding-bottom: 0.3em;
	}

	h3 {
		font-size: 1.25em;
	}

	h4 {
		font-size: 1em;
	}

	blockquote {
		padding: 0 1em;
		color: var(--vscode-descriptionForeground);
		border-left: 0.25em solid var(--vscode-editorGroup-border);
		margin: 0 0 16px 0;
	}

	table {
		border-collapse: collapse;
		width: 100%;
		margin-bottom: 16px;

		th,
		td {
			padding: 6px 13px;
			border: 1px solid var(--vscode-editorGroup-border);
		}

		tr {
			background-color: var(--vscode-editor-background);

			&:nth-child(2n) {
				background-color: var(--vscode-textCodeBlock-background);
			}
		}
	}

	img {
		max-width: 100%;
		box-sizing: content-box;
	}

	hr {
		height: 0.25em;
		padding: 0;
		margin: 24px 0;
		background-color: var(--vscode-editorGroup-border);
		border: 0;
	}
`

// Enhanced markdown parser with support for code highlighting and mermaid diagrams
const parseMarkdown = (markdown: string): string => {
	if (!markdown) return ""

	// Process code blocks
	let html = markdown.replace(/```([a-z]*)\n([\s\S]*?)\n```/g, (match, language, code) => {
		// Handle mermaid diagrams
		if (language === "mermaid") {
			return `<div class="mermaid-diagram">${code}</div>`
		}

		// Regular code block
		return `<pre><code class="language-${language || "plaintext"}">${escapeHtml(code)}</code></pre>`
	})

	// Process inline code
	html = html.replace(/`([^`]+)`/g, "<code>$1</code>")

	// Process headers
	html = html.replace(/^# (.*$)/gm, "<h1>$1</h1>")
	html = html.replace(/^## (.*$)/gm, "<h2>$1</h2>")
	html = html.replace(/^### (.*$)/gm, "<h3>$1</h3>")
	html = html.replace(/^#### (.*$)/gm, "<h4>$1</h4>")
	html = html.replace(/^##### (.*$)/gm, "<h5>$1</h5>")
	html = html.replace(/^###### (.*$)/gm, "<h6>$1</h6>")

	// Process links
	html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')

	// Process lists
	html = html.replace(/^\* (.*$)/gm, "<ul><li>$1</li></ul>")
	html = html.replace(/^- (.*$)/gm, "<ul><li>$1</li></ul>")
	html = html.replace(/^\d+\. (.*$)/gm, "<ol><li>$1</li></ol>")

	// Process paragraphs (only if line is not already a block element)
	html = html.replace(/^(?!<[a-z])(.*$)/gm, (match, p1) => {
		if (p1.trim() === "") return ""
		return `<p>${p1}</p>`
	})

	// Fix consecutive lists
	html = html.replace(/<\/ul>\s*<ul>/g, "")
	html = html.replace(/<\/ol>\s*<ol>/g, "")

	// Process URLs to make them clickable
	html = html.replace(/(https?:\/\/[^\s<>"]+)/g, (match) => {
		if (html.includes(`href="${match}"`) || html.includes(`src="${match}"`)) {
			return match
		}
		return `<a href="${match}">${match}</a>`
	})

	return html
}

// Helper function to escape HTML special characters
const escapeHtml = (text: string): string => {
	return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

const MarkdownBlock = memo(({ markdown }: MarkdownBlockProps) => {
	const [parsedMarkdown, setParsedMarkdown] = useState("")

	useEffect(() => {
		if (markdown) {
			setParsedMarkdown(parseMarkdown(markdown))
		} else {
			setParsedMarkdown("")
		}
	}, [markdown])

	if (!markdown) return null

	return (
		<div>
			<StyledMarkdown dangerouslySetInnerHTML={{ __html: parsedMarkdown }} />
		</div>
	)
})

export default MarkdownBlock

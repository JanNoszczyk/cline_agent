import { useState } from "react"
import styled, { createGlobalStyle } from "styled-components"
import { VSCodeButton, VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"
import ChatView from "./components/chat/ChatView"
import { ExtensionStateContextProvider } from "./context/ExtensionStateContext"

// VSCode theme variables
const GlobalStyle = createGlobalStyle`
  :root {
    --vscode-foreground: #cccccc;
    --vscode-editor-foreground: #cccccc;
    --vscode-editor-background: #1e1e1e;
    --vscode-editorGroup-border: #444444;
    --vscode-toolbar-hoverBackground: #2a2d2e;
    --vscode-badge-background: #4d4d4d;
    --vscode-badge-foreground: #ffffff;
    --vscode-button-background: #0e639c;
    --vscode-button-foreground: #ffffff;
    --vscode-button-hoverBackground: #1177bb;
    --vscode-button-secondaryBackground: #3a3d41;
    --vscode-button-secondaryForeground: #ffffff;
    --vscode-button-secondaryHoverBackground: #45494e;
    --vscode-errorForeground: #f48771;
    --vscode-descriptionForeground: #ccccccb3;
    --vscode-textCodeBlock-background: #1e1e1e;
    --vscode-charts-green: #89d185;
    --vscode-editorWarning-foreground: #cca700;
  }

  body {
    margin: 0;
    padding: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background-color: var(--vscode-editor-background);
    color: var(--vscode-foreground);
    height: 100vh;
    overflow: hidden;
  }

  #root {
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  * {
    box-sizing: border-box;
  }

  code {
    font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New', monospace;
  }

  .codicon {
    font-family: 'codicon';
    font-size: 16px;
    font-style: normal;
    font-weight: normal;
    display: inline-block;
    text-decoration: none;
    text-rendering: auto;
    text-align: center;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    user-select: none;
    -webkit-user-select: none;
    -ms-user-select: none;
  }

  .codicon-error:before { content: "\\ea87"; }
  .codicon-warning:before { content: "\\ea6c"; }
  .codicon-info:before { content: "\\ea74"; }
  .codicon-check:before { content: "\\eab2"; }
  .codicon-question:before { content: "\\eb56"; }
  .codicon-terminal:before { content: "\\ea85"; }
  .codicon-server:before { content: "\\eb1c"; }
  .codicon-edit:before { content: "\\ea73"; }
  .codicon-new-file:before { content: "\\ea7f"; }
  .codicon-file-code:before { content: "\\eb3a"; }
  .codicon-folder-opened:before { content: "\\ea83"; }
  .codicon-search:before { content: "\\ea6d"; }
  .codicon-chevron-down:before { content: "\\eab4"; }
  .codicon-chevron-up:before { content: "\\eab7"; }
  .codicon-chevron-right:before { content: "\\eab6"; }
  .codicon-link-external:before { content: "\\eb35"; }
  .codicon-history:before { content: "\\ea82"; }
  .codicon-settings-gear:before { content: "\\eb51"; }
  .codicon-extensions:before { content: "\\eb57"; }
  .codicon-add:before { content: "\\ea60"; }
`

const AppContainer = styled.div`
	display: flex;
	flex-direction: column;
	height: 100vh;
	width: 100%;
	max-width: 900px;
	margin: 0 auto;
	border-left: 1px solid var(--vscode-editorGroup-border);
	border-right: 1px solid var(--vscode-editorGroup-border);
`

const App = () => {
	return (
		<>
			<GlobalStyle />
			<AppContainer>
				<ExtensionStateContextProvider>
					<ChatView isHidden={false} showAnnouncement={false} hideAnnouncement={() => {}} showHistoryView={() => {}} />
				</ExtensionStateContextProvider>
			</AppContainer>
		</>
	)
}

export default App

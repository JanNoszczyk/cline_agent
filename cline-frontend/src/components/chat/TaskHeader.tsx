import React from "react"
import WebTaskHeader from "./WebTaskHeader"
import { ClineMessage } from "../../context/ExtensionStateContext"

// Re-export the highlightMentions function from our WebTaskHeader
export { highlightMentions } from "./WebTaskHeader"

interface TaskHeaderProps {
	task: ClineMessage
	tokensIn: number
	tokensOut: number
	doesModelSupportPromptCache: boolean
	cacheWrites?: number
	cacheReads?: number
	totalCost: number
	lastApiReqTotalTokens?: number
	onClose: () => void
}

/**
 * TaskHeader component that uses our web-compatible version of the TaskHeader component.
 * This component is based on the original VSCode extension component but uses web-compatible utilities.
 */
const TaskHeader: React.FC<TaskHeaderProps> = (props) => {
	return <WebTaskHeader {...props} />
}

export default TaskHeader

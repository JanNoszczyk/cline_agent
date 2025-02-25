import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { apiClient } from "../../utils/apiClient"
import { Virtuoso, VirtuosoHandle } from "react-virtuoso"
import styled from "styled-components"
import { VSCodeButton, VSCodeBadge, VSCodeLink, VSCodeProgressRing } from "@vscode/webview-ui-toolkit/react"
import debounce from "debounce"
import { useExtensionState, ClineMessage } from "../../context/ExtensionStateContext"
// Import components from the correct locations
// If these components are in the same directory, we can use relative imports
// If they're in different directories, we need to use absolute imports
import ChatRow from "../chat/ChatRow"
import ChatTextArea from "../chat/ChatTextArea"
import TaskHeader from "../chat/TaskHeader"

export const MAX_IMAGES_PER_MESSAGE = 20 // Anthropic limits to 20 images

interface ChatViewProps {
	isHidden: boolean
	showAnnouncement: boolean
	hideAnnouncement: () => void
	showHistoryView: () => void
}

const ChatView = ({ isHidden, showAnnouncement, hideAnnouncement, showHistoryView }: ChatViewProps) => {
	const { clineMessages: messages, taskHistory, apiConfiguration } = useExtensionState()

	// Get the first message as the task
	const task = useMemo(() => messages.at(0), [messages])

	// Modified messages (combining sequences, etc.)
	const modifiedMessages = useMemo(() => {
		// In the webview version, this uses combineApiRequests and combineCommandSequences
		// For simplicity, we'll just return the messages without the task
		return messages.slice(1)
	}, [messages])

	// Visible messages (excluding the task)
	const visibleMessages = useMemo(() => {
		return modifiedMessages.filter((message) => {
			// Filter out messages that shouldn't be displayed
			if (message.type === "ask") {
				switch (message.ask) {
					case "completion_result":
						// Don't show empty completion results
						if (message.text === "") {
							return false
						}
						break
					case "api_req_failed":
					case "resume_task":
					case "resume_completed_task":
						return false
				}
			}

			if (message.type === "say") {
				switch (message.say) {
					case "api_req_finished":
					case "api_req_retried":
					case "deleted_api_reqs":
						return false
					case "text":
						// Don't show empty text messages without images
						if ((message.text ?? "") === "" && (message.images?.length ?? 0) === 0) {
							return false
						}
						break
					case "mcp_server_request_started":
						return false
				}
			}

			return true
		})
	}, [modifiedMessages])

	const [inputValue, setInputValue] = useState("")
	const textAreaRef = useRef<HTMLTextAreaElement>(null)
	const [textAreaDisabled, setTextAreaDisabled] = useState(false)
	const [selectedImages, setSelectedImages] = useState<string[]>([])

	// State for handling ask messages
	const [clineAsk, setClineAsk] = useState<string | undefined>(undefined)
	const [enableButtons, setEnableButtons] = useState<boolean>(false)
	const [primaryButtonText, setPrimaryButtonText] = useState<string | undefined>("Approve")
	const [secondaryButtonText, setSecondaryButtonText] = useState<string | undefined>("Reject")
	const [didClickCancel, setDidClickCancel] = useState(false)

	// Virtuoso list refs and state
	const virtuosoRef = useRef<VirtuosoHandle>(null)
	const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({})
	const scrollContainerRef = useRef<HTMLDivElement>(null)
	const disableAutoScrollRef = useRef(false)
	const [showScrollToBottom, setShowScrollToBottom] = useState(false)
	const [isAtBottom, setIsAtBottom] = useState(false)

	// UI layout depends on the last 2 messages
	const lastMessage = useMemo(() => messages.at(-1), [messages])
	const secondLastMessage = useMemo(() => messages.at(-2), [messages])

	useEffect(() => {
		if (lastMessage) {
			switch (lastMessage.type) {
				case "ask":
					const isPartial = lastMessage.partial === true
					switch (lastMessage.ask) {
						case "api_req_failed":
							setTextAreaDisabled(true)
							setClineAsk("api_req_failed")
							setEnableButtons(true)
							setPrimaryButtonText("Retry")
							setSecondaryButtonText("Start New Task")
							break
						case "mistake_limit_reached":
							setTextAreaDisabled(false)
							setClineAsk("mistake_limit_reached")
							setEnableButtons(true)
							setPrimaryButtonText("Proceed Anyways")
							setSecondaryButtonText("Start New Task")
							break
						case "auto_approval_max_req_reached":
							setTextAreaDisabled(true)
							setClineAsk("auto_approval_max_req_reached")
							setEnableButtons(true)
							setPrimaryButtonText("Proceed")
							setSecondaryButtonText("Start New Task")
							break
						case "followup":
							setTextAreaDisabled(isPartial)
							setClineAsk("followup")
							setEnableButtons(false)
							break
						case "plan_mode_response":
							setTextAreaDisabled(isPartial)
							setClineAsk("plan_mode_response")
							setEnableButtons(false)
							break
						case "tool":
							setTextAreaDisabled(isPartial)
							setClineAsk("tool")
							setEnableButtons(!isPartial)
							if (lastMessage.text) {
								try {
									const tool = JSON.parse(lastMessage.text)
									switch (tool.tool) {
										case "editedExistingFile":
										case "newFileCreated":
											setPrimaryButtonText("Save")
											setSecondaryButtonText("Reject")
											break
										default:
											setPrimaryButtonText("Approve")
											setSecondaryButtonText("Reject")
											break
									}
								} catch (e) {
									setPrimaryButtonText("Approve")
									setSecondaryButtonText("Reject")
								}
							}
							break
						case "browser_action_launch":
							setTextAreaDisabled(isPartial)
							setClineAsk("browser_action_launch")
							setEnableButtons(!isPartial)
							setPrimaryButtonText("Approve")
							setSecondaryButtonText("Reject")
							break
						case "command":
							setTextAreaDisabled(isPartial)
							setClineAsk("command")
							setEnableButtons(!isPartial)
							setPrimaryButtonText("Run Command")
							setSecondaryButtonText("Reject")
							break
						case "command_output":
							setTextAreaDisabled(false)
							setClineAsk("command_output")
							setEnableButtons(true)
							setPrimaryButtonText("Proceed While Running")
							setSecondaryButtonText(undefined)
							break
						case "use_mcp_server":
							setTextAreaDisabled(isPartial)
							setClineAsk("use_mcp_server")
							setEnableButtons(!isPartial)
							setPrimaryButtonText("Approve")
							setSecondaryButtonText("Reject")
							break
						case "completion_result":
							setTextAreaDisabled(isPartial)
							setClineAsk("completion_result")
							setEnableButtons(!isPartial)
							setPrimaryButtonText("Start New Task")
							setSecondaryButtonText(undefined)
							break
						case "resume_task":
							setTextAreaDisabled(false)
							setClineAsk("resume_task")
							setEnableButtons(true)
							setPrimaryButtonText("Resume Task")
							setSecondaryButtonText(undefined)
							setDidClickCancel(false)
							break
						case "resume_completed_task":
							setTextAreaDisabled(false)
							setClineAsk("resume_completed_task")
							setEnableButtons(true)
							setPrimaryButtonText("Start New Task")
							setSecondaryButtonText(undefined)
							setDidClickCancel(false)
							break
					}
					break
				case "say":
					switch (lastMessage.say) {
						case "api_req_started":
							if (secondLastMessage?.ask === "command_output") {
								setInputValue("")
								setTextAreaDisabled(true)
								setSelectedImages([])
								setClineAsk(undefined)
								setEnableButtons(false)
							}
							break
					}
					break
			}
		} else {
			// No messages, reset state
		}
	}, [lastMessage, secondLastMessage])

	useEffect(() => {
		if (messages.length === 0) {
			setTextAreaDisabled(false)
			setClineAsk(undefined)
			setEnableButtons(false)
			setPrimaryButtonText("Approve")
			setSecondaryButtonText("Reject")
		}
	}, [messages.length])

	useEffect(() => {
		setExpandedRows({})
	}, [task?.ts])

	// Determine if we're streaming content
	const isStreaming = useMemo(() => {
		const isLastAsk = !!modifiedMessages.at(-1)?.ask
		const isToolCurrentlyAsking = isLastAsk && clineAsk !== undefined && enableButtons && primaryButtonText !== undefined

		if (isToolCurrentlyAsking) {
			return false
		}

		const isLastMessagePartial = modifiedMessages.at(-1)?.partial === true
		if (isLastMessagePartial) {
			return true
		}

		return false
	}, [modifiedMessages, clineAsk, enableButtons, primaryButtonText])

	// Current task ID
	const [currentTaskId, setCurrentTaskId] = useState<string | null>(null)

	// Get current task ID from the first message
	useEffect(() => {
		if (task && messages.length > 0) {
			// In a real implementation, we would get the task ID from the state
			// For now, we'll use a placeholder or timestamp as ID
			const taskId = task.ts.toString() || "current-task"
			setCurrentTaskId(taskId)
		} else {
			setCurrentTaskId(null)
		}
	}, [task, messages])

	// Handle sending a message
	const handleSendMessage = useCallback(
		async (text: string, images: string[]) => {
			text = text.trim()
			if (text || images.length > 0) {
				try {
					if (messages.length === 0) {
						console.log("New task:", text, images)
						// Initialize a new task
						const taskId = await apiClient.initTask(text, images)
						setCurrentTaskId(taskId)
					} else if (clineAsk && currentTaskId) {
						switch (clineAsk) {
							case "followup":
							case "plan_mode_response":
							case "tool":
							case "browser_action_launch":
							case "command":
							case "command_output":
							case "use_mcp_server":
							case "completion_result":
							case "resume_task":
							case "resume_completed_task":
							case "mistake_limit_reached":
								console.log("Message response:", text, images)
								// Send the response to the API
								await apiClient.handleResponse(currentTaskId, "messageResponse", text, images)
								break
						}
					}

					// Clear input state
					setInputValue("")
					setTextAreaDisabled(true)
					setSelectedImages([])
					setClineAsk(undefined)
					setEnableButtons(false)
					disableAutoScrollRef.current = false
				} catch (error) {
					console.error("Failed to send message:", error)
					// Handle error (could show a notification)
				}
			}
		},
		[messages.length, clineAsk, currentTaskId],
	)

	// Start a new task
	const startNewTask = useCallback(async () => {
		console.log("Starting new task")
		try {
			// Post a message to clear the task
			await apiClient.postMessage({ type: "clearTask" })
			setCurrentTaskId(null)
		} catch (error) {
			console.error("Failed to start new task:", error)
		}
	}, [])

	// Handle primary button click
	const handlePrimaryButtonClick = useCallback(
		async (text?: string, images?: string[]) => {
			if (!currentTaskId) return

			const trimmedInput = text?.trim()
			try {
				switch (clineAsk) {
					case "api_req_failed":
					case "command":
					case "command_output":
					case "tool":
					case "browser_action_launch":
					case "use_mcp_server":
					case "resume_task":
					case "mistake_limit_reached":
					case "auto_approval_max_req_reached":
						if (trimmedInput || (images && images?.length > 0)) {
							console.log("Yes button clicked with input:", trimmedInput, images)
							await apiClient.handleResponse(currentTaskId, "yesButtonClicked", trimmedInput, images)
						} else {
							console.log("Yes button clicked")
							await apiClient.handleResponse(currentTaskId, "yesButtonClicked")
						}
						break
					case "completion_result":
					case "resume_completed_task":
						await startNewTask()
						break
				}

				// Clear input state
				setInputValue("")
				setSelectedImages([])
				setTextAreaDisabled(true)
				setClineAsk(undefined)
				setEnableButtons(false)
				disableAutoScrollRef.current = false
			} catch (error) {
				console.error("Failed to handle primary button click:", error)
			}
		},
		[clineAsk, startNewTask, currentTaskId],
	)

	// Handle secondary button click
	const handleSecondaryButtonClick = useCallback(
		async (text?: string, images?: string[]) => {
			if (
				!currentTaskId &&
				clineAsk !== "api_req_failed" &&
				clineAsk !== "mistake_limit_reached" &&
				clineAsk !== "auto_approval_max_req_reached"
			)
				return

			const trimmedInput = text?.trim()

			try {
				if (isStreaming) {
					console.log("Cancel task")
					await apiClient.cancelTask(currentTaskId!)
					setDidClickCancel(true)
					return
				}

				switch (clineAsk) {
					case "api_req_failed":
					case "mistake_limit_reached":
					case "auto_approval_max_req_reached":
						await startNewTask()
						break
					case "command":
					case "tool":
					case "browser_action_launch":
					case "use_mcp_server":
						if (trimmedInput || (images && images?.length > 0)) {
							console.log("No button clicked with input:", trimmedInput, images)
							await apiClient.handleResponse(currentTaskId!, "noButtonClicked", trimmedInput, images)
						} else {
							console.log("No button clicked")
							await apiClient.handleResponse(currentTaskId!, "noButtonClicked")
						}
						break
				}

				// Clear input state
				setInputValue("")
				setSelectedImages([])
				setTextAreaDisabled(true)
				setClineAsk(undefined)
				setEnableButtons(false)
				disableAutoScrollRef.current = false
			} catch (error) {
				console.error("Failed to handle secondary button click:", error)
			}
		},
		[clineAsk, startNewTask, isStreaming, currentTaskId],
	)

	// Handle task close button click
	const handleTaskCloseButtonClick = useCallback(() => {
		startNewTask()
	}, [startNewTask])

	// Scrolling functions
	const scrollToBottomSmooth = useMemo(
		() =>
			debounce(
				() => {
					virtuosoRef.current?.scrollTo({
						top: Number.MAX_SAFE_INTEGER,
						behavior: "smooth",
					})
				},
				10,
				{ immediate: true },
			),
		[],
	)

	const scrollToBottomAuto = useCallback(() => {
		virtuosoRef.current?.scrollTo({
			top: Number.MAX_SAFE_INTEGER,
			behavior: "auto",
		})
	}, [])

	// Toggle row expansion
	const toggleRowExpansion = useCallback(
		(ts: number) => {
			const isCollapsing = expandedRows[ts] ?? false
			const lastGroup = visibleMessages.at(-1)
			const isLast = lastGroup?.ts === ts
			const secondToLastGroup = visibleMessages.at(-2)
			const isSecondToLast = secondToLastGroup?.ts === ts

			setExpandedRows((prev) => ({
				...prev,
				[ts]: !prev[ts],
			}))

			// Disable auto scroll when user expands row
			if (!isCollapsing) {
				disableAutoScrollRef.current = true
			}

			if (isCollapsing && isAtBottom) {
				const timer = setTimeout(() => {
					scrollToBottomAuto()
				}, 0)
				return () => clearTimeout(timer)
			} else if (isLast || isSecondToLast) {
				if (isCollapsing) {
					const timer = setTimeout(() => {
						scrollToBottomAuto()
					}, 0)
					return () => clearTimeout(timer)
				} else {
					const timer = setTimeout(() => {
						virtuosoRef.current?.scrollToIndex({
							index: visibleMessages.length - (isLast ? 1 : 2),
							align: "start",
						})
					}, 0)
					return () => clearTimeout(timer)
				}
			}
		},
		[expandedRows, visibleMessages, scrollToBottomAuto, isAtBottom],
	)

	// Handle row height changes
	const handleRowHeightChange = useCallback(
		(isTaller: boolean) => {
			if (!disableAutoScrollRef.current) {
				if (isTaller) {
					scrollToBottomSmooth()
				} else {
					setTimeout(() => {
						scrollToBottomAuto()
					}, 0)
				}
			}
		},
		[scrollToBottomSmooth, scrollToBottomAuto],
	)

	// Auto-scroll when messages change
	useEffect(() => {
		if (!disableAutoScrollRef.current) {
			setTimeout(() => {
				scrollToBottomSmooth()
			}, 50)
		}
	}, [visibleMessages.length, scrollToBottomSmooth])

	// Handle wheel events to disable auto-scroll
	useEffect(() => {
		const handleWheel = (event: WheelEvent) => {
			if (event.deltaY && event.deltaY < 0) {
				if (scrollContainerRef.current?.contains(event.target as Node)) {
					disableAutoScrollRef.current = true
				}
			}
		}

		window.addEventListener("wheel", handleWheel, { passive: true })
		return () => {
			window.removeEventListener("wheel", handleWheel)
		}
	}, [])

	// Placeholder text for the text area
	const placeholderText = useMemo(() => {
		return task ? "Type a message..." : "Type your task here..."
	}, [task])

	// Render each message in the virtuoso list
	const itemContent = useCallback(
		(index: number, message: ClineMessage) => {
			return (
				<ChatRow
					key={message.ts}
					message={message}
					isExpanded={expandedRows[message.ts] || false}
					onToggleExpand={() => toggleRowExpansion(message.ts)}
					lastModifiedMessage={modifiedMessages.at(-1)}
					isLast={index === visibleMessages.length - 1}
					onHeightChange={handleRowHeightChange}
				/>
			)
		},
		[expandedRows, modifiedMessages, visibleMessages.length, toggleRowExpansion, handleRowHeightChange],
	)

	return (
		<div
			style={{
				position: "fixed",
				top: 0,
				left: 0,
				right: 0,
				bottom: 0,
				display: isHidden ? "none" : "flex",
				flexDirection: "column",
				overflow: "hidden",
			}}>
			{task ? (
				<TaskHeader
					task={task}
					tokensIn={0}
					tokensOut={0}
					doesModelSupportPromptCache={false}
					cacheWrites={0}
					cacheReads={0}
					totalCost={0}
					lastApiReqTotalTokens={0}
					onClose={handleTaskCloseButtonClick}
				/>
			) : (
				<div
					style={{
						flex: "1 1 0",
						minHeight: 0,
						overflowY: "auto",
						display: "flex",
						flexDirection: "column",
						paddingBottom: "10px",
					}}>
					<div style={{ padding: "0 20px", flexShrink: 0 }}>
						<h2>What can I do for you?</h2>
						<p>
							I can handle complex software development tasks step-by-step. With tools that let me create & edit
							files, explore complex projects, use the browser, and execute terminal commands, I can assist you in
							ways that go beyond code completion or tech support.
						</p>
					</div>
				</div>
			)}

			{task && (
				<>
					<div style={{ flexGrow: 1, display: "flex" }} ref={scrollContainerRef}>
						<Virtuoso
							ref={virtuosoRef}
							key={task.ts}
							className="scrollable"
							style={{
								flexGrow: 1,
								overflowY: "scroll",
							}}
							components={{
								Footer: () => <div style={{ height: 5 }} />,
							}}
							increaseViewportBy={{
								top: 3000,
								bottom: Number.MAX_SAFE_INTEGER,
							}}
							data={visibleMessages}
							itemContent={itemContent}
							atBottomStateChange={(isAtBottom) => {
								setIsAtBottom(isAtBottom)
								if (isAtBottom) {
									disableAutoScrollRef.current = false
								}
								setShowScrollToBottom(disableAutoScrollRef.current && !isAtBottom)
							}}
							atBottomThreshold={10}
							initialTopMostItemIndex={visibleMessages.length - 1}
						/>
					</div>

					{showScrollToBottom ? (
						<div
							style={{
								display: "flex",
								padding: "10px 15px 0px 15px",
							}}>
							<ScrollToBottomButton
								onClick={() => {
									scrollToBottomSmooth()
									disableAutoScrollRef.current = false
								}}>
								<span className="codicon codicon-chevron-down" style={{ fontSize: "18px" }}></span>
							</ScrollToBottomButton>
						</div>
					) : (
						<div
							style={{
								opacity: primaryButtonText || secondaryButtonText ? (enableButtons ? 1 : 0.5) : 0,
								display: "flex",
								padding: `${primaryButtonText || secondaryButtonText ? "10" : "0"}px 15px 0px 15px`,
							}}>
							{primaryButtonText && (
								<VSCodeButton
									appearance="primary"
									disabled={!enableButtons}
									style={{
										flex: secondaryButtonText ? 1 : 2,
										marginRight: secondaryButtonText ? "6px" : "0",
									}}
									onClick={() => handlePrimaryButtonClick(inputValue, selectedImages)}>
									{primaryButtonText}
								</VSCodeButton>
							)}
							{secondaryButtonText && (
								<VSCodeButton
									appearance="secondary"
									disabled={!enableButtons}
									style={{
										flex: 1,
										marginLeft: "6px",
									}}
									onClick={() => handleSecondaryButtonClick(inputValue, selectedImages)}>
									{secondaryButtonText}
								</VSCodeButton>
							)}
						</div>
					)}
				</>
			)}
			<ChatTextArea
				ref={textAreaRef}
				inputValue={inputValue}
				setInputValue={setInputValue}
				textAreaDisabled={textAreaDisabled}
				placeholderText={placeholderText}
				selectedImages={selectedImages}
				setSelectedImages={setSelectedImages}
				onSend={() => handleSendMessage(inputValue, selectedImages)}
				onSelectImages={() => console.log("Select images")}
				shouldDisableImages={false}
				onHeightChange={() => {
					if (isAtBottom) {
						scrollToBottomAuto()
					}
				}}
			/>
		</div>
	)
}

const ScrollToBottomButton = styled.div`
	background-color: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 55%, transparent);
	border-radius: 3px;
	overflow: hidden;
	cursor: pointer;
	display: flex;
	justify-content: center;
	align-items: center;
	flex: 1;
	height: 25px;

	&:hover {
		background-color: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 90%, transparent);
	}

	&:active {
		background-color: color-mix(in srgb, var(--vscode-toolbar-hoverBackground) 70%, transparent);
	}
`

export default ChatView

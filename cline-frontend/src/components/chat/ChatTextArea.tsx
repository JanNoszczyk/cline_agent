import React, { forwardRef, useCallback, useEffect, useRef, useState } from "react"
import styled from "styled-components"
import { VSCodeButton } from "@vscode/webview-ui-toolkit/react"

interface ChatTextAreaProps {
	inputValue: string
	setInputValue: (value: string) => void
	textAreaDisabled: boolean
	placeholderText: string
	selectedImages: string[]
	setSelectedImages: (images: string[]) => void
	onSend: () => void
	onSelectImages: () => void
	shouldDisableImages: boolean
	onHeightChange: () => void
}

const TextAreaContainer = styled.div`
	position: relative;
	padding: 10px 15px 15px 15px;
	border-top: 1px solid var(--vscode-editorGroup-border);
	background-color: var(--vscode-editor-background);
`

const StyledTextArea = styled.textarea<{ $hasImages: boolean }>`
	width: 100%;
	resize: none;
	border: 1px solid var(--vscode-editorGroup-border);
	border-radius: 3px;
	background-color: var(--vscode-editor-background);
	color: var(--vscode-editor-foreground);
	font-family: inherit;
	font-size: 14px;
	padding: 8px 40px 8px 8px;
	outline: none;

	&:focus {
		border-color: var(--vscode-button-background);
	}

	&:disabled {
		opacity: 0.7;
		cursor: not-allowed;
	}

	${(props) =>
		props.$hasImages &&
		`
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
  `}
`

const SendButton = styled.div<{ disabled: boolean }>`
	position: absolute;
	right: 23px;
	bottom: 23px;
	width: 24px;
	height: 24px;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: ${(props) => (props.disabled ? "not-allowed" : "pointer")};
	opacity: ${(props) => (props.disabled ? 0.5 : 1)};
	border-radius: 3px;

	&:hover {
		background-color: ${(props) => !props.disabled && "var(--vscode-toolbar-hoverBackground)"};
	}
`

const ImagesContainer = styled.div`
	display: flex;
	flex-wrap: wrap;
	gap: 8px;
	padding: 8px;
	background-color: var(--vscode-editor-background);
	border: 1px solid var(--vscode-editorGroup-border);
	border-top: none;
	border-bottom-left-radius: 3px;
	border-bottom-right-radius: 3px;
`

const ImageThumbnail = styled.div`
	position: relative;
	width: 60px;
	height: 60px;
	border-radius: 3px;
	overflow: hidden;

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
`

const RemoveImageButton = styled.div`
	position: absolute;
	top: 2px;
	right: 2px;
	width: 16px;
	height: 16px;
	background-color: rgba(0, 0, 0, 0.6);
	color: white;
	border-radius: 50%;
	display: flex;
	align-items: center;
	justify-content: center;
	cursor: pointer;
	font-size: 10px;

	&:hover {
		background-color: rgba(0, 0, 0, 0.8);
	}
`

const AddImageButton = styled(VSCodeButton)`
	height: 60px;
	width: 60px;
	padding: 0;
	display: flex;
	align-items: center;
	justify-content: center;

	span {
		font-size: 20px;
	}
`

const ChatTextArea = forwardRef<HTMLTextAreaElement, ChatTextAreaProps>(
	(
		{
			inputValue,
			setInputValue,
			textAreaDisabled,
			placeholderText,
			selectedImages,
			setSelectedImages,
			onSend,
			onSelectImages,
			shouldDisableImages,
			onHeightChange,
		},
		ref,
	) => {
		const [textAreaHeight, setTextAreaHeight] = useState(36)
		const textAreaRef = useRef<HTMLTextAreaElement | null>(null)

		// Forward the ref
		useEffect(() => {
			if (ref) {
				if (typeof ref === "function") {
					ref(textAreaRef.current)
				} else {
					ref.current = textAreaRef.current
				}
			}
		}, [ref])

		// Auto-resize the textarea
		const adjustTextAreaHeight = useCallback(() => {
			const textarea = textAreaRef.current
			if (textarea) {
				textarea.style.height = "auto"
				const newHeight = Math.min(Math.max(36, textarea.scrollHeight), 200)

				if (newHeight !== textAreaHeight) {
					setTextAreaHeight(newHeight)
					onHeightChange()
				}

				textarea.style.height = `${newHeight}px`
			}
		}, [textAreaHeight, onHeightChange])

		useEffect(() => {
			adjustTextAreaHeight()
		}, [inputValue, adjustTextAreaHeight])

		// Handle key press events
		const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault()
				if (inputValue.trim() || selectedImages.length > 0) {
					onSend()
				}
			}
		}

		// Handle input change
		const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setInputValue(e.target.value)
		}

		// Handle removing an image
		const handleRemoveImage = (index: number) => {
			setSelectedImages(selectedImages.filter((_, i) => i !== index))
		}

		return (
			<TextAreaContainer>
				<StyledTextArea
					ref={textAreaRef}
					value={inputValue}
					onChange={handleInputChange}
					onKeyDown={handleKeyDown}
					disabled={textAreaDisabled}
					placeholder={placeholderText}
					$hasImages={selectedImages.length > 0}
					style={{ height: `${textAreaHeight}px` }}
				/>

				<SendButton
					disabled={textAreaDisabled || (!inputValue.trim() && selectedImages.length === 0)}
					onClick={() => {
						if (!textAreaDisabled && (inputValue.trim() || selectedImages.length > 0)) {
							onSend()
						}
					}}>
					<span className="codicon codicon-send"></span>
				</SendButton>

				{selectedImages.length > 0 && (
					<ImagesContainer>
						{selectedImages.map((image, index) => (
							<ImageThumbnail key={index}>
								<img src={image} alt={`Selected ${index}`} />
								<RemoveImageButton onClick={() => handleRemoveImage(index)}>
									<span className="codicon codicon-close"></span>
								</RemoveImageButton>
							</ImageThumbnail>
						))}

						{!shouldDisableImages && (
							<AddImageButton appearance="secondary" onClick={onSelectImages} disabled={textAreaDisabled}>
								<span className="codicon codicon-add"></span>
							</AddImageButton>
						)}
					</ImagesContainer>
				)}

				{selectedImages.length === 0 && !shouldDisableImages && (
					<div style={{ marginTop: "8px" }}>
						<VSCodeButton appearance="secondary" onClick={onSelectImages} disabled={textAreaDisabled}>
							<span className="codicon codicon-image" style={{ marginRight: "6px" }}></span>
							Add Image
						</VSCodeButton>
					</div>
				)}
			</TextAreaContainer>
		)
	},
)

export default ChatTextArea

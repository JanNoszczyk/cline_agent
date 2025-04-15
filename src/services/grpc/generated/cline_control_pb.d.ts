// package: clinecontrol
// file: cline_control.proto

import * as jspb from "google-protobuf"
import * as google_protobuf_timestamp_pb from "google-protobuf/google/protobuf/timestamp_pb"
import * as google_protobuf_struct_pb from "google-protobuf/google/protobuf/struct_pb"

export class CommandRequest extends jspb.Message {
	getRequestId(): string
	setRequestId(value: string): void

	hasStartTask(): boolean
	clearStartTask(): void
	getStartTask(): StartTaskCommand | undefined
	setStartTask(value?: StartTaskCommand): void

	hasUserInput(): boolean
	clearUserInput(): void
	getUserInput(): UserInputCommmand | undefined
	setUserInput(value?: UserInputCommmand): void

	hasToolApproval(): boolean
	clearToolApproval(): void
	getToolApproval(): ToolApprovalCommand | undefined
	setToolApproval(value?: ToolApprovalCommand): void

	hasRequestInitialState(): boolean
	clearRequestInitialState(): void
	getRequestInitialState(): RequestInitialState | undefined
	setRequestInitialState(value?: RequestInitialState): void

	hasCancelTask(): boolean
	clearCancelTask(): void
	getCancelTask(): CancelTaskCommand | undefined
	setCancelTask(value?: CancelTaskCommand): void

	getCommandCase(): CommandRequest.CommandCase
	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): CommandRequest.AsObject
	static toObject(includeInstance: boolean, msg: CommandRequest): CommandRequest.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: CommandRequest, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): CommandRequest
	static deserializeBinaryFromReader(message: CommandRequest, reader: jspb.BinaryReader): CommandRequest
}

export namespace CommandRequest {
	export type AsObject = {
		requestId: string
		startTask?: StartTaskCommand.AsObject
		userInput?: UserInputCommmand.AsObject
		toolApproval?: ToolApprovalCommand.AsObject
		requestInitialState?: RequestInitialState.AsObject
		cancelTask?: CancelTaskCommand.AsObject
	}

	export enum CommandCase {
		COMMAND_NOT_SET = 0,
		START_TASK = 2,
		USER_INPUT = 3,
		TOOL_APPROVAL = 4,
		REQUEST_INITIAL_STATE = 5,
		CANCEL_TASK = 6,
	}
}

export class StartTaskCommand extends jspb.Message {
	getInitialPrompt(): string
	setInitialPrompt(value: string): void

	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): StartTaskCommand.AsObject
	static toObject(includeInstance: boolean, msg: StartTaskCommand): StartTaskCommand.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: StartTaskCommand, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): StartTaskCommand
	static deserializeBinaryFromReader(message: StartTaskCommand, reader: jspb.BinaryReader): StartTaskCommand
}

export namespace StartTaskCommand {
	export type AsObject = {
		initialPrompt: string
	}
}

export class UserInputCommmand extends jspb.Message {
	getText(): string
	setText(value: string): void

	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): UserInputCommmand.AsObject
	static toObject(includeInstance: boolean, msg: UserInputCommmand): UserInputCommmand.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: UserInputCommmand, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): UserInputCommmand
	static deserializeBinaryFromReader(message: UserInputCommmand, reader: jspb.BinaryReader): UserInputCommmand
}

export namespace UserInputCommmand {
	export type AsObject = {
		text: string
	}
}

export class ToolApprovalCommand extends jspb.Message {
	getToolCallId(): string
	setToolCallId(value: string): void

	getApproved(): boolean
	setApproved(value: boolean): void

	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): ToolApprovalCommand.AsObject
	static toObject(includeInstance: boolean, msg: ToolApprovalCommand): ToolApprovalCommand.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: ToolApprovalCommand, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): ToolApprovalCommand
	static deserializeBinaryFromReader(message: ToolApprovalCommand, reader: jspb.BinaryReader): ToolApprovalCommand
}

export namespace ToolApprovalCommand {
	export type AsObject = {
		toolCallId: string
		approved: boolean
	}
}

export class RequestInitialState extends jspb.Message {
	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): RequestInitialState.AsObject
	static toObject(includeInstance: boolean, msg: RequestInitialState): RequestInitialState.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: RequestInitialState, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): RequestInitialState
	static deserializeBinaryFromReader(message: RequestInitialState, reader: jspb.BinaryReader): RequestInitialState
}

export namespace RequestInitialState {
	export type AsObject = {}
}

export class CancelTaskCommand extends jspb.Message {
	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): CancelTaskCommand.AsObject
	static toObject(includeInstance: boolean, msg: CancelTaskCommand): CancelTaskCommand.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: CancelTaskCommand, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): CancelTaskCommand
	static deserializeBinaryFromReader(message: CancelTaskCommand, reader: jspb.BinaryReader): CancelTaskCommand
}

export namespace CancelTaskCommand {
	export type AsObject = {}
}

export class UpdateResponse extends jspb.Message {
	getResponseToRequestId(): string
	setResponseToRequestId(value: string): void

	hasInitialState(): boolean
	clearInitialState(): void
	getInitialState(): InitialStateUpdate | undefined
	setInitialState(value?: InitialStateUpdate): void

	hasAddMessage(): boolean
	clearAddMessage(): void
	getAddMessage(): AddMessageUpdate | undefined
	setAddMessage(value?: AddMessageUpdate): void

	hasPartialMessage(): boolean
	clearPartialMessage(): void
	getPartialMessage(): PartialMessageUpdate | undefined
	setPartialMessage(value?: PartialMessageUpdate): void

	hasErrorUpdate(): boolean
	clearErrorUpdate(): void
	getErrorUpdate(): ErrorUpdate | undefined
	setErrorUpdate(value?: ErrorUpdate): void

	hasTaskState(): boolean
	clearTaskState(): void
	getTaskState(): TaskStateUpdate | undefined
	setTaskState(value?: TaskStateUpdate): void

	hasToolApprovalRequest(): boolean
	clearToolApprovalRequest(): void
	getToolApprovalRequest(): ToolApprovalRequest | undefined
	setToolApprovalRequest(value?: ToolApprovalRequest): void

	getUpdateCase(): UpdateResponse.UpdateCase
	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): UpdateResponse.AsObject
	static toObject(includeInstance: boolean, msg: UpdateResponse): UpdateResponse.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: UpdateResponse, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): UpdateResponse
	static deserializeBinaryFromReader(message: UpdateResponse, reader: jspb.BinaryReader): UpdateResponse
}

export namespace UpdateResponse {
	export type AsObject = {
		responseToRequestId: string
		initialState?: InitialStateUpdate.AsObject
		addMessage?: AddMessageUpdate.AsObject
		partialMessage?: PartialMessageUpdate.AsObject
		errorUpdate?: ErrorUpdate.AsObject
		taskState?: TaskStateUpdate.AsObject
		toolApprovalRequest?: ToolApprovalRequest.AsObject
	}

	export enum UpdateCase {
		UPDATE_NOT_SET = 0,
		INITIAL_STATE = 2,
		ADD_MESSAGE = 3,
		PARTIAL_MESSAGE = 4,
		ERROR_UPDATE = 5,
		TASK_STATE = 6,
		TOOL_APPROVAL_REQUEST = 7,
	}
}

export class InitialStateUpdate extends jspb.Message {
	getExtensionVersion(): string
	setExtensionVersion(value: string): void

	clearMessagesList(): void
	getMessagesList(): Array<ClineMessage>
	setMessagesList(value: Array<ClineMessage>): void
	addMessages(value?: ClineMessage, index?: number): ClineMessage

	hasSettings(): boolean
	clearSettings(): void
	getSettings(): google_protobuf_struct_pb.Struct | undefined
	setSettings(value?: google_protobuf_struct_pb.Struct): void

	getCurrentTaskStatus(): string
	setCurrentTaskStatus(value: string): void

	getCurrentTaskId(): string
	setCurrentTaskId(value: string): void

	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): InitialStateUpdate.AsObject
	static toObject(includeInstance: boolean, msg: InitialStateUpdate): InitialStateUpdate.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: InitialStateUpdate, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): InitialStateUpdate
	static deserializeBinaryFromReader(message: InitialStateUpdate, reader: jspb.BinaryReader): InitialStateUpdate
}

export namespace InitialStateUpdate {
	export type AsObject = {
		extensionVersion: string
		messagesList: Array<ClineMessage.AsObject>
		settings?: google_protobuf_struct_pb.Struct.AsObject
		currentTaskStatus: string
		currentTaskId: string
	}
}

export class AddMessageUpdate extends jspb.Message {
	hasMessage(): boolean
	clearMessage(): void
	getMessage(): ClineMessage | undefined
	setMessage(value?: ClineMessage): void

	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): AddMessageUpdate.AsObject
	static toObject(includeInstance: boolean, msg: AddMessageUpdate): AddMessageUpdate.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: AddMessageUpdate, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): AddMessageUpdate
	static deserializeBinaryFromReader(message: AddMessageUpdate, reader: jspb.BinaryReader): AddMessageUpdate
}

export namespace AddMessageUpdate {
	export type AsObject = {
		message?: ClineMessage.AsObject
	}
}

export class PartialMessageUpdate extends jspb.Message {
	getMessageId(): string
	setMessageId(value: string): void

	getTextChunk(): string
	setTextChunk(value: string): void

	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): PartialMessageUpdate.AsObject
	static toObject(includeInstance: boolean, msg: PartialMessageUpdate): PartialMessageUpdate.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: PartialMessageUpdate, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): PartialMessageUpdate
	static deserializeBinaryFromReader(message: PartialMessageUpdate, reader: jspb.BinaryReader): PartialMessageUpdate
}

export namespace PartialMessageUpdate {
	export type AsObject = {
		messageId: string
		textChunk: string
	}
}

export class ErrorUpdate extends jspb.Message {
	getMessage(): string
	setMessage(value: string): void

	hasDetails(): boolean
	clearDetails(): void
	getDetails(): string
	setDetails(value: string): void

	getErrorType(): string
	setErrorType(value: string): void

	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): ErrorUpdate.AsObject
	static toObject(includeInstance: boolean, msg: ErrorUpdate): ErrorUpdate.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: ErrorUpdate, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): ErrorUpdate
	static deserializeBinaryFromReader(message: ErrorUpdate, reader: jspb.BinaryReader): ErrorUpdate
}

export namespace ErrorUpdate {
	export type AsObject = {
		message: string
		details: string
		errorType: string
	}
}

export class TaskStateUpdate extends jspb.Message {
	getStatus(): string
	setStatus(value: string): void

	hasTaskId(): boolean
	clearTaskId(): void
	getTaskId(): string
	setTaskId(value: string): void

	hasMessage(): boolean
	clearMessage(): void
	getMessage(): string
	setMessage(value: string): void

	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): TaskStateUpdate.AsObject
	static toObject(includeInstance: boolean, msg: TaskStateUpdate): TaskStateUpdate.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: TaskStateUpdate, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): TaskStateUpdate
	static deserializeBinaryFromReader(message: TaskStateUpdate, reader: jspb.BinaryReader): TaskStateUpdate
}

export namespace TaskStateUpdate {
	export type AsObject = {
		status: string
		taskId: string
		message: string
	}
}

export class ToolApprovalRequest extends jspb.Message {
	getToolCallId(): string
	setToolCallId(value: string): void

	getToolName(): string
	setToolName(value: string): void

	getToolInputJson(): string
	setToolInputJson(value: string): void

	getMessage(): string
	setMessage(value: string): void

	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): ToolApprovalRequest.AsObject
	static toObject(includeInstance: boolean, msg: ToolApprovalRequest): ToolApprovalRequest.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: ToolApprovalRequest, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): ToolApprovalRequest
	static deserializeBinaryFromReader(message: ToolApprovalRequest, reader: jspb.BinaryReader): ToolApprovalRequest
}

export namespace ToolApprovalRequest {
	export type AsObject = {
		toolCallId: string
		toolName: string
		toolInputJson: string
		message: string
	}
}

export class ClineMessage extends jspb.Message {
	getId(): string
	setId(value: string): void

	getRole(): string
	setRole(value: string): void

	getType(): string
	setType(value: string): void

	hasTimestamp(): boolean
	clearTimestamp(): void
	getTimestamp(): google_protobuf_timestamp_pb.Timestamp | undefined
	setTimestamp(value?: google_protobuf_timestamp_pb.Timestamp): void

	hasContent(): boolean
	clearContent(): void
	getContent(): google_protobuf_struct_pb.Struct | undefined
	setContent(value?: google_protobuf_struct_pb.Struct): void

	serializeBinary(): Uint8Array
	toObject(includeInstance?: boolean): ClineMessage.AsObject
	static toObject(includeInstance: boolean, msg: ClineMessage): ClineMessage.AsObject
	static extensions: { [key: number]: jspb.ExtensionFieldInfo<jspb.Message> }
	static extensionsBinary: { [key: number]: jspb.ExtensionFieldBinaryInfo<jspb.Message> }
	static serializeBinaryToWriter(message: ClineMessage, writer: jspb.BinaryWriter): void
	static deserializeBinary(bytes: Uint8Array): ClineMessage
	static deserializeBinaryFromReader(message: ClineMessage, reader: jspb.BinaryReader): ClineMessage
}

export namespace ClineMessage {
	export type AsObject = {
		id: string
		role: string
		type: string
		timestamp?: google_protobuf_timestamp_pb.Timestamp.AsObject
		content?: google_protobuf_struct_pb.Struct.AsObject
	}
}

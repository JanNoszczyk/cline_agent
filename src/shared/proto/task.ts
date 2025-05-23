// Code generated by protoc-gen-ts_proto. DO NOT EDIT.
// versions:
//   protoc-gen-ts_proto  v2.7.0
//   protoc               v3.19.1
// source: task.proto

/* eslint-disable */
import { BinaryReader, BinaryWriter } from "@bufbuild/protobuf/wire";
import {
  type CallOptions,
  ChannelCredentials,
  Client,
  type ClientOptions,
  type ClientUnaryCall,
  type handleUnaryCall,
  makeGenericClientConstructor,
  Metadata,
  type ServiceError,
  type UntypedServiceImplementation,
} from "@grpc/grpc-js";
import { Empty, EmptyRequest, Metadata as Metadata1 } from "./common";

export const protobufPackage = "cline";

/** Request message for creating a new task */
export interface NewTaskRequest {
  metadata?: Metadata1 | undefined;
  text: string;
  images: string[];
}

function createBaseNewTaskRequest(): NewTaskRequest {
  return { metadata: undefined, text: "", images: [] };
}

export const NewTaskRequest: MessageFns<NewTaskRequest> = {
  encode(message: NewTaskRequest, writer: BinaryWriter = new BinaryWriter()): BinaryWriter {
    if (message.metadata !== undefined) {
      Metadata1.encode(message.metadata, writer.uint32(10).fork()).join();
    }
    if (message.text !== "") {
      writer.uint32(18).string(message.text);
    }
    for (const v of message.images) {
      writer.uint32(26).string(v!);
    }
    return writer;
  },

  decode(input: BinaryReader | Uint8Array, length?: number): NewTaskRequest {
    const reader = input instanceof BinaryReader ? input : new BinaryReader(input);
    let end = length === undefined ? reader.len : reader.pos + length;
    const message = createBaseNewTaskRequest();
    while (reader.pos < end) {
      const tag = reader.uint32();
      switch (tag >>> 3) {
        case 1: {
          if (tag !== 10) {
            break;
          }

          message.metadata = Metadata1.decode(reader, reader.uint32());
          continue;
        }
        case 2: {
          if (tag !== 18) {
            break;
          }

          message.text = reader.string();
          continue;
        }
        case 3: {
          if (tag !== 26) {
            break;
          }

          message.images.push(reader.string());
          continue;
        }
      }
      if ((tag & 7) === 4 || tag === 0) {
        break;
      }
      reader.skip(tag & 7);
    }
    return message;
  },

  fromJSON(object: any): NewTaskRequest {
    return {
      metadata: isSet(object.metadata) ? Metadata1.fromJSON(object.metadata) : undefined,
      text: isSet(object.text) ? globalThis.String(object.text) : "",
      images: globalThis.Array.isArray(object?.images) ? object.images.map((e: any) => globalThis.String(e)) : [],
    };
  },

  toJSON(message: NewTaskRequest): unknown {
    const obj: any = {};
    if (message.metadata !== undefined) {
      obj.metadata = Metadata1.toJSON(message.metadata);
    }
    if (message.text !== "") {
      obj.text = message.text;
    }
    if (message.images?.length) {
      obj.images = message.images;
    }
    return obj;
  },

  create<I extends Exact<DeepPartial<NewTaskRequest>, I>>(base?: I): NewTaskRequest {
    return NewTaskRequest.fromPartial(base ?? ({} as any));
  },
  fromPartial<I extends Exact<DeepPartial<NewTaskRequest>, I>>(object: I): NewTaskRequest {
    const message = createBaseNewTaskRequest();
    message.metadata = (object.metadata !== undefined && object.metadata !== null)
      ? Metadata1.fromPartial(object.metadata)
      : undefined;
    message.text = object.text ?? "";
    message.images = object.images?.map((e) => e) || [];
    return message;
  },
};

export type TaskServiceService = typeof TaskServiceService;
export const TaskServiceService = {
  /** Cancels the currently running task */
  cancelTask: {
    path: "/cline.TaskService/cancelTask",
    requestStream: false,
    responseStream: false,
    requestSerialize: (value: EmptyRequest) => Buffer.from(EmptyRequest.encode(value).finish()),
    requestDeserialize: (value: Buffer) => EmptyRequest.decode(value),
    responseSerialize: (value: Empty) => Buffer.from(Empty.encode(value).finish()),
    responseDeserialize: (value: Buffer) => Empty.decode(value),
  },
  /** Clears the current task */
  clearTask: {
    path: "/cline.TaskService/clearTask",
    requestStream: false,
    responseStream: false,
    requestSerialize: (value: EmptyRequest) => Buffer.from(EmptyRequest.encode(value).finish()),
    requestDeserialize: (value: Buffer) => EmptyRequest.decode(value),
    responseSerialize: (value: Empty) => Buffer.from(Empty.encode(value).finish()),
    responseDeserialize: (value: Buffer) => Empty.decode(value),
  },
  /** Creates a new task with the given text and optional images */
  newTask: {
    path: "/cline.TaskService/newTask",
    requestStream: false,
    responseStream: false,
    requestSerialize: (value: NewTaskRequest) => Buffer.from(NewTaskRequest.encode(value).finish()),
    requestDeserialize: (value: Buffer) => NewTaskRequest.decode(value),
    responseSerialize: (value: Empty) => Buffer.from(Empty.encode(value).finish()),
    responseDeserialize: (value: Buffer) => Empty.decode(value),
  },
} as const;

export interface TaskServiceServer extends UntypedServiceImplementation {
  /** Cancels the currently running task */
  cancelTask: handleUnaryCall<EmptyRequest, Empty>;
  /** Clears the current task */
  clearTask: handleUnaryCall<EmptyRequest, Empty>;
  /** Creates a new task with the given text and optional images */
  newTask: handleUnaryCall<NewTaskRequest, Empty>;
}

export interface TaskServiceClient extends Client {
  /** Cancels the currently running task */
  cancelTask(request: EmptyRequest, callback: (error: ServiceError | null, response: Empty) => void): ClientUnaryCall;
  cancelTask(
    request: EmptyRequest,
    metadata: Metadata,
    callback: (error: ServiceError | null, response: Empty) => void,
  ): ClientUnaryCall;
  cancelTask(
    request: EmptyRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
    callback: (error: ServiceError | null, response: Empty) => void,
  ): ClientUnaryCall;
  /** Clears the current task */
  clearTask(request: EmptyRequest, callback: (error: ServiceError | null, response: Empty) => void): ClientUnaryCall;
  clearTask(
    request: EmptyRequest,
    metadata: Metadata,
    callback: (error: ServiceError | null, response: Empty) => void,
  ): ClientUnaryCall;
  clearTask(
    request: EmptyRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
    callback: (error: ServiceError | null, response: Empty) => void,
  ): ClientUnaryCall;
  /** Creates a new task with the given text and optional images */
  newTask(request: NewTaskRequest, callback: (error: ServiceError | null, response: Empty) => void): ClientUnaryCall;
  newTask(
    request: NewTaskRequest,
    metadata: Metadata,
    callback: (error: ServiceError | null, response: Empty) => void,
  ): ClientUnaryCall;
  newTask(
    request: NewTaskRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
    callback: (error: ServiceError | null, response: Empty) => void,
  ): ClientUnaryCall;
}

export const TaskServiceClient = makeGenericClientConstructor(TaskServiceService, "cline.TaskService") as unknown as {
  new (address: string, credentials: ChannelCredentials, options?: Partial<ClientOptions>): TaskServiceClient;
  service: typeof TaskServiceService;
  serviceName: string;
};

type Builtin = Date | Function | Uint8Array | string | number | boolean | undefined;

export type DeepPartial<T> = T extends Builtin ? T
  : T extends globalThis.Array<infer U> ? globalThis.Array<DeepPartial<U>>
  : T extends ReadonlyArray<infer U> ? ReadonlyArray<DeepPartial<U>>
  : T extends {} ? { [K in keyof T]?: DeepPartial<T[K]> }
  : Partial<T>;

type KeysOfUnion<T> = T extends T ? keyof T : never;
export type Exact<P, I extends P> = P extends Builtin ? P
  : P & { [K in keyof P]: Exact<P[K], I[K]> } & { [K in Exclude<keyof I, KeysOfUnion<P>>]: never };

function isSet(value: any): boolean {
  return value !== null && value !== undefined;
}

export interface MessageFns<T> {
  encode(message: T, writer?: BinaryWriter): BinaryWriter;
  decode(input: BinaryReader | Uint8Array, length?: number): T;
  fromJSON(object: any): T;
  toJSON(message: T): unknown;
  create<I extends Exact<DeepPartial<T>, I>>(base?: I): T;
  fromPartial<I extends Exact<DeepPartial<T>, I>>(object: I): T;
}

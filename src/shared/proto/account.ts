// Code generated by protoc-gen-ts_proto. DO NOT EDIT.
// versions:
//   protoc-gen-ts_proto  v2.7.0
//   protoc               v3.19.1
// source: account.proto

/* eslint-disable */
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
import { EmptyRequest, String } from "./common";

export const protobufPackage = "cline";

/** Service for account-related operations */
export type AccountServiceService = typeof AccountServiceService;
export const AccountServiceService = {
  /**
   * Handles the user clicking the login link in the UI.
   * Generates a secure nonce for state validation, stores it in secrets,
   * and opens the authentication URL in the external browser.
   */
  accountLoginClicked: {
    path: "/cline.AccountService/accountLoginClicked",
    requestStream: false,
    responseStream: false,
    requestSerialize: (value: EmptyRequest) => Buffer.from(EmptyRequest.encode(value).finish()),
    requestDeserialize: (value: Buffer) => EmptyRequest.decode(value),
    responseSerialize: (value: String) => Buffer.from(String.encode(value).finish()),
    responseDeserialize: (value: Buffer) => String.decode(value),
  },
} as const;

export interface AccountServiceServer extends UntypedServiceImplementation {
  /**
   * Handles the user clicking the login link in the UI.
   * Generates a secure nonce for state validation, stores it in secrets,
   * and opens the authentication URL in the external browser.
   */
  accountLoginClicked: handleUnaryCall<EmptyRequest, String>;
}

export interface AccountServiceClient extends Client {
  /**
   * Handles the user clicking the login link in the UI.
   * Generates a secure nonce for state validation, stores it in secrets,
   * and opens the authentication URL in the external browser.
   */
  accountLoginClicked(
    request: EmptyRequest,
    callback: (error: ServiceError | null, response: String) => void,
  ): ClientUnaryCall;
  accountLoginClicked(
    request: EmptyRequest,
    metadata: Metadata,
    callback: (error: ServiceError | null, response: String) => void,
  ): ClientUnaryCall;
  accountLoginClicked(
    request: EmptyRequest,
    metadata: Metadata,
    options: Partial<CallOptions>,
    callback: (error: ServiceError | null, response: String) => void,
  ): ClientUnaryCall;
}

export const AccountServiceClient = makeGenericClientConstructor(
  AccountServiceService,
  "cline.AccountService",
) as unknown as {
  new (address: string, credentials: ChannelCredentials, options?: Partial<ClientOptions>): AccountServiceClient;
  service: typeof AccountServiceService;
  serviceName: string;
};

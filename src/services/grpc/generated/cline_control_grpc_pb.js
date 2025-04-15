// GENERATED CODE -- DO NOT EDIT!

"use strict"
var grpc = require("@grpc/grpc-js")
var cline_control_pb = require("./cline_control_pb.js")
var google_protobuf_timestamp_pb = require("google-protobuf/google/protobuf/timestamp_pb.js")
var google_protobuf_struct_pb = require("google-protobuf/google/protobuf/struct_pb.js")

function serialize_clinecontrol_CommandRequest(arg) {
	if (!(arg instanceof cline_control_pb.CommandRequest)) {
		throw new Error("Expected argument of type clinecontrol.CommandRequest")
	}
	return Buffer.from(arg.serializeBinary())
}

function deserialize_clinecontrol_CommandRequest(buffer_arg) {
	return cline_control_pb.CommandRequest.deserializeBinary(new Uint8Array(buffer_arg))
}

function serialize_clinecontrol_UpdateResponse(arg) {
	if (!(arg instanceof cline_control_pb.UpdateResponse)) {
		throw new Error("Expected argument of type clinecontrol.UpdateResponse")
	}
	return Buffer.from(arg.serializeBinary())
}

function deserialize_clinecontrol_UpdateResponse(buffer_arg) {
	return cline_control_pb.UpdateResponse.deserializeBinary(new Uint8Array(buffer_arg))
}

// Service definition
var ClineControllerService = (exports.ClineControllerService = {
	// Bidirectional stream for commands and updates
	controlStream: {
		path: "/clinecontrol.ClineController/ControlStream",
		requestStream: true,
		responseStream: true,
		requestType: cline_control_pb.CommandRequest,
		responseType: cline_control_pb.UpdateResponse,
		requestSerialize: serialize_clinecontrol_CommandRequest,
		requestDeserialize: deserialize_clinecontrol_CommandRequest,
		responseSerialize: serialize_clinecontrol_UpdateResponse,
		responseDeserialize: deserialize_clinecontrol_UpdateResponse,
	},
})

exports.ClineControllerClient = grpc.makeGenericClientConstructor(ClineControllerService, "ClineController")

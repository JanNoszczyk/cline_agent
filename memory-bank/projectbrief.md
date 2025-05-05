# Project Brief: Cline gRPC Integration

## 1. Project Vision

To enable the Cline VSCode extension (an AI coding agent) to be run and controlled externally within isolated sandbox environments.

## 2. Core Goal

Integrate a gRPC server into the Cline extension codebase. This server will expose control and communication interfaces, allowing an external process (e.g., a Go backend via a gRPC client) to initiate tasks, send/receive messages, and manage the agent's lifecycle.

## 3. Key Requirements

*   **gRPC Interface:** Define and implement a Protobuf-based gRPC service that allows external control over Cline tasks.
*   **External Control:** Enable initiation of tasks, sending user input/responses, and receiving agent output (text, tool calls, status) via the gRPC interface.
*   **Sandboxing:** Facilitate running the Cline extension within a containerized environment (e.g., Docker), managed by an external system.
*   **Integration:** Bridge the gRPC server with the core Cline extension logic (`Controller`, `Task`) in a non-invasive way if possible.

## 4. Scope

This project focuses on adding the gRPC server layer and integrating it with the existing Cline extension architecture. It involves creating new bridging components and potentially adapting existing ones to accommodate external control flow.

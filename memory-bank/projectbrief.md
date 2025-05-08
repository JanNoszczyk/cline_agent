# Project Brief: Cline gRPC Integration (Summary)

## 1. Vision
Enable external, sandboxed control of the Cline VSCode AI agent.

## 2. Goal
Integrate a gRPC server into Cline for external process management (task initiation, communication, lifecycle) via a gRPC client (e.g., Go backend).

## 3. Key Requirements
*   **gRPC Interface:** Protobuf-based service for external Cline task control.
*   **External Control:** gRPC-driven task initiation, I/O, and status monitoring.
*   **Sandboxing:** Support containerized (e.g., Docker) execution managed externally.
*   **Integration:** Non-invasively bridge gRPC server with core Cline logic (`Controller`, `Task`).

## 4. Scope
Focus on adding and integrating the gRPC server layer, including new bridging components and adapting existing ones for external control.

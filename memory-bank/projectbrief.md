# Project Brief: Cline Agent API Integration

## Overview
This project is a fork of the VSCode extension Cline, which is an autonomous coding agent. The primary goal is to create an API layer that allows the Cline extension to be integrated with a larger web platform that splits projects into tasks and assigns them to humans and AI agents.

## Core Objectives
1. Create an API server that communicates with the Cline extension
2. Containerize the VSCode extension with Docker for isolated execution
3. Develop a React frontend that replicates the VSCode extension UI
4. Ensure secure communication between the frontend and the containerized extension

## Future Plans
1. ✅ Move the frontend into a separate private project (cline-frontend-private)
2. Maintain only the API server and Docker container setup in this fork
3. Deploy a Docker container with VSCode running for each user to improve security
4. Integrate with a Go backend for the main platform

## Security Considerations
- Isolate each user's environment in separate Docker containers
- Avoid file sharing between users
- Implement API key authentication for secure communication

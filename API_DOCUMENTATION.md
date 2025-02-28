# Cline API Documentation

This document provides comprehensive documentation for all API endpoints available in the Cline API server. These endpoints enable the frontend to interact with the Cline extension running in a Docker container.

## Authentication

All API requests require authentication using an API key. The API key should be included in the `X-API-Key` header.

```
X-API-Key: your-api-key-here
```

If the API key is missing or invalid, the server will respond with a `401 Unauthorized` status code.

## Base URL

The base URL for all API endpoints is:

```
http://localhost:3000
```

## Response Format

All API responses are in JSON format. Successful responses typically have the following structure:

```json
{
  "status": 200,
  "data": {
    // Response data here
  }
}
```

Error responses have the following structure:

```json
{
  "message": "Error message here"
}
```

## API Endpoints

### Task Management

#### Create a New Task

Creates a new task for Cline to work on.

- **URL**: `/api/tasks`
- **Method**: `POST`
- **Parameters**:
  - `task` (string, required): The task description
  - `images` (array of strings, optional): Base64-encoded images to include with the task
- **Response**:
  - `201 Created` on success
  - Response body: `{ "taskId": "unique-task-id" }`
- **Example**:
  ```json
  // Request
  POST /api/tasks
  {
    "task": "Create a simple React component",
    "images": ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."]
  }

  // Response
  {
    "status": 201,
    "data": {
      "taskId": "task-123456"
    }
  }
  ```

#### Resume a Task

Resumes a previously created task.

- **URL**: `/api/tasks/:taskId/resume`
- **Method**: `POST`
- **URL Parameters**:
  - `taskId` (string, required): The ID of the task to resume
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  POST /api/tasks/task-123456/resume

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Cancel a Task

Cancels the current task.

- **URL**: `/api/tasks/:taskId/cancel`
- **Method**: `POST`
- **URL Parameters**:
  - `taskId` (string, required): The ID of the task to cancel
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  POST /api/tasks/task-123456/cancel

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Get All Tasks

Retrieves all tasks in the task history.

- **URL**: `/api/tasks`
- **Method**: `GET`
- **Response**:
  - `200 OK` on success
  - Response body: Array of task history items
- **Example**:
  ```json
  // Request
  GET /api/tasks

  // Response
  {
    "status": 200,
    "data": [
      {
        "id": "task-123456",
        "task": "Create a simple React component",
        "timestamp": 1645678901234,
        "messages": [
          // Task messages
        ]
      },
      // More tasks
    ]
  }
  ```

#### Get a Specific Task

Retrieves a specific task by ID.

- **URL**: `/api/tasks/:taskId`
- **Method**: `GET`
- **URL Parameters**:
  - `taskId` (string, required): The ID of the task to retrieve
- **Response**:
  - `200 OK` on success
  - `404 Not Found` if the task doesn't exist
  - Response body: Task history item
- **Example**:
  ```json
  // Request
  GET /api/tasks/task-123456

  // Response
  {
    "status": 200,
    "data": {
      "id": "task-123456",
      "task": "Create a simple React component",
      "timestamp": 1645678901234,
      "messages": [
        // Task messages
      ]
    }
  }
  ```

#### Delete a Task

Deletes a task from the task history.

- **URL**: `/api/tasks/:taskId`
- **Method**: `DELETE`
- **URL Parameters**:
  - `taskId` (string, required): The ID of the task to delete
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  DELETE /api/tasks/task-123456

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Export a Task

Exports a task for sharing or saving.

- **URL**: `/api/tasks/:taskId/export`
- **Method**: `GET`
- **URL Parameters**:
  - `taskId` (string, required): The ID of the task to export
- **Response**:
  - `200 OK` on success
  - Response body: Exported task data
- **Example**:
  ```json
  // Request
  GET /api/tasks/task-123456/export

  // Response
  {
    "status": 200,
    "data": {
      "id": "task-123456",
      "task": "Create a simple React component",
      "timestamp": 1645678901234,
      "messages": [
        // Task messages
      ],
      "exportFormat": "1.0"
    }
  }
  ```

### Interaction with Cline

#### Send Response to Cline

Sends a response to Cline for the current task.

- **URL**: `/api/tasks/:taskId/response`
- **Method**: `POST`
- **URL Parameters**:
  - `taskId` (string, required): The ID of the current task
- **Parameters**:
  - `response` (string, required): The type of response ("yesButtonClicked", "noButtonClicked", or "messageResponse")
  - `text` (string, optional): The text response when response type is "messageResponse"
  - `images` (array of strings, optional): Base64-encoded images to include with the response
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  POST /api/tasks/task-123456/response
  {
    "response": "messageResponse",
    "text": "Yes, please proceed with creating the component",
    "images": ["data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."]
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

### Webview Management

#### Get Current State

Retrieves the current state for the webview.

- **URL**: `/api/state`
- **Method**: `GET`
- **Response**:
  - `200 OK` on success
  - Response body: Current state object
- **Example**:
  ```json
  // Request
  GET /api/state

  // Response
  {
    "status": 200,
    "data": {
      "currentTaskId": "task-123456",
      "taskHistory": [
        // Task history items
      ],
      "apiConfiguration": {
        // API configuration
      },
      "customInstructions": "Custom instructions here",
      "autoApprovalSettings": {
        // Auto-approval settings
      },
      "browserSettings": {
        // Browser settings
      },
      "chatSettings": {
        // Chat settings
      },
      "mcpServers": [
        // MCP server information
      ]
    }
  }
  ```

#### Post Message to Webview

Posts a message to the webview.

- **URL**: `/api/webview/message`
- **Method**: `POST`
- **Parameters**:
  - Message object with a `type` property and other properties depending on the message type
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  POST /api/webview/message
  {
    "type": "clearTask"
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

### Settings Management

#### Update API Configuration

Updates the API configuration.

- **URL**: `/api/settings/api`
- **Method**: `PUT`
- **Parameters**:
  - API configuration object
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  PUT /api/settings/api
  {
    "apiProvider": "anthropic",
    "apiModelId": "claude-3-7-sonnet-20250219",
    "apiKey": "your-api-key-here"
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Update Custom Instructions

Updates the custom instructions for Cline.

- **URL**: `/api/settings/customInstructions`
- **Method**: `PUT`
- **Parameters**:
  - `instructions` (string, required): The custom instructions
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  PUT /api/settings/customInstructions
  {
    "instructions": "Always use TypeScript for React components."
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Update Auto-Approval Settings

Updates the auto-approval settings.

- **URL**: `/api/settings/autoApproval`
- **Method**: `PUT`
- **Parameters**:
  - Auto-approval settings object
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  PUT /api/settings/autoApproval
  {
    "enabled": true,
    "maxRequests": 10,
    "tools": ["read_file", "list_files"]
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Update Browser Settings

Updates the browser settings.

- **URL**: `/api/settings/browser`
- **Method**: `PUT`
- **Parameters**:
  - Browser settings object
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  PUT /api/settings/browser
  {
    "autoApprove": false
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Update Chat Settings

Updates the chat settings.

- **URL**: `/api/settings/chat`
- **Method**: `PUT`
- **Parameters**:
  - Chat settings object
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  PUT /api/settings/chat
  {
    "mode": "act"
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Toggle Plan/Act Mode

Toggles between plan and act modes.

- **URL**: `/api/settings/chat/mode`
- **Method**: `PUT`
- **Parameters**:
  - `mode` (string, required): The mode to set ("plan" or "act")
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  PUT /api/settings/chat/mode
  {
    "mode": "plan"
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

### Authentication

#### Set Authentication Token

Sets the authentication token.

- **URL**: `/api/auth/token`
- **Method**: `POST`
- **Parameters**:
  - `token` (string, required): The authentication token
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  POST /api/auth/token
  {
    "token": "your-auth-token-here"
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Set User Information

Sets the user information.

- **URL**: `/api/auth/user`
- **Method**: `POST`
- **Parameters**:
  - `displayName` (string or null, required): The user's display name
  - `email` (string or null, required): The user's email
  - `photoURL` (string or null, required): The URL of the user's photo
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  POST /api/auth/user
  {
    "displayName": "John Doe",
    "email": "john.doe@example.com",
    "photoURL": "https://example.com/photo.jpg"
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Sign Out

Signs the user out.

- **URL**: `/api/auth/signout`
- **Method**: `POST`
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  POST /api/auth/signout

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

### MCP Management

#### Get MCP Marketplace Catalog

Retrieves the MCP marketplace catalog.

- **URL**: `/api/mcp/marketplace`
- **Method**: `GET`
- **Response**:
  - `200 OK` on success
  - Response body: MCP marketplace catalog
- **Example**:
  ```json
  // Request
  GET /api/mcp/marketplace

  // Response
  {
    "status": 200,
    "data": {
      "servers": [
        {
          "id": "weather-server",
          "name": "Weather Server",
          "description": "Provides weather information",
          "version": "1.0.0",
          "author": "Example Author"
        },
        // More MCP servers
      ]
    }
  }
  ```

#### Download MCP

Downloads an MCP from the marketplace.

- **URL**: `/api/mcp/download`
- **Method**: `POST`
- **Parameters**:
  - `mcpId` (string, required): The ID of the MCP to download
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  POST /api/mcp/download
  {
    "mcpId": "weather-server"
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Toggle MCP Server

Enables or disables an MCP server.

- **URL**: `/api/mcp/servers/:serverName/toggle`
- **Method**: `PUT`
- **URL Parameters**:
  - `serverName` (string, required): The name of the MCP server
- **Parameters**:
  - `disabled` (boolean, required): Whether the server should be disabled
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  PUT /api/mcp/servers/weather-server/toggle
  {
    "disabled": false
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Toggle MCP Tool Auto-Approve

Enables or disables auto-approve for an MCP tool.

- **URL**: `/api/mcp/servers/:serverName/tools/:toolName/toggleAutoApprove`
- **Method**: `PUT`
- **URL Parameters**:
  - `serverName` (string, required): The name of the MCP server
  - `toolName` (string, required): The name of the MCP tool
- **Parameters**:
  - `autoApprove` (boolean, required): Whether auto-approve should be enabled for the tool
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  PUT /api/mcp/servers/weather-server/tools/get_weather/toggleAutoApprove
  {
    "autoApprove": true
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Restart MCP Server

Restarts an MCP server.

- **URL**: `/api/mcp/servers/:serverName/restart`
- **Method**: `POST`
- **URL Parameters**:
  - `serverName` (string, required): The name of the MCP server
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  POST /api/mcp/servers/weather-server/restart

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

#### Delete MCP Server

Deletes an MCP server.

- **URL**: `/api/mcp/servers/:serverName`
- **Method**: `DELETE`
- **URL Parameters**:
  - `serverName` (string, required): The name of the MCP server
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  DELETE /api/mcp/servers/weather-server

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

### Miscellaneous

#### Subscribe with Email

Subscribes with an email address.

- **URL**: `/api/subscribe`
- **Method**: `POST`
- **Parameters**:
  - `email` (string, required): The email address to subscribe
- **Response**:
  - `200 OK` on success
  - Response body: `{ "success": true }`
- **Example**:
  ```json
  // Request
  POST /api/subscribe
  {
    "email": "john.doe@example.com"
  }

  // Response
  {
    "status": 200,
    "data": {
      "success": true
    }
  }
  ```

## Error Handling

The API server returns appropriate HTTP status codes for different error scenarios:

- `400 Bad Request`: The request was malformed or missing required parameters
- `401 Unauthorized`: Authentication failed (missing or invalid API key)
- `404 Not Found`: The requested resource was not found
- `500 Internal Server Error`: An unexpected error occurred on the server

Error responses include a message explaining the error:

```json
{
  "message": "Task not found."
}
```

## WebSocket Support (Future Enhancement)

WebSocket support for real-time updates is planned for a future release. This will enable the frontend to receive updates from the Cline extension without polling.

## Rate Limiting (Future Enhancement)

Rate limiting is planned for a future release to prevent abuse of the API.

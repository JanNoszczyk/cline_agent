# Component Reuse Documentation

## Overview

This document explains how we've implemented component reuse between the VSCode extension and the web frontend. The goal is to create web-compatible versions of the components that can be used in a standalone web application while maintaining the same look, feel, and functionality.

## Problem Statement

The original components in the VSCode extension (`webview-ui/src/components`) were designed to work within the VSCode environment and rely on VSCode-specific APIs and utilities. To use these components in a standalone web application (`cline-frontend`), we needed to:

1. Create web-compatible alternatives for VSCode-specific functionality
2. Create web-compatible versions of the components
3. Maintain the same look, feel, and functionality as the original components

## Solution Architecture

### 1. Web-Compatible Utilities

We created web-compatible versions of the utilities used by the original components:

#### `src/utils/vscode.ts`

A mock of the VSCode API for web browsers. This utility provides similar functionality to the VSCode API but works in a web environment.

```typescript
class VSCodeAPIWrapper {
  public postMessage(message: WebviewMessage) {
    console.log('VSCode message (web mock):', message);
    
    // Handle specific message types
    if (message.type === 'openMention' && typeof message.text === 'string') {
      console.log(`Would open mention: @${message.text}`);
    } else if (message.type === 'openImage' && typeof message.text === 'string') {
      window.open(message.text, '_blank');
    }
  }

  public getState(): unknown | undefined {
    const state = localStorage.getItem('vscodeState');
    return state ? JSON.parse(state) : undefined;
  }

  public setState<T extends unknown | undefined>(newState: T): T {
    localStorage.setItem('vscodeState', JSON.stringify(newState));
    return newState;
  }
}

export const vscode = new VSCodeAPIWrapper();
```

#### `src/utils/format.ts`

Formatting utilities for numbers, matching the functionality of the original utilities.

```typescript
export function formatLargeNumber(num: number): string {
  if (num >= 1e9) {
    return (num / 1e9).toFixed(1) + "b";
  }
  if (num >= 1e6) {
    return (num / 1e6).toFixed(1) + "m";
  }
  if (num >= 1e3) {
    return (num / 1e3).toFixed(1) + "k";
  }
  return num.toString();
}
```

#### `src/utils/size.ts`

Utilities for formatting file sizes, providing similar functionality to the original `pretty-bytes` dependency.

```typescript
export function formatSize(bytes?: number): string {
  if (bytes === undefined) {
    return "--kb";
  }

  // Simple implementation of pretty-bytes functionality
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
  
  if (bytes === 0) return '0 B';
  
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  
  if (i === 0) return `${bytes} ${units[i]}`;
  
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
```

#### `src/utils/context-mentions.ts`

Regex patterns for identifying mentions in text, matching the functionality of the original utilities.

```typescript
export const mentionRegex =
  /@((?:\/|\w+:\/\/)[^\s]+?|[a-f0-9]{7,40}\b|problems\b|terminal\b|git-changes\b)(?=[.,;:!?]?(?=[\s\r\n]|$))/;

export const mentionRegexGlobal = new RegExp(mentionRegex.source, "g");
```

#### `src/utils/apiConfig.ts`

A mock implementation of the API configuration utilities used by the original components.

```typescript
export function normalizeApiConfiguration(apiConfiguration: any) {
  return {
    selectedModelInfo: {
      contextWindow: 100000,
      inputPrice: 0.0001,
      outputPrice: 0.0002,
    },
  };
}
```

#### `src/utils/apiClient.ts`

A comprehensive API client for interacting with the Docker server API endpoints.

```typescript
export const apiClient = {
  initTask: async (task: string, images?: string[]) => {
    // Implementation details...
  },
  
  resumeTask: async (taskId: string) => {
    // Implementation details...
  },
  
  cancelTask: async (taskId: string) => {
    // Implementation details...
  },
  
  // Other API methods...
};
```

#### `src/types/WebviewMessage.ts`

Type definitions for messages sent to VSCode, matching the original types.

```typescript
export interface WebviewMessage {
  type: string;
  text?: string;
  [key: string]: any;
}
```

### 2. Component Implementation

#### `src/components/common/Thumbnails.tsx`

A component for displaying image thumbnails, matching the functionality of the original component.

```typescript
const Thumbnails = ({ images, style, setImages, onHeightChange }: ThumbnailsProps) => {
  // Implementation details...
  
  return (
    <div ref={containerRef} style={{ display: "flex", flexWrap: "wrap", gap: 5, rowGap: 3, ...style }}>
      {images.map((image, index) => (
        <div
          key={index}
          style={{ position: "relative" }}
          onMouseEnter={() => setHoveredIndex(index)}
          onMouseLeave={() => setHoveredIndex(null)}>
          <img
            src={image}
            alt={`Thumbnail ${index + 1}`}
            style={{ width: 34, height: 34, objectFit: "cover", borderRadius: 4, cursor: "pointer" }}
            onClick={() => handleImageClick(image)}
          />
          {/* Delete button implementation */}
        </div>
      ))}
    </div>
  );
};
```

#### `src/components/chat/WebTaskHeader.tsx`

A web-compatible version of the TaskHeader component, matching the functionality of the original component.

```typescript
const WebTaskHeader: React.FC<TaskHeaderProps> = ({
  task,
  tokensIn,
  tokensOut,
  doesModelSupportPromptCache,
  cacheWrites,
  cacheReads,
  totalCost,
  lastApiReqTotalTokens,
  onClose,
}) => {
  // Implementation details...
  
  return (
    <div style={{ padding: "10px 13px 10px 13px" }}>
      <div style={{ backgroundColor: "var(--vscode-badge-background)", color: "var(--vscode-badge-foreground)", /* other styles */ }}>
        {/* Component implementation */}
      </div>
    </div>
  );
};

export const highlightMentions = (text?: string, withShadow = true): React.ReactNode => {
  // Implementation details...
};

const DeleteButton: React.FC<{ taskSize: string; taskId?: string; }> = ({ taskSize, taskId }) => (
  // Implementation details...
);
```

#### `src/components/chat/TaskHeader.tsx`

The main TaskHeader component that uses our web-compatible version.

```typescript
import React from 'react';
import WebTaskHeader from './WebTaskHeader';
import { ClineMessage } from '../../context/ExtensionStateContext';

// Re-export the highlightMentions function from our WebTaskHeader
export { highlightMentions } from './WebTaskHeader';

interface TaskHeaderProps {
  // Props definition...
}

const TaskHeader: React.FC<TaskHeaderProps> = (props) => {
  return <WebTaskHeader {...props} />;
};

export default TaskHeader;
```

### 3. API Integration

We've integrated the components with the Docker server API endpoints using the `apiClient.ts` utility. This allows the components to fetch data from the server and update the server state when needed.

#### `src/context/ExtensionStateContext.tsx`

The context provider that manages the application state and interacts with the API.

```typescript
export const ExtensionStateContextProvider: React.FC<{
  children: React.ReactNode;
}> = ({ children }) => {
  // Initialize state with default values
  const [state, setState] = useState<ExtensionState>({
    // Default state values...
  });

  // Fetch initial state from the API
  useEffect(() => {
    const fetchInitialState = async () => {
      try {
        const extensionState = await apiClient.getState();
        setState(extensionState);
        // Other initialization logic...
      } catch (error) {
        console.error('Failed to fetch initial state:', error);
      }
    };

    fetchInitialState();
  }, []);

  // Update API configuration and sync with server
  const setApiConfiguration = async (config: ApiConfiguration) => {
    try {
      await apiClient.updateApiConfiguration(config);
      setState((prevState) => ({
        ...prevState,
        apiConfiguration: config,
      }));
    } catch (error) {
      console.error('Failed to update API configuration:', error);
    }
  };

  // Other state management methods...

  return <ExtensionStateContext.Provider value={contextValue}>{children}</ExtensionStateContext.Provider>;
};
```

#### `src/components/chat/ChatView.tsx`

The main chat view component that uses the API client to interact with the server.

```typescript
const ChatView = ({ isHidden, showAnnouncement, hideAnnouncement, showHistoryView }: ChatViewProps) => {
  // Component state...

  // Handle sending a message
  const handleSendMessage = useCallback(async (text: string, images: string[]) => {
    text = text.trim();
    if (text || images.length > 0) {
      try {
        if (messages.length === 0) {
          // Initialize a new task
          const taskId = await apiClient.initTask(text, images);
          setCurrentTaskId(taskId);
        } else if (clineAsk && currentTaskId) {
          // Send the response to the API
          await apiClient.handleResponse(currentTaskId, 'messageResponse', text, images);
        }
        
        // Clear input state...
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    }
  }, [messages.length, clineAsk, currentTaskId]);

  // Other component methods...

  return (
    // Component JSX...
  );
};
```

### 4. Configuration Updates

#### `tsconfig.json`

Updated to include the necessary directories in the compilation.

```json
{
  "compilerOptions": {
    // Compiler options...
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

#### `vite.config.ts`

Updated to handle imports from the shared directories.

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
  resolve: {
    alias: {
      // Allow importing from the shared directories
      '../../../src/shared': path.resolve(__dirname, '../src/shared'),
    },
  },
});
```

## Implementation Details

### Component Strategy

1. **Web-Compatible Components**: We create web-compatible versions of the components that mimic the original components but use our web-compatible utilities.

2. **Direct Imports**: We use direct imports of the components rather than using adapters or wrappers.

3. **API Integration**: We integrate the components with the Docker server API endpoints using the `apiClient.ts` utility.

### File Structure

```
cline-frontend/
├── src/
│   ├── components/
│   │   ├── chat/
│   │   │   ├── TaskHeader.tsx         # Main component that uses WebTaskHeader
│   │   │   ├── WebTaskHeader.tsx      # Web-compatible version of TaskHeader
│   │   │   ├── ChatView.tsx           # Main chat view component
│   │   │   ├── ChatRow.tsx            # Component for displaying a chat message
│   │   │   ├── ChatTextArea.tsx       # Component for entering chat messages
│   │   │   └── README.md              # Documentation for chat components
│   │   └── common/
│   │       └── Thumbnails.tsx         # Component for displaying image thumbnails
│   ├── context/
│   │   └── ExtensionStateContext.tsx  # Context provider for managing state
│   ├── types/
│   │   └── WebviewMessage.ts          # Type definitions for messages sent to VSCode
│   └── utils/
│       ├── apiClient.ts               # API client for interacting with the server
│       ├── apiConfig.ts               # API configuration utilities
│       ├── context-mentions.ts        # Regex patterns for identifying mentions
│       ├── format.ts                  # Formatting utilities for numbers
│       ├── size.ts                    # Utilities for formatting file sizes
│       └── vscode.ts                  # Mock of the VSCode API
└── docs/
    └── component-reuse.md            # This documentation file
```

## Future Improvements

1. **Shared Types**: Create shared type definitions between the VSCode extension and the web frontend to ensure type safety.

2. **Component Library**: Extract common components into a shared component library that can be used by both the VSCode extension and the web frontend.

3. **Theme Consistency**: Ensure consistent theming between the VSCode extension and the web frontend.

4. **Automated Testing**: Add tests to verify that the web-compatible components behave the same as the original components.

5. **Build Process**: Improve the build process to automatically generate web-compatible versions of VSCode-specific components.

## Conclusion

This approach allows us to create web-compatible versions of the components that can be used in a standalone web application while maintaining the same look, feel, and functionality. By creating web-compatible alternatives for VSCode-specific functionality and integrating with the Docker server API endpoints, we can leverage the existing codebase without duplicating effort.

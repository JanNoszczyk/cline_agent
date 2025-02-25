# Cline Frontend

A modern React application that replicates the VSCode Cline extension UI. This project demonstrates how to create a VSCode-styled UI using React and styled-components.

## Features

- VSCode-themed UI components
- Chat interface similar to the Cline extension
- Support for code display with syntax highlighting
- Markdown rendering
- Responsive design
- **Component Reuse**: Direct reuse of components from the VSCode extension with web-compatible alternatives for VSCode-specific functionality

## Technologies Used

- React
- TypeScript
- Vite
- Styled Components
- VSCode Webview UI Toolkit

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

### Development

Run the development server:

```bash
npm run dev
```

This will start the development server at http://localhost:3000.

### Building for Production

Build the project for production:

```bash
npm run build
```

## Project Structure

- `src/` - Source code
  - `components/` - React components
    - `chat/` - Chat-related components
    - `common/` - Shared components
  - `context/` - React context providers
  - `types/` - TypeScript type definitions
  - `utils/` - Utility functions
  - `App.tsx` - Main application component
  - `main.tsx` - Application entry point
- `docs/` - Documentation
  - `component-reuse.md` - Detailed documentation on the component reuse approach

## Component Reuse

This project demonstrates how to reuse components from the VSCode extension in a web application. Instead of duplicating the components, we:

1. Import the original components from the VSCode extension
2. Create web-compatible alternatives for VSCode-specific functionality
3. Use adapters to bridge the gap between the VSCode environment and the web environment

For detailed documentation on this approach, see [Component Reuse Documentation](./docs/component-reuse.md).

## API Integration

This frontend is designed to work with the API endpoints defined in `api.ts`. The API provides endpoints for:

- Task management
- Chat interactions
- Settings management
- Authentication
- MCP (Model Context Protocol) management

## License

This project is licensed under the MIT License.

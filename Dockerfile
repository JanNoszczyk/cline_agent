# Builder stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for both root and webview-ui
COPY package*.json ./
COPY webview-ui/package*.json ./webview-ui/
COPY esbuild.js ./
COPY tsconfig.json ./

# Install dependencies for both root and webview-ui
RUN npm install && \
    cd webview-ui && npm install && cd ..

# Copy remaining source files
COPY . .

# Build and package
RUN npm run compile && \
    npm install -g vsce && \
    vsce package --out /app/dist/

# Production dependencies stage
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Final stage
FROM codercom/code-server:latest

WORKDIR /app

# Copy the built extension from the builder stage
COPY --from=builder /app/dist/*.vsix /app/

# Copy production dependencies
COPY --from=deps /app/node_modules /app/node_modules

# Install the extension
RUN code-server --install-extension /app/*.vsix

# Create a settings directory to ensure extension is properly loaded
RUN mkdir -p /home/coder/.local/share/code-server/User

# Create settings.json to ensure the extension is enabled
RUN echo '{"extensions.autoUpdate": false, "extensions.autoCheckUpdates": false, "workbench.colorTheme": "Default Dark+", "cline.apiKey": "${CLINE_API_KEY}"}' > /home/coder/.local/share/code-server/User/settings.json

# Environment variables
ARG CLINE_API_KEY
ENV CLINE_API_KEY=${CLINE_API_KEY}

# Expose the ports for code-server and the API server
EXPOSE 8080 3000

# Run code-server
CMD ["code-server", "--auth", "none", "--bind-addr", "0.0.0.0:8080"]

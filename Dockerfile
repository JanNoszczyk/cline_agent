# Builder stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files for both root and webview-ui
COPY package*.json ./
COPY webview-ui/package*.json ./webview-ui/
COPY esbuild.js ./
COPY tsconfig.json ./

# Install dependencies with caching
# Use npm ci for more reliable builds and cache the node_modules
RUN --mount=type=cache,target=/root/.npm \
    npm ci && \
    cd webview-ui && npm ci && cd ..

# Copy remaining source files
COPY . .

# Build and package with caching
RUN --mount=type=cache,target=/root/.npm \
    npm run compile && \
    npm install -g vsce && \
    vsce package --out /app/dist/

# Production dependencies stage
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN --mount=type=cache,target=/root/.npm npm ci

# Final stage
FROM codercom/code-server:latest

# Install Node.js with retry logic, alternative mirrors, and caching
USER root

# Configure apt to use alternative mirrors and add retry logic
RUN echo 'Acquire::Retries "10";' > /etc/apt/apt.conf.d/80retries && \
    echo 'Acquire::http::Timeout "120";' > /etc/apt/apt.conf.d/99timeout && \
    echo 'Acquire::https::Timeout "120";' >> /etc/apt/apt.conf.d/99timeout && \
    echo 'deb http://ftp.us.debian.org/debian bookworm main' > /etc/apt/sources.list && \
    echo 'deb http://security.debian.org/debian-security bookworm-security main' >> /etc/apt/sources.list && \
    echo 'deb http://ftp.us.debian.org/debian bookworm-updates main' >> /etc/apt/sources.list

# Install dependencies with retry mechanism and caching
RUN --mount=type=cache,target=/var/cache/apt \
    --mount=type=cache,target=/var/lib/apt \
    for i in $(seq 1 3); do \
        apt-get update && \
        apt-get install -y curl && break || \
        echo "Retry attempt $i for apt-get install..." && sleep 15; \
    done && \
    for i in $(seq 1 3); do \
        curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
        apt-get install -y nodejs && break || \
        echo "Retry attempt $i for nodejs install..." && sleep 15; \
    done

# Create API server script
COPY api_server.js /home/coder/api_server.js

# Create startup script
RUN echo '#!/bin/bash\n\
node /home/coder/api_server.js &\n\
exec "$@"' > /usr/local/bin/entrypoint.sh && \
    chmod +x /usr/local/bin/entrypoint.sh

USER coder

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

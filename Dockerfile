# Builder stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package.json and package-lock.json for efficient caching
COPY package*.json ./
COPY esbuild.js ./
COPY tsconfig.json ./
COPY . .

# Install all dependencies, build, and package
RUN npm install && \
    npm run compile && \
    npm install -g vsce && \
    vsce package --out /app/dist/

# Production dependencies stage
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# Final stage
FROM codercom/code-server:latest

WORKDIR /app

# Copy the built extension from the builder stage
COPY --from=builder /app/dist/*.vsix /app/

# Copy production dependencies
COPY --from=deps /app/node_modules /app/node_modules

# Install the extension
RUN code-server --install-extension /app/*.vsix

# Environment variables
ARG CLINE_API_KEY
ENV CLINE_API_KEY=${CLINE_API_KEY}

# Expose the port code-server runs on
EXPOSE 8080

# Run code-server
CMD ["code-server", "--auth", "none", "--bind-addr", "0.0.0.0:8080"]

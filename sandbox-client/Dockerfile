# --- Stage 1: Proto Generator ---
FROM golang:1.22.5-alpine AS proto-generator

# Install protoc dependencies
RUN apk add --no-cache wget unzip

# Install pre-compiled protoc binary
ENV PROTOC_VERSION=27.2
RUN wget https://github.com/protocolbuffers/protobuf/releases/download/v${PROTOC_VERSION}/protoc-${PROTOC_VERSION}-linux-x86_64.zip && \
    unzip protoc-${PROTOC_VERSION}-linux-x86_64.zip -d /usr/local && \
    chmod +x /usr/local/bin/protoc && \
    rm protoc-${PROTOC_VERSION}-linux-x86_64.zip

# Set Go environment variables needed for plugin installation
ENV GOPATH=/go
ENV PATH=/usr/local/go/bin:${GOPATH}/bin:${PATH}
ENV GO111MODULE=on

# Install Go plugins
RUN go install google.golang.org/protobuf/cmd/protoc-gen-go@v1.34.1 && \
    go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@v1.4.0

# Copy only proto definitions
WORKDIR /defs
COPY proto/ .

# Generate Go code into a dedicated output directory
# Using the original go_package = "genproto/..."
RUN echo "--- Running protoc in proto-generator stage ---" && \
    mkdir -p /generated-protos && \
    PATH=${GOPATH}/bin/linux_amd64:${PATH} protoc \
           --proto_path=/defs \
           --experimental_allow_proto3_optional \
           --go_out=/generated-protos \
           --go-grpc_out=/generated-protos \
           # Process all proto files
           /defs/browser.proto /defs/checkpoints.proto /defs/mcp.proto /defs/common.proto /defs/task_control.proto && \
    echo "--- Listing /generated-protos contents ---" && \
    ls -lR /generated-protos

# --- Stage 2: Builder ---
# Use the non-alpine Go image to avoid potential Alpine-specific issues
FROM golang:1.22.5 AS builder

# Add a cache-busting argument
ARG CACHEBUST=1

# Set Go environment variables for build
ENV CGO_ENABLED=0
ENV GOOS=linux
ENV GOARCH=amd64
ENV GO111MODULE=on
# Explicitly unset GOPATH to avoid potential conflicts
ENV GOPATH=""
# Explicitly set GOCACHE to a path within the container
ENV GOCACHE=/tmp/gocache

# Log Go environment for diagnostics
RUN go env

# Set working directory for the Go module
WORKDIR /app/sandbox-client

# Copy go.mod and go.sum first
COPY sandbox-client/go.mod sandbox-client/go.sum ./

# Clean build cache first
RUN go clean -cache
# Download dependencies BEFORE copying any source code
# Needs to run in the directory with go.mod
RUN go mod download
# Attempt to clear Go module cache
RUN go clean -modcache

# Force cache break before copying source
RUN echo "Cache break: ${CACHEBUST}"

# Copy the rest of the application source code *excluding* go.mod/go.sum which are already copied
# Use .dockerignore if necessary to exclude specific files if copying '.'
COPY sandbox-client/ ./

# Ensure any potentially conflicting existing genproto directory is removed just before copying the new one
# Although copying over it might be sufficient, explicit removal is safer.
RUN rm -rf /app/sandbox-client/genproto

# Copy the generated 'genproto' directory *after* the main source code
# This ensures the generated code overwrites any potentially stale checked-in versions.
COPY --from=proto-generator /generated-protos/sandboxclient/genproto /app/sandbox-client/genproto/

# --- Tidy, List, Build ---
RUN echo "--- Listing /app/sandbox-client contents after final proto copy ---" && ls -lR /app/sandbox-client
# Ensure we are in the correct directory for Go commands
WORKDIR /app/sandbox-client
# Run tidy *after* all code is present
RUN go mod tidy -v
# Explicitly get dependencies to ensure they are downloaded
RUN go get -v ./...
# Verify package listing *after* tidy and get
RUN echo "--- Listing Go packages found (after tidy and get) ---" && go list ./... && echo "--- End Go packages list (after tidy and get) ---"
# Add a cache buster file using the CACHEBUST argument before the go build command
RUN echo "${CACHEBUST}" > /app/sandbox-client/cache_buster.txt
# Build the main package
RUN go build -v -x -buildvcs=false -ldflags="-w -s" -o /sandbox-binary .

# --- Stage 3: Final Stage ---
FROM gitpod/openvscode-server:latest

# Prevent interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install locales package first
RUN sudo apt-get update && sudo apt-get install -y --no-install-recommends locales && sudo apt-get clean && sudo rm -rf /var/lib/apt/lists/*

# Set up locale
RUN sudo sed -i '/en_US.UTF-8/s/^# //g' /etc/locale.gen && sudo locale-gen
ENV LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8

# Install minimal runtime dependencies (Node.js, Bash, Chromium, Playwright, netcat, unzip, dos2unix)
RUN sudo apt-get update && sudo apt-get install -y --no-install-recommends \
    bash curl wget gnupg sudo procps chromium-browser netcat-traditional unzip dos2unix \
    && curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - \
    && sudo apt-get install -y nodejs \
           && sudo npm install -g n \
           && sudo n 22 \
           && npx playwright install-deps \
           && sudo npm install -g --unsafe-perm=true playwright \
           && sudo apt-get clean && sudo rm -rf /var/lib/apt/lists/*

# Create and set permissions for Playwright browser directory
RUN sudo mkdir -p /opt/pw-browsers && sudo chown -R openvscode-server:openvscode-server /opt/pw-browsers

# Install Chromium browser for Playwright
RUN PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers npx playwright install chromium

# Set working directory for the application files (binary, entrypoint)
WORKDIR /final-app

# Create standard workspace directory and set permissions
RUN mkdir -p /home/workspace \
    && echo "# Default Workspace\n\nThis is the default workspace for the sandbox client." | sudo tee /home/workspace/README.md > /dev/null \
    && sudo chown -R openvscode-server:openvscode-server /home/workspace \
    # Copy the activation trigger file into the workspace
    && sudo chown -R openvscode-server:openvscode-server /final-app \
    && sudo mkdir -p /home/openvscode-server/.openvscode-server/extensions \
    /home/openvscode-server/.openvscode-server/data \
    /usr/local/share/openvscode-server/extensions \
    /etc/openvscode-server \
    && sudo chown -R openvscode-server:openvscode-server /home/openvscode-server/.openvscode-server \
    && sudo chown -R root:root /usr/local/share/openvscode-server/extensions

# Set OpenVSCode Server environment variables
ENV OPENVSCODE_SERVER_EXTENSIONS_DIR=/home/openvscode-server/.openvscode-server/extensions \
    OPENVSCODE_SERVER_DATA_DIR=/home/openvscode-server/.openvscode-server/data \
    GLOBAL_EXTENSIONS_DIR=/usr/local/share/openvscode-server/extensions

# Copy the compiled Go binary from the builder stage
COPY --from=builder --chown=openvscode-server:openvscode-server /sandbox-binary /final-app/sandbox-binary
RUN sudo chmod +x /final-app/sandbox-binary

           # Copy entrypoint script, Puppeteer script, and vsix file
           COPY --chown=openvscode-server:openvscode-server --chmod=755 sandbox-client/entrypoint.sh /final-app/entrypoint.sh
           COPY --chown=openvscode-server:openvscode-server --chmod=755 sandbox-client/puppeteer_vscode_run.js /final-app/puppeteer_vscode_run.js

       # Install Playwright locally for puppeteer_vscode_run.js
       # This ensures the script can find Playwright regardless of global paths.
       # The WORKDIR is /final-app, set earlier.
       RUN sudo npm install playwright && \
           sudo chown -R openvscode-server:openvscode-server /final-app/node_modules && \
           # If npm creates a package-lock.json or package.json, ensure they are also owned correctly
           (test -f /final-app/package-lock.json && sudo chown openvscode-server:openvscode-server /final-app/package-lock.json || true) && \
           (test -f /final-app/package.json && sudo chown openvscode-server:openvscode-server /final-app/package.json || true)

               RUN mkdir -p /tmp/
               # Copy VSIX from the build context root (project root)
           COPY sandbox-client/cline-extension.vsix /tmp/claude-dev.vsix

    # Set up VS Code settings with gRPC port
ARG CLINE_GRPC_PORT_ARG=50051
ENV CLINE_GRPC_PORT=${CLINE_GRPC_PORT_ARG}
RUN sudo sh -c 'mkdir -p /home/openvscode-server/.openvscode-server/data/User && \
    echo "{\n\
  \"extensions.autoUpdate\": false,\n\
  \"extensions.autoCheckUpdates\": false,\n\
  \"extensions.ignoreRecommendations\": false,\n\
  \"extensions.showRecommendationsOnlyOnDemand\": false,\n\
  \"extensions.confirmedUriHandlerExtensionIds\": [\"saoudrizwan.claude-dev\"],\n\
  \"cline.grpcPort\": ${CLINE_GRPC_PORT}\n\
}" > /home/openvscode-server/.openvscode-server/data/User/settings.json && \
    chown openvscode-server:openvscode-server /home/openvscode-server/.openvscode-server/data/User/settings.json'

# Ensure correct ownership
RUN sudo chown -R openvscode-server:openvscode-server /home/openvscode-server

# Set runtime environment variables
ENV USER_ID=default-user \
    CHROME_BIN=/usr/bin/chromium \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    OPENVSCODE_SERVER_AUTHENTICATION="password"

# Ensure entrypoint line endings are correct
RUN dos2unix /final-app/entrypoint.sh
RUN sudo chmod +x /final-app/entrypoint.sh

# Expose ports
EXPOSE 3000 ${CLINE_GRPC_PORT}

# Set entrypoint
ENTRYPOINT ["/final-app/entrypoint.sh"]

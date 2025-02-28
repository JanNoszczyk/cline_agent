#!/bin/bash

# Script to build and run the Cline Docker container

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker is not installed. Please install Docker first.${NC}"
    exit 1
fi

# Check if Docker Compose is installed
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose is not installed. Please install Docker Compose first.${NC}"
    exit 1
fi

# Source .env file if it exists
if [ -f ".env" ]; then
    echo -e "${GREEN}Sourcing environment variables from .env file...${NC}"
    export $(grep -v '^#' .env | xargs)
fi

# Check if CLINE_API_KEY is set
if [ -z "$CLINE_API_KEY" ]; then
    echo -e "${YELLOW}Warning: CLINE_API_KEY environment variable is not set.${NC}"
    echo -e "${YELLOW}You can set it with: export CLINE_API_KEY=your-api-key${NC}"
    echo -e "${YELLOW}Or add it to your .env file.${NC}"
    echo -e "${YELLOW}Continuing without an API key...${NC}"
fi

# Function to display help
show_help() {
    echo -e "${BLUE}Usage: $0 [OPTIONS]${NC}"
    echo -e "${BLUE}Options:${NC}"
    echo -e "  ${GREEN}--build${NC}          Build the Docker container"
    echo -e "  ${GREEN}--force-build${NC}    Force build the Docker container even if image exists"
    echo -e "  ${GREEN}--run${NC}            Run the Docker container"
    echo -e "  ${GREEN}--stop${NC}           Stop the Docker container"
    echo -e "  ${GREEN}--restart${NC}        Restart the Docker container"
    echo -e "  ${GREEN}--logs${NC}           Show the Docker container logs"
    echo -e "  ${GREEN}--test${NC}           Test the API server"
    echo -e "  ${GREEN}--disable-husky${NC}  Disable Husky git hooks for this repository"
    echo -e "  ${GREEN}--help${NC}           Show this help message"
    echo -e "${BLUE}Examples:${NC}"
    echo -e "  ${GREEN}$0 --build --run${NC}                Build and run the Docker container"
    echo -e "  ${GREEN}$0 --force-build --run${NC}          Force build and run the Docker container"
    echo -e "  ${GREEN}$0 --disable-husky --build --run${NC}  Build and run with Husky hooks disabled"
    echo -e "  ${GREEN}$0 --test${NC}                       Test the API server"
}

# Parse command line arguments
if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

BUILD=false
FORCE_BUILD=false
RUN=false
STOP=false
RESTART=false
LOGS=false
TEST=false
DISABLE_HUSKY=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --build)
            BUILD=true
            shift
            ;;
        --force-build)
            FORCE_BUILD=true
            shift
            ;;
        --run)
            RUN=true
            shift
            ;;
        --stop)
            STOP=true
            shift
            ;;
        --restart)
            RESTART=true
            shift
            ;;
        --logs)
            LOGS=true
            shift
            ;;
        --test)
            TEST=true
            shift
            ;;
        --disable-husky)
            DISABLE_HUSKY=true
            shift
            ;;
        --help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# Disable Husky hooks if requested
if [ "$DISABLE_HUSKY" = true ]; then
    echo -e "${YELLOW}Disabling Husky hooks...${NC}"
    if [ -f "./permanently-disable-husky.sh" ]; then
        # Run the script non-interactively
        echo "y" | ./permanently-disable-husky.sh
    else
        echo -e "${RED}permanently-disable-husky.sh script not found.${NC}"
        echo -e "${RED}Creating a simple workaround...${NC}"
        git config core.hooksPath /dev/null
        echo -e "${GREEN}Husky hooks disabled.${NC}"
    fi
fi

# Build the Docker container
if [ "$BUILD" = true ]; then
    # Check if image already exists
    if docker images -q cline_agent-cline-server > /dev/null 2>&1; then
        echo -e "${GREEN}Existing Docker image found. Using it instead of building a new one.${NC}"
        echo -e "${YELLOW}If you want to force a rebuild, use the --force-build flag instead of --build.${NC}"
    else
        echo -e "${YELLOW}No existing Docker image found. Building the Docker container...${NC}"
        docker-compose build
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to build the Docker container.${NC}"
            exit 1
        fi
        echo -e "${GREEN}Docker container built successfully.${NC}"
    fi
fi

# Force build the Docker container
if [ "$FORCE_BUILD" = true ]; then
    echo -e "${YELLOW}Force building the Docker container...${NC}"
    docker-compose build
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to build the Docker container.${NC}"
        exit 1
    fi
    echo -e "${GREEN}Docker container built successfully.${NC}"
fi

# Stop the Docker container
if [ "$STOP" = true ]; then
    echo -e "${YELLOW}Stopping the Docker container...${NC}"
    docker-compose down
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to stop the Docker container.${NC}"
        exit 1
    fi
    echo -e "${GREEN}Docker container stopped successfully.${NC}"
fi

# Restart the Docker container
if [ "$RESTART" = true ]; then
    echo -e "${YELLOW}Checking for running containers...${NC}"
    
    # Check if the container is already running
    if docker ps --format '{{.Names}}' | grep -q "cline_agent-cline-server"; then
        echo -e "${GREEN}Container is already running. Attempting to connect...${NC}"
        
        # Test the API connection
        if curl -s -o /dev/null -w "%{http_code}" -X GET -H "X-API-Key: test-api-key" http://localhost:3000/api/state | grep -q "200"; then
            echo -e "${GREEN}Successfully connected to the API server.${NC}"
        else
            echo -e "${YELLOW}Could not connect to the API server. Restarting container...${NC}"
            docker-compose restart
            if [ $? -ne 0 ]; then
                echo -e "${RED}Failed to restart the Docker container.${NC}"
                exit 1
            fi
            echo -e "${GREEN}Docker container restarted successfully.${NC}"
        fi
    else
        echo -e "${YELLOW}No running container found. Starting container...${NC}"
        docker-compose up -d
        if [ $? -ne 0 ]; then
            echo -e "${RED}Failed to start the Docker container.${NC}"
            exit 1
        fi
        echo -e "${GREEN}Docker container started successfully.${NC}"
    fi
fi

# Run the Docker container
if [ "$RUN" = true ]; then
    echo -e "${YELLOW}Running the Docker container...${NC}"
    docker-compose up -d
    if [ $? -ne 0 ]; then
        echo -e "${RED}Failed to run the Docker container.${NC}"
        exit 1
    fi
    echo -e "${GREEN}Docker container is now running.${NC}"
    echo -e "${GREEN}You can access the code-server instance at http://localhost:8080${NC}"
fi

# Show the Docker container logs
if [ "$LOGS" = true ]; then
    echo -e "${YELLOW}Showing the Docker container logs...${NC}"
    docker-compose logs -f
fi

# Test the API server
if [ "$TEST" = true ]; then
    echo -e "${YELLOW}Testing the API server...${NC}"
    ./test-api.sh
fi

exit 0

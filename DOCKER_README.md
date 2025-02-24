# Cline Docker Setup

This document provides instructions for setting up and using the Cline extension in a Docker container.

## Prerequisites

- Docker and Docker Compose installed on your system
- An API key for Cline (if required)

## Setup

1. Clone this repository:
   ```bash
   git clone https://github.com/cline/cline.git
   cd cline
   ```

2. Set your API key as an environment variable:
   ```bash
   export CLINE_API_KEY=your-api-key
   ```

3. Make the helper scripts executable:
   ```bash
   chmod +x run-docker.sh test-api.sh
   ```

4. Build and run the Docker container using the provided script:
   ```bash
   ./run-docker.sh --build --run
   ```

   Or manually with Docker Compose:
   ```bash
   docker-compose up --build
   ```

5. Access the code-server instance at http://localhost:8080

### Helper Script

The repository includes a helper script `run-docker.sh` that simplifies working with the Docker container:

```bash
# Show help
./run-docker.sh --help

# Build the Docker container
./run-docker.sh --build

# Run the Docker container
./run-docker.sh --run

# Build and run the Docker container
./run-docker.sh --build --run

# Stop the Docker container
./run-docker.sh --stop

# Restart the Docker container
./run-docker.sh --restart

# Show the Docker container logs
./run-docker.sh --logs

# Test the API server
./run-docker.sh --test

# Disable Husky git hooks and build/run the container
./run-docker.sh --disable-husky --build --run
```

The `--disable-husky` option permanently disables Husky git hooks for the repository, allowing you to commit changes without linting checks. This is useful when working with the Docker container where linting checks are not needed.

## Testing the Cline Extension

The repository includes several test files in the `test-workspace` directory:

- `sample.txt`: A simple text file for testing file reading
- `index.html`: An HTML file for testing browser integration
- `app.js`: A JavaScript file with a TODO comment for testing code completion
- `test-cline.md`: A markdown file with instructions for testing the Cline extension

To test the Cline extension:

1. Open the code-server instance at http://localhost:8080
2. Navigate to the `test-workspace` directory
3. Open the `test-cline.md` file for detailed testing instructions

## Verifying the API Server

The Cline extension includes an API server that runs on port 3000. To verify that the API server is working correctly, you can use the provided test script:

```bash
./test-api.sh
```

This script will check if the API server is running and responding correctly.

## Troubleshooting

If you encounter issues with the API server, try the following:

1. Make sure the container is running:
   ```bash
   docker-compose ps
   ```

2. Check the container logs:
   ```bash
   docker-compose logs cline-server
   ```

3. Verify that the API server is exposed on port 3000:
   ```bash
   docker-compose exec cline-server netstat -tulpn | grep 3000
   ```

4. Ensure that the extension is properly installed in the code-server instance:
   ```bash
   docker-compose exec cline-server code-server --list-extensions
   ```

5. Check if the API key is properly set in the container:
   ```bash
   docker-compose exec cline-server printenv | grep CLINE_API_KEY
   ```

6. Verify that the settings.json file is properly configured:
   ```bash
   docker-compose exec cline-server cat /home/coder/.local/share/code-server/User/settings.json
   ```

## Configuration

The Docker container is configured with the following:

- The Cline extension is installed in the code-server instance
- The API server is exposed on port 3000
- The code-server instance is exposed on port 8080
- The test-workspace directory is mounted as a volume in the container

You can modify these settings in the `docker-compose.yml` file.

## Disabling Linting Checks for Git Commits

When working with the Docker container, you may want to disable the linting checks that run before each git commit. The repository includes two scripts to help with this:

### Temporarily Disable Husky for a Single Command

The `disable-husky.sh` script temporarily disables Husky hooks for a single git command:

```bash
# Make the script executable
chmod +x disable-husky.sh

# Run git commit without linting checks
./disable-husky.sh commit -m "Your commit message"

# Run git add without linting checks
./disable-husky.sh add .

# Run git push without linting checks
./disable-husky.sh push
```

### Permanently Disable Husky for the Repository

The `permanently-disable-husky.sh` script permanently disables Husky hooks for the repository:

```bash
# Make the script executable
chmod +x permanently-disable-husky.sh

# Run the script
./permanently-disable-husky.sh
```

This will modify the git configuration for this repository only, setting `core.hooksPath` to `/dev/null`. To re-enable Husky hooks, run:

```bash
git config --unset core.hooksPath
```

## Additional Information

For more information about the Cline extension, see the [Cline documentation](https://docs.cline.bot/).

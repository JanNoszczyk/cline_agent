package grpctesting

import (
	"bytes"
	"context"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// DockerOrchestrator manages Docker container lifecycle for testing
type DockerOrchestrator struct {
	config      ExtensionConfig
	containerID string
	debugMode   bool
}

// NewDockerOrchestrator creates a new Docker orchestrator
func NewDockerOrchestrator(config ExtensionConfig) *DockerOrchestrator {
	return &DockerOrchestrator{
		config: config,
	}
}

// SetDebugMode enables/disables debug logging
func (d *DockerOrchestrator) SetDebugMode(enabled bool) {
	d.debugMode = enabled
}

// BuildImage builds the Docker image for testing
func (d *DockerOrchestrator) BuildImage(ctx context.Context) error {
	dockerfilePath := filepath.Join(d.config.GetWorkspacePath(), "Dockerfile")
	
	// Check if custom Dockerfile exists, otherwise use default template
	if _, err := os.Stat(dockerfilePath); os.IsNotExist(err) {
		if err := d.createDefaultDockerfile(dockerfilePath); err != nil {
			return fmt.Errorf("failed to create Dockerfile: %w", err)
		}
	}
	
	cmd := exec.CommandContext(ctx, "docker", "build",
		"-t", fmt.Sprintf("%s-test", d.config.GetExtensionID()),
		"-f", dockerfilePath,
		d.config.GetWorkspacePath(),
	)
	
	if d.debugMode {
		cmd.Stdout = os.Stdout
		cmd.Stderr = os.Stderr
	}
	
	return cmd.Run()
}

// StartContainer starts the Docker container
func (d *DockerOrchestrator) StartContainer(ctx context.Context) error {
	vsixPath := d.config.GetExtensionPath()
	if !filepath.IsAbs(vsixPath) {
		var err error
		vsixPath, err = filepath.Abs(vsixPath)
		if err != nil {
			return fmt.Errorf("failed to get absolute path for VSIX: %w", err)
		}
	}
	
	args := []string{
		"run", "-d",
		"--name", fmt.Sprintf("%s-test-container", d.config.GetExtensionID()),
		"-p", fmt.Sprintf("%d:%d", d.config.GetGrpcPort(), d.config.GetGrpcPort()),
		"-v", fmt.Sprintf("%s:/extension.vsix:ro", vsixPath),
		"-e", fmt.Sprintf("GRPC_PORT=%d", d.config.GetGrpcPort()),
		"-e", fmt.Sprintf("EXTENSION_ID=%s", d.config.GetExtensionID()),
		fmt.Sprintf("%s-test", d.config.GetExtensionID()),
	}
	
	cmd := exec.CommandContext(ctx, "docker", args...)
	
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = os.Stderr
	
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("failed to start container: %w", err)
	}
	
	d.containerID = strings.TrimSpace(out.String())
	return nil
}

// StopContainer stops and removes the Docker container
func (d *DockerOrchestrator) StopContainer(ctx context.Context) error {
	if d.containerID == "" {
		return nil
	}
	
	// Stop container
	stopCmd := exec.CommandContext(ctx, "docker", "stop", d.containerID)
	if err := stopCmd.Run(); err != nil {
		return fmt.Errorf("failed to stop container: %w", err)
	}
	
	// Remove container
	rmCmd := exec.CommandContext(ctx, "docker", "rm", d.containerID)
	if err := rmCmd.Run(); err != nil {
		return fmt.Errorf("failed to remove container: %w", err)
	}
	
	d.containerID = ""
	return nil
}

// GetLogs retrieves container logs
func (d *DockerOrchestrator) GetLogs(ctx context.Context) (string, error) {
	if d.containerID == "" {
		return "", fmt.Errorf("no container running")
	}
	
	cmd := exec.CommandContext(ctx, "docker", "logs", d.containerID)
	
	var out bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &out
	
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("failed to get logs: %w", err)
	}
	
	return out.String(), nil
}

// WaitForReady waits for the extension to be ready
func (d *DockerOrchestrator) WaitForReady(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	
	for time.Now().Before(deadline) {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
			// Check if gRPC port is accessible
			cmd := exec.CommandContext(ctx, "docker", "exec", d.containerID,
				"nc", "-z", "localhost", fmt.Sprintf("%d", d.config.GetGrpcPort()))
			
			if err := cmd.Run(); err == nil {
				return nil // Port is open, extension is ready
			}
			
			time.Sleep(1 * time.Second)
		}
	}
	
	return fmt.Errorf("timeout waiting for extension to be ready")
}

// createDefaultDockerfile creates a default Dockerfile template
func (d *DockerOrchestrator) createDefaultDockerfile(path string) error {
	template := `FROM mcr.microsoft.com/vscode/devcontainers/base:ubuntu

# Install VS Code Server
RUN curl -fsSL https://code-server.dev/install.sh | sh

# Install extension dependencies
RUN apt-get update && apt-get install -y \
    netcat \
    && rm -rf /var/lib/apt/lists/*

# Copy and install extension
COPY extension.vsix /tmp/extension.vsix
RUN code-server --install-extension /tmp/extension.vsix

# Set up workspace
WORKDIR /workspace

# Entry point
CMD ["code-server", "--bind-addr", "0.0.0.0:8080", "--auth", "none", "/workspace"]
`
	
	return os.WriteFile(path, []byte(template), 0644)
}
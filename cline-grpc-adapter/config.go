package adapter

import (
	"path/filepath"
)

// ClineConfig implements the ExtensionConfig interface for Cline
type ClineConfig struct {
	extensionPath string
	grpcPort      int
	workspacePath string
	protoPath     string
}

// NewClineConfig creates a new Cline configuration
func NewClineConfig(extensionPath string, grpcPort int, workspacePath string) *ClineConfig {
	return &ClineConfig{
		extensionPath: extensionPath,
		grpcPort:      grpcPort,
		workspacePath: workspacePath,
		protoPath:     "./proto", // Default proto path
	}
}

// GetExtensionPath returns the path to the VSIX file
func (c *ClineConfig) GetExtensionPath() string {
	return c.extensionPath
}

// GetGrpcPort returns the port number for the gRPC server
func (c *ClineConfig) GetGrpcPort() int {
	return c.grpcPort
}

// GetGrpcHost returns the hostname for the gRPC server
func (c *ClineConfig) GetGrpcHost() string {
	return "localhost"
}

// GetProtoPath returns the path to the proto definitions
func (c *ClineConfig) GetProtoPath() string {
	return c.protoPath
}

// GetExtensionID returns the extension identifier
func (c *ClineConfig) GetExtensionID() string {
	return "rooveterinaryinc.cline"
}

// GetWorkspacePath returns the path to the test workspace
func (c *ClineConfig) GetWorkspacePath() string {
	if c.workspacePath == "" {
		// Default to current directory
		abs, _ := filepath.Abs(".")
		return abs
	}
	return c.workspacePath
}

// SetProtoPath allows overriding the proto path
func (c *ClineConfig) SetProtoPath(path string) {
	c.protoPath = path
}
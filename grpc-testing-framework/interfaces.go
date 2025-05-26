package grpctesting

import (
	"context"
	"google.golang.org/grpc"
)

// ExtensionConfig defines the configuration needed to test a VS Code extension
type ExtensionConfig interface {
	// GetExtensionPath returns the path to the VSIX file
	GetExtensionPath() string
	
	// GetGrpcPort returns the port number for the gRPC server
	GetGrpcPort() int
	
	// GetGrpcHost returns the hostname for the gRPC server
	GetGrpcHost() string
	
	// GetProtoPath returns the path to the proto definitions
	GetProtoPath() string
	
	// GetExtensionID returns the extension identifier (e.g., "publisher.extension-name")
	GetExtensionID() string
	
	// GetWorkspacePath returns the path to the test workspace
	GetWorkspacePath() string
}

// TestRunner defines the interface for implementing test scenarios
type TestRunner interface {
	// Setup is called after the gRPC connection is established
	Setup(conn *grpc.ClientConn) error
	
	// RunTests executes the test scenarios
	RunTests(ctx context.Context) error
	
	// Cleanup is called after tests complete (regardless of success/failure)
	Cleanup() error
	
	// GetTestName returns a descriptive name for the test suite
	GetTestName() string
}

// TestResult represents the outcome of a test execution
type TestResult struct {
	Success bool
	Error   error
	Details map[string]interface{}
	Logs    []string
}

// TestFramework orchestrates the testing process
type TestFramework interface {
	// Run executes the test runner with the provided configuration
	Run(runner TestRunner) (*TestResult, error)
	
	// SetTimeout configures the maximum duration for test execution
	SetTimeout(duration int) // in seconds
	
	// EnableDebugMode enables verbose logging
	EnableDebugMode(enabled bool)
}
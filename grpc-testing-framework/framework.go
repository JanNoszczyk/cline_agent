package grpctesting

import (
	"context"
	"fmt"
	"log"
	"time"
	
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
)

// DefaultTestFramework is the default implementation of TestFramework
type DefaultTestFramework struct {
	config       ExtensionConfig
	orchestrator *DockerOrchestrator
	timeout      time.Duration
	debugMode    bool
}

// NewTestFramework creates a new test framework instance
func NewTestFramework(config ExtensionConfig) TestFramework {
	return &DefaultTestFramework{
		config:       config,
		orchestrator: NewDockerOrchestrator(config),
		timeout:      10 * time.Minute, // Default timeout
	}
}

// SetTimeout configures the maximum duration for test execution
func (f *DefaultTestFramework) SetTimeout(seconds int) {
	f.timeout = time.Duration(seconds) * time.Second
}

// EnableDebugMode enables verbose logging
func (f *DefaultTestFramework) EnableDebugMode(enabled bool) {
	f.debugMode = enabled
	f.orchestrator.SetDebugMode(enabled)
}

// Run executes the test runner with the provided configuration
func (f *DefaultTestFramework) Run(runner TestRunner) (*TestResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), f.timeout)
	defer cancel()
	
	result := &TestResult{
		Success: false,
		Details: make(map[string]interface{}),
		Logs:    []string{},
	}
	
	// Phase 1: Build Docker image
	f.log("Building Docker image...")
	if err := f.orchestrator.BuildImage(ctx); err != nil {
		result.Error = fmt.Errorf("failed to build Docker image: %w", err)
		return result, result.Error
	}
	
	// Phase 2: Start container
	f.log("Starting Docker container...")
	if err := f.orchestrator.StartContainer(ctx); err != nil {
		result.Error = fmt.Errorf("failed to start container: %w", err)
		return result, result.Error
	}
	
	// Ensure cleanup happens
	defer func() {
		f.log("Cleaning up container...")
		if err := f.orchestrator.StopContainer(context.Background()); err != nil {
			f.log("Warning: failed to stop container: %v", err)
		}
	}()
	
	// Phase 3: Wait for extension to be ready
	f.log("Waiting for extension to be ready...")
	if err := f.orchestrator.WaitForReady(ctx, 30*time.Second); err != nil {
		result.Error = fmt.Errorf("extension failed to become ready: %w", err)
		return result, result.Error
	}
	
	// Phase 4: Establish gRPC connection
	f.log("Establishing gRPC connection...")
	conn, err := f.establishGrpcConnection(ctx)
	if err != nil {
		result.Error = fmt.Errorf("failed to establish gRPC connection: %w", err)
		return result, result.Error
	}
	defer conn.Close()
	
	// Phase 5: Run test setup
	f.log("Running test setup for: %s", runner.GetTestName())
	if err := runner.Setup(conn); err != nil {
		result.Error = fmt.Errorf("test setup failed: %w", err)
		return result, result.Error
	}
	
	// Phase 6: Execute tests
	f.log("Executing tests...")
	testErr := runner.RunTests(ctx)
	
	// Phase 7: Run cleanup
	f.log("Running test cleanup...")
	if err := runner.Cleanup(); err != nil {
		f.log("Warning: test cleanup failed: %v", err)
	}
	
	// Phase 8: Collect logs
	if logs, err := f.orchestrator.GetLogs(ctx); err == nil {
		result.Logs = append(result.Logs, logs)
	}
	
	// Set final result
	if testErr != nil {
		result.Error = fmt.Errorf("tests failed: %w", testErr)
	} else {
		result.Success = true
		f.log("All tests passed!")
	}
	
	return result, nil
}

// establishGrpcConnection creates a gRPC connection to the extension
func (f *DefaultTestFramework) establishGrpcConnection(ctx context.Context) (*grpc.ClientConn, error) {
	target := fmt.Sprintf("%s:%d", f.config.GetGrpcHost(), f.config.GetGrpcPort())
	
	dialCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
	defer cancel()
	
	conn, err := grpc.DialContext(dialCtx, target,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
		grpc.WithBlock(),
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(50*1024*1024)), // 50MB max message size
	)
	
	if err != nil {
		return nil, fmt.Errorf("failed to connect to gRPC server at %s: %w", target, err)
	}
	
	return conn, nil
}

// log logs a message if debug mode is enabled
func (f *DefaultTestFramework) log(format string, args ...interface{}) {
	if f.debugMode {
		log.Printf("[TestFramework] "+format, args...)
	}
}
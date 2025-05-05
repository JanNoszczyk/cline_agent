package main

import (
	"context"
	"flag" // Import the flag package
	"fmt"
	"log"
	"os"
	"strconv"
	"time"

	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure" // Use insecure credentials for local connection
	// Import necessary protobuf definitions if client calls are made later
	// pb "sandboxclient/genproto/task_control"
)

const (
	defaultGrpcPort = 50051
	defaultGrpcHost = "localhost" // Changed from host.docker.internal as requested
)

func main() {
	log.Println("Starting Go gRPC Sandbox Client...")

	// --- Define and Parse Flags ---
	testMode := flag.Bool("test", false, "Run in test mode")
	flag.Parse() // Parse command-line flags

	// --- Get Host and Port from Environment ---
	grpcPort := defaultGrpcPort
	portStr := os.Getenv("CLINE_GRPC_PORT")
	if portStr != "" {
		if p, err := strconv.Atoi(portStr); err == nil && p > 0 && p <= 65535 {
			grpcPort = p
		} else {
			log.Printf("Warning: Invalid CLINE_GRPC_PORT '%s'. Using default %d. Error: %v", portStr, defaultGrpcPort, err)
		}
	}

	// For intra-container communication, always use localhost.
	// The CLINE_GRPC_HOST from docker-compose (host.docker.internal) is for host access, not relevant here.
	grpcHost := "localhost" // Hardcode to localhost for intra-container
	log.Printf("Forcing gRPC host to '%s' for intra-container communication.", grpcHost)

	targetAddr := fmt.Sprintf("%s:%d", grpcHost, grpcPort)
	log.Printf("Attempting to connect to gRPC server at: %s", targetAddr)

	// --- Establish gRPC Client Connection ---
	// Use context with timeout for the initial connection attempt
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second) // 30-second timeout for dialing
	defer cancel()

	conn, err := grpc.DialContext(ctx, targetAddr,
		grpc.WithTransportCredentials(insecure.NewCredentials()), // Use insecure transport for local dev
		grpc.WithBlock(), // Block until connection is established or context times out
		grpc.WithDefaultCallOptions(grpc.MaxCallRecvMsgSize(50*1024*1024)), // Increase max receive message size to 50MB
	)
	if err != nil {
		log.Fatalf("Failed to connect to gRPC server at %s: %v", targetAddr, err)
	}
	defer conn.Close() // Ensure connection is closed when main exits

	log.Printf("Successfully connected to gRPC server at %s", targetAddr)

	// --- Conditional Logic based on -test flag ---
	if *testMode {
		log.Println("Running in TEST mode...")
		err := runGrpcTest(conn) // Call the test logic function from grpc_client_test_logic.go
		if err != nil {
			log.Printf("runGrpcTest failed: %v", err)
			os.Exit(1)
		}
		log.Println("runGrpcTest completed successfully.")
		os.Exit(0)
	} else {
		// Keep the client running indefinitely in normal mode
		log.Println("Go client setup complete. Running in normal mode (waiting indefinitely)...")
		select {} // Block forever
	}
}

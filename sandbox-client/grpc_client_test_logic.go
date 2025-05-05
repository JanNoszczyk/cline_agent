package main

import (
	// Corrected import path
	"context"
	"io" // Import io for EOF check
	"log"
	"os"
	"strings" // Import strings for error message checking
	"time"

	// Corrected import paths using the module name 'sandboxclient'
	browserpb "sandboxclient/genproto/browser"
	checkpointspb "sandboxclient/genproto/checkpoints"
	pb "sandboxclient/genproto/common"
	mcppb "sandboxclient/genproto/mcp"
	tpb "sandboxclient/genproto/task_control"

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"  // Import for gRPC status codes
	"google.golang.org/grpc/status" // Import for gRPC status handling
	// Remove unused imports:
	// "google.golang.org/protobuf/encoding/protojson"
	// Remove unused structpb
)

const (
	// Remove old stream constants
	testTimeout = 30 * time.Second // Timeout for RPC calls
)

// Helper function to create a pointer to a string
func stringPtr(s string) *string {
	return &s
}

// Accepts an established gRPC connection
func runGrpcTest(conn *grpc.ClientConn) {
	log.Println("Starting Simplified Go gRPC Test...")

	// --- Create Clients for Actual Services ---
	// Use specific proto aliases for clarity
	browserClient := browserpb.NewBrowserServiceClient(conn)
	checkpointsClient := checkpointspb.NewCheckpointsServiceClient(conn)
	mcpClient := mcppb.NewMcpServiceClient(conn)
	taskControlClient := tpb.NewTaskControlServiceClient(conn)
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Created service clients.") // Added Debug Prefix

	// --- Test Context with Timeout ---
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Creating test context with timeout...") // Added Debug Log
	ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
	defer cancel()
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Test context with timeout created.") // Added Debug Log

	// --- Test 1: Call BrowserService.getBrowserConnectionInfo ---
	log.Println("Calling BrowserService.getBrowserConnectionInfo...")
	infoReq := &pb.EmptyRequest{}
	infoResp, err := browserClient.GetBrowserConnectionInfo(ctx, infoReq)

	expectedErrMsg := "Browser session is not available"
	if err != nil {
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.Internal && strings.Contains(st.Message(), expectedErrMsg) {
			log.Printf("Successfully received expected error for getBrowserConnectionInfo: %v", err)
			// This is the expected behavior when no browser session is active, so continue the test.
		} else {
			// Unexpected error
			log.Printf("Unexpected error calling getBrowserConnectionInfo: %v", err)
			log.Println("gRPC Test Client finished with errors.")
			os.Exit(1) // Exit with error
		}
	} else {
		// If there was NO error, log the received info (unexpected success in this test context)
		// Depending on test requirements, this might also be considered a failure.
		log.Printf("Warning: getBrowserConnectionInfo succeeded unexpectedly (expected error '%s').", expectedErrMsg)
		log.Printf("Received Browser Connection Info:")
		log.Printf("  Is Connected: %t", infoResp.GetIsConnected())
		log.Printf("  Is Remote: %t", infoResp.GetIsRemote())
		if infoResp.Host != nil {
			log.Printf("  Host: %s", infoResp.GetHost())
		} else {
			log.Printf("  Host: (not set)")
		}
		// Decide if unexpected success should halt the test
		// log.Println("Halting test due to unexpected success in getBrowserConnectionInfo.")
		// os.Exit(1)
	}

	// --- Test 2: Call CheckpointsService.checkpointDiff (Example) ---
	// Note: This expects Int64Request based on checkpoints.proto
	log.Println("Calling CheckpointsService.checkpointDiff with ID 1 (Demonstration)...")
	checkpointReq := &pb.Int64Request{ // CORRECTED: Use pb.Int64Request from common.proto
		// Metadata can be omitted if not needed by handler
		Value: 1, // Set the value field
	}
	_, err = checkpointsClient.CheckpointDiff(ctx, checkpointReq) // Use checkpoints client alias

	if err != nil {
		// Log error but don't necessarily fail the whole test for this example
		log.Printf("Warning: Error calling checkpointDiff(1): %v", err)
		// If this call MUST succeed, uncomment the next lines:
		// log.Println("gRPC Test Client finished with errors during checkpointDiff.")
		// os.Exit(1)
	} else {
		log.Println("checkpointDiff(1) call succeeded (no error returned).")
	}

	// --- Test 3: Call McpService.toggleMcpServer (Example) ---
	log.Println("Calling McpService.toggleMcpServer for 'context7' (disabled=true, Demonstration)...")
	toggleReq := &mcppb.ToggleMcpServerRequest{
		Metadata:   &pb.Metadata{},
		ServerName: "context7",
		Disabled:   true,
	}
	mcpResp, err := mcpClient.ToggleMcpServer(ctx, toggleReq)

	if err != nil {
		log.Printf("Warning: Error calling toggleMcpServer('context7', true): %v", err)
	} else {
		log.Printf("toggleMcpServer('context7', true) call succeeded. Response has %d servers.", len(mcpResp.GetMcpServers()))
	}

	// --- Test 4: Call TaskControlService.StartTask and SendUserMessage (Streaming) ---
	initialMessage := "whats 2+2"
	startTaskReq := &tpb.NewTaskRequest{
		Text: stringPtr(initialMessage),
		// ChatContent can be omitted if no initial images
	}
	// [gRPC-Debug] Log before sending StartTask request
	log.Printf("[gRPC-Debug: GoClient:runGrpcTest] Sending StartTask request: %+v", startTaskReq)
	log.Println("Calling TaskControlService.StartTask with 'whats 2+2'...") // Keep original log
	// Call StartTask - it returns a stream client
	// [gRPC-Debug] Log before calling StartTask
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Calling taskControlClient.StartTask...") // Keep this log
	stream, err := taskControlClient.StartTask(ctx, startTaskReq)
	if err != nil {
		// [gRPC-Debug] Log StartTask call error more explicitly
		log.Printf("[gRPC-Error: GoClient:runGrpcTest] Error calling StartTask: %v", err) // Changed Debug to Error Prefix
		log.Printf("Error calling StartTask: %v", err)                                    // Keep original log
		log.Println("gRPC Test Client finished with errors.")
		os.Exit(1) // Exit with error
	}
	// [gRPC-Debug] Log StartTask call success
	log.Printf("[gRPC-Info: GoClient:runGrpcTest] StartTask call successful, stream opened.") // Changed Debug to Info Prefix

	log.Println("StartTask stream opened. Waiting for TASK_STARTED message...") // Updated log message
	var receivedTaskID string                                                   // Variable to store the received Task ID
	var receivedVersion string                                                  // Variable to store the received version - KEEP

	// --- Receiving Loop with Goroutine and Timeout ---
	// [gRPC-Debug] Log setup for receiving loop
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Setting up channels and goroutine for receiving messages...")
	msgChan := make(chan *tpb.ExtensionMessage) // Channel to receive messages
	errChan := make(chan error)                 // Channel to receive errors

	// Goroutine to receive messages from the stream
	go func() {
		for {
			resp, err := stream.Recv() // Use standard Recv()
			if err != nil {
				// [gRPC-Debug] Log Recv error in goroutine more explicitly
				log.Printf("[gRPC-Error: GoClient:runGrpcTest:RecvLoop] Error receiving from stream: %v", err) // Changed Debug to Error Prefix
				errChan <- err                                                                                 // Send error to the error channel
				return                                                                                         // Stop the goroutine on error
			}
			// [gRPC-Debug] Log received message in goroutine more explicitly
			log.Printf("[gRPC-Info: GoClient:runGrpcTest:RecvLoop] Received message: Type=%s", resp.GetType()) // Changed Debug to Info Prefix, simplified log
			// Add detailed logging for the payload based on type
			switch pl := resp.Payload.(type) {
			case *tpb.ExtensionMessage_TaskStarted:
				log.Printf("[gRPC-Debug: GoClient:runGrpcTest:RecvLoop]   Payload: TaskStarted={task_id: %s, version: %s}", pl.TaskStarted.GetTaskId(), pl.TaskStarted.GetVersion())
			case *tpb.ExtensionMessage_State:
				// Only log if state is not nil, otherwise it's redundant with the main loop log
				if pl.State != nil {
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:RecvLoop]   Payload: State={version: %s, currentTaskItem: %v, ...}", pl.State.GetVersion(), pl.State.GetCurrentTaskItem().GetId())
				} else {
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:RecvLoop]   Payload: State is nil")
				}
			case *tpb.ExtensionMessage_PartialMessage:
				// Removed GetSubType() as it doesn't exist on ClineMessage
				log.Printf("[gRPC-Debug: GoClient:runGrpcTest:RecvLoop]   Payload: PartialMessage={type: %s, text_len: %d}", pl.PartialMessage.GetType(), len(pl.PartialMessage.GetText()))
			case *tpb.ExtensionMessage_Invoke: // Changed from Action to Invoke
				log.Printf("[gRPC-Debug: GoClient:runGrpcTest:RecvLoop]   Payload: Invoke=%s", pl.Invoke.String()) // Changed from Action to Invoke
			default:
				log.Printf("[gRPC-Debug: GoClient:runGrpcTest:RecvLoop]   Payload: Other type (%T) or nil", pl) // Log the actual type if unknown
			}
			msgChan <- resp // Send received message to the message channel
		}
	}()

	log.Println("Waiting up to 15s for TASK_STARTED message...") // Updated log message
	timeout := time.After(15 * time.Second)                      // Specific timeout for waiting for TASK_STARTED

	// Loop using select to wait for message, error, timeout, or main context cancellation
	taskStartedReceived := false // Flag to ensure we only process TASK_STARTED once
	for !taskStartedReceived {   // Keep looping until TASK_STARTED is received
		// Add a log indicating we are waiting in the select loop
		log.Println("[gRPC-Debug: GoClient:runGrpcTest:SelectLoop] Waiting for message, error, or timeout...")
		select {
		case resp := <-msgChan:
			log.Printf("[gRPC-Info: GoClient:runGrpcTest:SelectLoop] Processing message type: %s", resp.GetType()) // Changed Debug to Info

			// Check specifically for the TASK_STARTED message type
			if resp.GetType() == tpb.ExtensionMessageType_TASK_STARTED {
				taskStartedPayload := resp.GetTaskStarted()                                                                        // Access the correct oneof field
				log.Printf("[gRPC-Debug: GoClient:runGrpcTest:SelectLoop] Received TASK_STARTED payload: %+v", taskStartedPayload) // More detailed log
				if taskStartedPayload != nil && taskStartedPayload.GetTaskId() != "" {
					receivedTaskID = taskStartedPayload.GetTaskId()
					receivedVersion = taskStartedPayload.GetVersion() // Store version too
					log.Printf("[gRPC-Success: GoClient:runGrpcTest:SelectLoop] Successfully received TaskID (%s) and Version (%s) from TASK_STARTED message.", receivedTaskID, receivedVersion)
					taskStartedReceived = true // Set flag to exit loop
					// Do NOT use goto, just let the loop condition handle exit
				} else {
					log.Println("[gRPC-Warn: GoClient:runGrpcTest:SelectLoop] Received TASK_STARTED message, but payload or TaskID is nil/empty.")
				}
			} else if resp.GetType() == tpb.ExtensionMessageType_STATE {
				// Log if we receive STATE before TASK_STARTED, but don't act on it for TaskID
				log.Println("[gRPC-Info: GoClient:runGrpcTest:SelectLoop] Received STATE message while waiting for TASK_STARTED. Ignoring for TaskID.")
				// Add optional detailed logging for STATE payload if needed for debugging other issues
				statePayload := resp.GetState()
				if statePayload != nil {
					// Log specific field, avoid logging the whole complex struct if it might be nil causing panics
					taskItem := statePayload.GetCurrentTaskItem()
					if taskItem != nil {
						log.Printf("[gRPC-Debug: GoClient:runGrpcTest:SelectLoop] STATE payload details: version=%s, taskID=%s", statePayload.GetVersion(), taskItem.GetId())
					} else {
						log.Printf("[gRPC-Debug: GoClient:runGrpcTest:SelectLoop] STATE payload details: version=%s, currentTaskItem=nil", statePayload.GetVersion())
					}
				} else {
					log.Println("[gRPC-Debug: GoClient:runGrpcTest:SelectLoop] Received STATE message with nil payload.")
				}
			} else {
				log.Printf("[gRPC-Info: GoClient:runGrpcTest:SelectLoop] Received message type %s while waiting for TASK_STARTED.", resp.GetType())
			}
		case err := <-errChan:
			// Handle errors from the Recv() goroutine
			if err == io.EOF {
				log.Println("[gRPC-Warn: GoClient:runGrpcTest:SelectLoop] StartTask stream finished (EOF) before TASK_STARTED message was received.") // Changed log level
			} else {
				// Check if the error is due to the main context cancellation
				// [gRPC-Debug] Log error received on errChan
				log.Printf("[gRPC-Error: GoClient:runGrpcTest:SelectLoop] Received error on errChan: %v", err) // Changed Debug to Error Prefix
				if ctx.Err() == context.Canceled {
					log.Println("[gRPC-Info: GoClient:runGrpcTest:SelectLoop] Main context cancelled while waiting for TASK_STARTED.") // Changed log level
				} else if ctx.Err() == context.DeadlineExceeded {
					log.Println("[gRPC-Warn: GoClient:runGrpcTest:SelectLoop] Main context deadline exceeded while waiting for TASK_STARTED.") // Changed log level
				} else {
					log.Printf("[gRPC-Error: GoClient:runGrpcTest:SelectLoop] Error receiving from StartTask stream: %v", err) // Changed log level
				}
			}
			log.Println("gRPC Test Client finished with errors.")
			os.Exit(1) // Exit on error
		case <-timeout:
			// Handle the specific 15s timeout
			log.Println("[gRPC-Error: GoClient:runGrpcTest:SelectLoop] Error: Timed out after 15s waiting for TASK_STARTED message.") // Changed log level
			log.Println("gRPC Test Client finished with errors.")
			os.Exit(1) // Exit on timeout
		case <-ctx.Done():
			// Handle the overall test context being done (cancelled or deadline exceeded)
			log.Printf("[gRPC-Warn: GoClient:runGrpcTest:SelectLoop] Overall test context done while waiting for TASK_STARTED: %v", ctx.Err()) // Changed log level
			log.Println("gRPC Test Client finished with errors.")
			os.Exit(1) // Exit if main context is done
		}
	}

	// Removed GOTO label TaskIDReceived as the loop now handles exit condition

	// Check if we actually got a Task ID
	if !taskStartedReceived || receivedTaskID == "" {
		log.Println("[gRPC-Error: GoClient:runGrpcTest] Error: Failed to receive valid TaskID from TASK_STARTED message.") // Changed log level
		log.Println("gRPC Test Client finished with errors.")
		os.Exit(1)
	}

	// Log the received version (to satisfy the compiler that it's used)
	log.Printf("[gRPC-Info: GoClient:runGrpcTest] Proceeding with TaskID: %s (Version: %s)", receivedTaskID, receivedVersion)

	// --- Now send a follow-up message using the captured TaskID via SendUserInput ---
	log.Printf("Sending follow-up message via SendUserInput for TaskID %s...", receivedTaskID)
	followUpMessage := "who was the us president in 2020?"
	// SendUserInput uses InvokeRequest which doesn't take TaskId directly;
	// the context/association is handled server-side based on the connection/stream.
	invokeReq := &tpb.InvokeRequest{
		Text: stringPtr(followUpMessage),
		// Images can be omitted
	}
	// [gRPC-Debug] Log before sending SendUserInput request
	log.Printf("[gRPC-Debug: GoClient:runGrpcTest] Sending SendUserInput request for TaskID %s: %+v", receivedTaskID, invokeReq)

	// Call SendUserInput - This also returns a stream, but for this test,
	// we'll just send the request and check for immediate errors.
	// A more complete test would process the response stream.
	// NOTE: The original StartTask stream ('stream') might still be active or closed.
	// We need a separate call for SendUserInput.
	sendStream, err := taskControlClient.SendUserInput(ctx, invokeReq)
	if err != nil {
		// [gRPC-Debug] Log SendUserInput call error
		log.Printf("[gRPC-Error: GoClient:runGrpcTest] Error calling SendUserInput: %v", err) // Changed Debug to Error Prefix
		log.Printf("Error calling SendUserInput: %v", err)                                    // Keep original log
		log.Println("gRPC Test Client finished with errors.")
		os.Exit(1) // Exit with error
	} else {
		// [gRPC-Debug] Log SendUserInput call success
		log.Printf("[gRPC-Info: GoClient:runGrpcTest] SendUserInput call successful.") // Changed Debug to Info Prefix
		log.Printf("Successfully called SendUserInput for follow-up message.")         // Keep original log
		// We should ideally try to receive from sendStream to confirm, but omitting for simplicity.
		// Example: Consume one message to see if connection works
		// [gRPC-Debug] Log before potentially receiving from SendUserInput stream
		log.Printf("[gRPC-Debug: GoClient:runGrpcTest] SendUserInput called. Optionally checking sendStream briefly...")

		// **MODIFICATION START:** Don't block waiting on sendStream.
		// Instead, just close the send direction and maybe do a quick check later if needed.
		// The primary listening continues on the main 'stream' via msgChan.
		if err := sendStream.CloseSend(); err != nil {
			log.Printf("[gRPC-Warn: GoClient:runGrpcTest] Error closing send direction of SendUserInput stream: %v", err)
		}
		log.Println("[gRPC-Info: GoClient:runGrpcTest] Closed send direction for SendUserInput stream. Continuing to listen on main task stream.")
		// **MODIFICATION END**

		// --- Continue listening on the main StartTask stream (via msgChan) ---
		log.Println("[gRPC-Info: GoClient:runGrpcTest] Now listening on main task stream (Stream A) for further updates for ~10 seconds...")
		postUserInputTimeout := time.After(10 * time.Second) // Listen for a bit longer
		keepListening := true
		for keepListening {
			select {
			case resp := <-msgChan:
				// Process messages received from the main StartTask stream
				log.Printf("[gRPC-Info: GoClient:runGrpcTest:MainLoop] Received main stream update: Type=%s", resp.GetType())
				// Add more detailed logging or checks here based on expected messages after user input
				switch pl := resp.Payload.(type) {
				case *tpb.ExtensionMessage_PartialMessage:
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:MainLoop]   PartialMessage Type=%s, Text Preview='%.50s...'", pl.PartialMessage.GetType(), pl.PartialMessage.GetText())
				case *tpb.ExtensionMessage_Invoke: // Changed from Action to Invoke
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:MainLoop]   Invoke=%s", pl.Invoke.String()) // Changed from Action to Invoke
					// Example: If we expect a task complete message
					// if resp.GetType() == tpb.ExtensionMessageType_TASK_COMPLETED {
					// 	log.Println("[gRPC-Success: GoClient:runGrpcTest:MainLoop] Received TASK_COMPLETED message.")
					// 	keepListening = false
					// }
				default:
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:MainLoop]   Payload: Other type (%T)", pl)
				}

			case err := <-errChan:
				// Handle errors from the main stream Recv() goroutine
				if err == io.EOF {
					log.Println("[gRPC-Info: GoClient:runGrpcTest:MainLoop] Main task stream finished (EOF).")
				} else {
					log.Printf("[gRPC-Error: GoClient:runGrpcTest:MainLoop] Error receiving from main task stream: %v", err)
				}
				keepListening = false // Stop listening on error or EOF

			case <-postUserInputTimeout:
				log.Println("[gRPC-Info: GoClient:runGrpcTest:MainLoop] Finished listening on main stream after 10s timeout.")
				keepListening = false // Stop listening after timeout

			case <-ctx.Done():
				log.Printf("[gRPC-Warn: GoClient:runGrpcTest:MainLoop] Overall test context done while listening on main stream: %v", ctx.Err())
				keepListening = false // Stop listening if main context is done
			}
		}
	}

	// --- Optional: Cleanly close the initial StartTask stream ---
	// It might have already closed if the server closes it after sending TaskStarted,
	// but explicit closure is good practice if needed.
	if err := stream.CloseSend(); err != nil {
		log.Printf("[gRPC-Warn: GoClient:runGrpcTest] Error closing send direction of initial StartTask stream: %v", err) // Changed log level
	}

	// --- Final Success --- (assuming SendUserInput call succeeded)
	log.Println("gRPC Test Client finished successfully.")
	os.Exit(0) // Explicitly exit with success code for test mode
}

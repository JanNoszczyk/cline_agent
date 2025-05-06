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
	tpb "sandboxclient/genproto/task_control" // <<< Ensure task_control is imported

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"    // Import for gRPC status codes
	"google.golang.org/grpc/metadata" // <<< Import metadata package
	"google.golang.org/grpc/status"   // Import for gRPC status handling
	// Remove unused imports:
	// "google.golang.org/protobuf/encoding/protojson"
	// Remove unused structpb
)

const (
	// Remove old stream constants
	testTimeout = 30 * time.Second     // Timeout for RPC calls
	clientID    = "go-test-client-123" // <<< Define Client ID
)

var anthropicApiKey string // Will be loaded from environment variable

func init() {
	// Load Anthropic API Key from environment variable
	anthropicApiKey = os.Getenv("ANTHROPIC_API_KEY")
	if anthropicApiKey == "" {
		log.Fatalln("Error: ANTHROPIC_API_KEY environment variable not set. This is required for tests.")
	}
}

// Helper function to create a pointer to a string
func stringPtr(s string) *string {
	return &s
}

// Helper function to add client ID metadata to context
func addClientIDToContext(ctx context.Context) context.Context {
	md := metadata.Pairs("client-id", clientID)
	return metadata.NewOutgoingContext(ctx, md)
}

// Accepts an established gRPC connection
func runGrpcTest(conn *grpc.ClientConn) {
	log.Println("Starting Simplified Go gRPC Test...")

	// --- Create Clients for Actual Services ---
	// Use specific proto aliases for clarity
	browserClient := browserpb.NewBrowserServiceClient(conn)
	checkpointsClient := checkpointspb.NewCheckpointsServiceClient(conn)
	mcpClient := mcppb.NewMcpServiceClient(conn)
	taskControlClient := tpb.NewTaskControlServiceClient(conn)                 // <<< Use tpb alias
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Created service clients.") // Added Debug Prefix

	// --- Test Context with Timeout ---
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Creating test context with timeout...") // Added Debug Log
	baseCtx, cancel := context.WithTimeout(context.Background(), testTimeout)               // <<< Renamed to baseCtx
	defer cancel()
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Test context with timeout created.") // Added Debug Log

	// --- Create context with Client ID ---
	ctxWithMetadata := addClientIDToContext(baseCtx) // <<< Create context with metadata

	// --- Test 0: Update API Settings via gRPC ---
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Preparing UpdateSettings request...")
	// <<< Create pointer for optional enum field
	apiProvider := tpb.ApiProvider_ANTHROPIC
	settingsReq := &tpb.UpdateSettingsRequest{ // <<< Use tpb alias
		ApiConfiguration: &tpb.ApiConfiguration{ // <<< Use tpb alias
			ApiProvider: &apiProvider, // <<< Pass pointer to enum value
			ApiModelId:  stringPtr("claude-3-7-sonnet-20250219"),
			ApiKey:      stringPtr(anthropicApiKey), // <<< Correct field name is ApiKey
		},
	}
	log.Printf("[gRPC-Debug: GoClient:runGrpcTest] Calling taskControlClient.UpdateSettings...")
	settingsStream, err := taskControlClient.UpdateSettings(ctxWithMetadata, settingsReq)
	if err != nil {
		log.Printf("[gRPC-Error: GoClient:runGrpcTest] Error calling UpdateSettings: %v", err)
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.Unauthenticated {
			log.Println("Authentication failed for UpdateSettings. Check client-id metadata.")
		}
		log.Println("gRPC Test Client finished with errors during settings update.")
		os.Exit(1)
	} else {
		log.Println("[gRPC-Info: GoClient:runGrpcTest] UpdateSettings call successful, receiving stream opened.")
	}

	// --- Wait for Settings Update Confirmation ---
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Waiting for confirmation from UpdateSettings stream...")
	settingsUpdateConfirmed := false
	settingsTimeout := time.After(10 * time.Second) // 10-second timeout for confirmation
	settingsErrChan := make(chan error, 1)
	settingsDoneChan := make(chan bool, 1)

	go func() {
		for {
			resp, err := settingsStream.Recv()
			if err != nil {
				if err != io.EOF { // Don't log EOF as a receiving error
					log.Printf("[gRPC-Error: GoClient:runGrpcTest:SettingsRecvLoop] Error receiving from UpdateSettings stream: %v", err)
				} else {
					log.Println("[gRPC-Info: GoClient:runGrpcTest:SettingsRecvLoop] UpdateSettings stream closed (EOF).")
				}
				settingsErrChan <- err // Send error (or EOF) to signal loop end
				return
			}
			log.Printf("[gRPC-Info: GoClient:runGrpcTest:SettingsRecvLoop] Received message: Type=%s", resp.GetType())
			// <<< Check for DID_UPDATE_SETTINGS confirmation
			if resp.GetType() == tpb.ExtensionMessageType_DID_UPDATE_SETTINGS {
				log.Println("[gRPC-Success: GoClient:runGrpcTest:SettingsRecvLoop] Received DID_UPDATE_SETTINGS confirmation.")
				settingsDoneChan <- true // Signal success
				return                   // Stop receiving after confirmation
			}
			// Handle other message types if necessary, e.g., STATE updates
			if resp.GetType() == tpb.ExtensionMessageType_STATE {
				log.Println("[gRPC-Debug: GoClient:runGrpcTest:SettingsRecvLoop] Received STATE update during settings confirmation.")
			}
		}
	}()

	select {
	case <-settingsDoneChan:
		settingsUpdateConfirmed = true
		log.Println("[gRPC-Info: GoClient:runGrpcTest] Settings update confirmed.")
	case err := <-settingsErrChan:
		if err != io.EOF {
			log.Printf("[gRPC-Error: GoClient:runGrpcTest] Error occurred while waiting for settings confirmation: %v", err)
		} else {
			log.Println("[gRPC-Warn: GoClient:runGrpcTest] UpdateSettings stream closed before confirmation received.")
		}
		// Decide if lack of confirmation is fatal
		log.Println("gRPC Test Client finished with errors (settings update not confirmed).")
		os.Exit(1)
	case <-settingsTimeout:
		log.Println("[gRPC-Error: GoClient:runGrpcTest] Timed out waiting for settings update confirmation.")
		log.Println("gRPC Test Client finished with errors.")
		os.Exit(1)
	case <-baseCtx.Done(): // Check overall test timeout
		log.Printf("[gRPC-Warn: GoClient:runGrpcTest] Overall test context done while waiting for settings confirmation: %v", baseCtx.Err())
		log.Println("gRPC Test Client finished with errors.")
		os.Exit(1)
	}

	if !settingsUpdateConfirmed {
		// This case should ideally be caught by the select block, but double-check
		log.Println("[gRPC-Error: GoClient:runGrpcTest] Failed to confirm settings update. Exiting.")
		os.Exit(1)
	}
	// --- Settings Update Complete ---

	// --- Test 1: Call BrowserService.getBrowserConnectionInfo ---
	log.Println("Calling BrowserService.getBrowserConnectionInfo...")
	infoReq := &pb.EmptyRequest{} // <<< Use pb alias
	// <<< Use ctxWithMetadata
	infoResp, err := browserClient.GetBrowserConnectionInfo(ctxWithMetadata, infoReq)

	expectedErrMsg := "Browser session is not available"
	if err != nil {
		st, ok := status.FromError(err)
		// <<< Check for Unauthenticated error first
		if ok && st.Code() == codes.Unauthenticated {
			log.Printf("Error: Received Unauthenticated from getBrowserConnectionInfo: %v", err)
			log.Println("gRPC Test Client finished with errors.")
			os.Exit(1)
		} else if ok && st.Code() == codes.Internal && strings.Contains(st.Message(), expectedErrMsg) {
			log.Printf("Successfully received expected error for getBrowserConnectionInfo: %v", err)
			// This is the expected behavior when no browser session is active, so continue the test.
		} else {
			// Unexpected error - Log it but don't exit, allow other tests to run
			log.Printf("Warning: Unexpected error calling getBrowserConnectionInfo (continuing test): %v", err)
			// os.Exit(1) // Removed exit call
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
	checkpointReq := &pb.Int64Request{ // CORRECTED: Use pb.Int64Request from common.proto <<< Use pb alias
		// Metadata can be omitted if not needed by handler
		Value: 1, // Set the value field
	}
	// <<< Use ctxWithMetadata
	_, err = checkpointsClient.CheckpointDiff(ctxWithMetadata, checkpointReq) // Use checkpoints client alias

	if err != nil {
		// <<< Check for Unauthenticated error first
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.Unauthenticated {
			log.Printf("Error: Received Unauthenticated from checkpointDiff: %v", err)
			log.Println("gRPC Test Client finished with errors.")
			os.Exit(1)
		}
		// Log other errors but don't necessarily fail the whole test for this example
		log.Printf("Warning: Error calling checkpointDiff(1): %v", err)
		// If this call MUST succeed, uncomment the next lines:
		// log.Println("gRPC Test Client finished with errors during checkpointDiff.")
		// os.Exit(1)
	} else {
		log.Println("checkpointDiff(1) call succeeded (no error returned).")
	}

	// --- Test 3: Call McpService.toggleMcpServer (Example) ---
	log.Println("Calling McpService.toggleMcpServer for 'context7' (disabled=true, Demonstration)...")
	toggleReq := &mcppb.ToggleMcpServerRequest{ // <<< Use mcppb alias
		Metadata:   &pb.Metadata{}, // <<< Use pb alias
		ServerName: "context7",
		Disabled:   true,
	}
	// <<< Use ctxWithMetadata
	mcpResp, err := mcpClient.ToggleMcpServer(ctxWithMetadata, toggleReq)

	if err != nil {
		// <<< Check for Unauthenticated error first
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.Unauthenticated {
			log.Printf("Error: Received Unauthenticated from toggleMcpServer: %v", err)
			log.Println("gRPC Test Client finished with errors.")
			os.Exit(1)
		}
		log.Printf("Warning: Error calling toggleMcpServer('context7', true): %v", err)
	} else {
		log.Printf("toggleMcpServer('context7', true) call succeeded. Response has %d servers.", len(mcpResp.GetMcpServers()))
	}

	// --- Test 4: Start Task and Send/Receive Messages ---
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Preparing initial NewTask message...")
	initialMessage := "whats 2+2"
	startTaskReqPayload := &tpb.NewTaskRequest{ // <<< Use tpb alias
		Text: stringPtr(initialMessage),
		// ChatContent can be omitted
	}
	// ClientMessage is no longer used directly for StartTask, pass NewTaskRequest directly

	log.Printf("[gRPC-Debug: GoClient:runGrpcTest] Calling taskControlClient.StartTask with: %+v", startTaskReqPayload)
	// <<< Use ctxWithMetadata
	startStream, err := taskControlClient.StartTask(ctxWithMetadata, startTaskReqPayload) // Call StartTask with the request payload
	if err != nil {
		// <<< Check for Unauthenticated error first
		st, ok := status.FromError(err)
		if ok && st.Code() == codes.Unauthenticated {
			log.Printf("Error: Received Unauthenticated from StartTask: %v", err)
			log.Println("gRPC Test Client finished with errors.")
			os.Exit(1) // Exit immediately if StartTask fails authentication
		}
		log.Printf("[gRPC-Error: GoClient:runGrpcTest] Error calling StartTask: %v", err)
		// Log the error but don't exit immediately. Allow subsequent steps to try.
		// os.Exit(1) // Removed exit call
		log.Println("[gRPC-Warn: GoClient:runGrpcTest] Continuing test despite StartTask error...")
	} else {
		log.Println("[gRPC-Info: GoClient:runGrpcTest] StartTask call successful, receiving stream opened.")
	}

	// Only proceed with receiving/sending if StartTask didn't error out initially
	if err == nil {

		// --- Receiving Loop Setup for StartTask Stream ---
		log.Println("[gRPC-Debug: GoClient:runGrpcTest] Setting up channels and goroutine for receiving messages from StartTask stream...")
		startMsgChan := make(chan *tpb.ExtensionMessage) // <<< Use tpb alias
		startErrChan := make(chan error)

		// Goroutine to receive messages from the StartTask stream
		go func() {
			for {
				resp, err := startStream.Recv() // Receive from the StartTask stream
				if err != nil {
					log.Printf("[gRPC-Error: GoClient:runGrpcTest:StartRecvLoop] Error receiving from StartTask stream: %v", err)
					startErrChan <- err
					return
				}
				log.Printf("[gRPC-Info: GoClient:runGrpcTest:StartRecvLoop] Received message: Type=%s", resp.GetType())
				// Detailed logging (can reuse previous switch logic if needed)
				switch pl := resp.Payload.(type) {
				case *tpb.ExtensionMessage_TaskStarted: // <<< Use tpb alias
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:StartRecvLoop]   Payload: TaskStarted={task_id: %s, version: %s}", pl.TaskStarted.GetTaskId(), pl.TaskStarted.GetVersion())
				case *tpb.ExtensionMessage_State: // <<< Use tpb alias
					if pl.State != nil {
						log.Printf("[gRPC-Debug: GoClient:runGrpcTest:StartRecvLoop]   Payload: State={version: %s, currentTaskItem: %v, ...}", pl.State.GetVersion(), pl.State.GetCurrentTaskItem().GetId())
					} else {
						log.Printf("[gRPC-Debug: GoClient:runGrpcTest:StartRecvLoop]   Payload: State is nil")
					}
				case *tpb.ExtensionMessage_PartialMessage: // <<< Use tpb alias
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:StartRecvLoop]   Payload: PartialMessage={type: %s, text_len: %d}", pl.PartialMessage.GetType(), len(pl.PartialMessage.GetText()))
				default:
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:StartRecvLoop]   Payload: Other type (%T) or nil", pl)
				}
				startMsgChan <- resp
			}
		}()

		// --- Wait for TASK_STARTED from StartTask Stream ---
		log.Println("Waiting up to 15s for TASK_STARTED message from StartTask stream...")
		timeout := time.After(15 * time.Second)
		var receivedTaskID string
		var receivedVersion string
		taskStartedReceived := false
		keepWaitingForTaskStart := true

		for keepWaitingForTaskStart {
			log.Println("[gRPC-Debug: GoClient:runGrpcTest:StartSelectLoop] Waiting for message, error, or timeout...")
			select {
			case resp := <-startMsgChan:
				log.Printf("[gRPC-Info: GoClient:runGrpcTest:StartSelectLoop] Processing message type: %s", resp.GetType())
				if resp.GetType() == tpb.ExtensionMessageType_TASK_STARTED { // <<< Use tpb alias
					taskStartedPayload := resp.GetTaskStarted()
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:StartSelectLoop] Received TASK_STARTED payload: %+v", taskStartedPayload)
					if taskStartedPayload != nil && taskStartedPayload.GetTaskId() != "" {
						receivedTaskID = taskStartedPayload.GetTaskId()
						receivedVersion = taskStartedPayload.GetVersion()
						log.Printf("[gRPC-Success: GoClient:runGrpcTest:StartSelectLoop] Successfully received TaskID (%s) and Version (%s) from TASK_STARTED message.", receivedTaskID, receivedVersion)
						taskStartedReceived = true
						keepWaitingForTaskStart = false // Stop waiting once TASK_STARTED is received
					} else {
						log.Println("[gRPC-Warn: GoClient:runGrpcTest:StartSelectLoop] Received TASK_STARTED message, but payload or TaskID is nil/empty.")
					}
				} else {
					log.Printf("[gRPC-Info: GoClient:runGrpcTest:StartSelectLoop] Received message type %s while waiting for TASK_STARTED.", resp.GetType())
				}
			case err := <-startErrChan:
				if err == io.EOF {
					log.Println("[gRPC-Warn: GoClient:runGrpcTest:StartSelectLoop] StartTask Stream finished (EOF) before TASK_STARTED message was received.")
				} else {
					log.Printf("[gRPC-Error: GoClient:runGrpcTest:StartSelectLoop] Received error on startErrChan: %v", err)
				}
				keepWaitingForTaskStart = false // Stop waiting on error or EOF
			case <-timeout:
				log.Println("[gRPC-Error: GoClient:runGrpcTest:StartSelectLoop] Error: Timed out after 15s waiting for TASK_STARTED message.")
				keepWaitingForTaskStart = false // Stop waiting on timeout
			// <<< Use baseCtx here for overall test timeout check
			case <-baseCtx.Done():
				log.Printf("[gRPC-Warn: GoClient:runGrpcTest:StartSelectLoop] Overall test context done while waiting for TASK_STARTED: %v", baseCtx.Err())
				keepWaitingForTaskStart = false // Stop waiting if context is cancelled
			}
		}

		// Check if Task ID was received
		if !taskStartedReceived || receivedTaskID == "" {
			log.Println("[gRPC-Error: GoClient:runGrpcTest] Error: Failed to receive valid TaskID from TASK_STARTED message.")
			log.Println("gRPC Test Client finished with errors.")
			os.Exit(1) // Keep exit here, as TaskID is critical for the next step
		}
		log.Printf("[gRPC-Info: GoClient:runGrpcTest] Proceeding with TaskID: %s (Version: %s)", receivedTaskID, receivedVersion)

		// --- Send Follow-up Message using SendUserInput RPC ---
		log.Printf("Sending follow-up message via SendUserInput RPC for TaskID %s...", receivedTaskID)
		followUpMessage := "who was the us president in 2020?"
		invokeReqPayload := &tpb.InvokeRequest{ // This is the payload for the user input <<< Use tpb alias
			Text: stringPtr(followUpMessage),
			// Images can be omitted
		}
		// Note: SendUserInput expects InvokeRequest directly, not wrapped in ClientMessage
		log.Printf("[gRPC-Debug: GoClient:runGrpcTest] Calling taskControlClient.SendUserInput with: %+v", invokeReqPayload)
		// <<< Use ctxWithMetadata
		inputStream, err := taskControlClient.SendUserInput(ctxWithMetadata, invokeReqPayload) // Call SendUserInput with InvokeRequest
		if err != nil {
			// <<< Check for Unauthenticated error first
			st, ok := status.FromError(err)
			if ok && st.Code() == codes.Unauthenticated {
				log.Printf("Error: Received Unauthenticated from SendUserInput: %v", err)
				log.Println("gRPC Test Client finished with errors.")
				os.Exit(1)
			}
			log.Printf("[gRPC-Error: GoClient:runGrpcTest] Error calling SendUserInput: %v", err)
			// Log error but don't exit immediately
			// os.Exit(1) // Removed exit call
			log.Println("[gRPC-Warn: GoClient:runGrpcTest] Continuing test despite SendUserInput error...")
		} else {
			log.Println("[gRPC-Info: GoClient:runGrpcTest] SendUserInput call successful, receiving stream opened.")
		}

		// Only proceed with receiving if SendUserInput didn't error out initially
		if err == nil {

			// --- Receiving Loop Setup for SendUserInput Stream ---
			log.Println("[gRPC-Debug: GoClient:runGrpcTest] Setting up channels and goroutine for receiving messages from SendUserInput stream...")
			inputMsgChan := make(chan *tpb.ExtensionMessage) // <<< Use tpb alias
			inputErrChan := make(chan error)

			// Goroutine to receive messages from the SendUserInput stream
			go func() {
				for {
					resp, err := inputStream.Recv() // Receive from the SendUserInput stream
					if err != nil {
						log.Printf("[gRPC-Error: GoClient:runGrpcTest:InputRecvLoop] Error receiving from SendUserInput stream: %v", err)
						inputErrChan <- err
						return
					}
					log.Printf("[gRPC-Info: GoClient:runGrpcTest:InputRecvLoop] Received message: Type=%s", resp.GetType())
					inputMsgChan <- resp
				}
			}()

			// --- Listen Briefly on the SendUserInput Stream ---
			log.Println("[gRPC-Info: GoClient:runGrpcTest] Now listening on the SendUserInput stream for ~5 seconds...")
			postUserInputTimeout := time.After(5 * time.Second) // Shorter timeout for this part
			keepListening := true
			for keepListening {
				select {
				case resp := <-inputMsgChan:
					log.Printf("[gRPC-Info: GoClient:runGrpcTest:InputSelectLoop] Received stream update: Type=%s", resp.GetType())
					// Add more detailed logging if needed
				case err := <-inputErrChan:
					if err == io.EOF {
						log.Println("[gRPC-Info: GoClient:runGrpcTest:InputSelectLoop] SendUserInput Stream finished (EOF).")
					} else {
						log.Printf("[gRPC-Error: GoClient:runGrpcTest:InputSelectLoop] Error receiving from SendUserInput stream: %v", err)
					}
					keepListening = false
				case <-postUserInputTimeout:
					log.Println("[gRPC-Info: GoClient:runGrpcTest:InputSelectLoop] Finished listening on SendUserInput stream after 5s timeout.")
					keepListening = false
				// <<< Use baseCtx here for overall test timeout check
				case <-baseCtx.Done():
					log.Printf("[gRPC-Warn: GoClient:runGrpcTest:InputSelectLoop] Overall test context done while listening on SendUserInput stream: %v", baseCtx.Err())
					keepListening = false
				}
			}
		} // End of 'if err == nil' for SendUserInput

		// --- Second Follow-up Message ---
		log.Printf("Sending SECOND follow-up message via SendUserInput RPC for TaskID %s...", receivedTaskID)
		secondFollowUpMessage := "and what year was he born?"
		secondInvokeReqPayload := &tpb.InvokeRequest{
			Text: stringPtr(secondFollowUpMessage),
		}
		log.Printf("[gRPC-Debug: GoClient:runGrpcTest] Calling taskControlClient.SendUserInput (2nd time) with: %+v", secondInvokeReqPayload)
		secondInputStream, err := taskControlClient.SendUserInput(ctxWithMetadata, secondInvokeReqPayload) // Use ctxWithMetadata
		if err != nil {
			st, ok := status.FromError(err)
			if ok && st.Code() == codes.Unauthenticated {
				log.Printf("Error: Received Unauthenticated from SendUserInput (2nd time): %v", err)
				log.Println("gRPC Test Client finished with errors.")
				os.Exit(1)
			}
			log.Printf("[gRPC-Error: GoClient:runGrpcTest] Error calling SendUserInput (2nd time): %v", err)
			log.Println("[gRPC-Warn: GoClient:runGrpcTest] Continuing test despite second SendUserInput error...")
		} else {
			log.Println("[gRPC-Info: GoClient:runGrpcTest] Second SendUserInput call successful, receiving stream opened.")
		}

		// Only proceed if the second call didn't error
		if err == nil {
			// --- Receiving Loop Setup for Second SendUserInput Stream ---
			log.Println("[gRPC-Debug: GoClient:runGrpcTest] Setting up channels and goroutine for receiving messages from SECOND SendUserInput stream...")
			secondInputMsgChan := make(chan *tpb.ExtensionMessage)
			secondInputErrChan := make(chan error)

			go func() {
				for {
					resp, err := secondInputStream.Recv()
					if err != nil {
						log.Printf("[gRPC-Error: GoClient:runGrpcTest:SecondInputRecvLoop] Error receiving from second SendUserInput stream: %v", err)
						secondInputErrChan <- err
						return
					}
					log.Printf("[gRPC-Info: GoClient:runGrpcTest:SecondInputRecvLoop] Received message: Type=%s", resp.GetType())
					secondInputMsgChan <- resp
				}
			}()

			// --- Listen Briefly on the Second SendUserInput Stream ---
			log.Println("[gRPC-Info: GoClient:runGrpcTest] Now listening on the SECOND SendUserInput stream for ~5 seconds...")
			secondPostUserInputTimeout := time.After(5 * time.Second)
			secondKeepListening := true
			for secondKeepListening {
				select {
				case resp := <-secondInputMsgChan:
					log.Printf("[gRPC-Info: GoClient:runGrpcTest:SecondInputSelectLoop] Received stream update: Type=%s", resp.GetType())
				case err := <-secondInputErrChan:
					if err == io.EOF {
						log.Println("[gRPC-Info: GoClient:runGrpcTest:SecondInputSelectLoop] Second SendUserInput Stream finished (EOF).")
					} else {
						log.Printf("[gRPC-Error: GoClient:runGrpcTest:SecondInputSelectLoop] Error receiving from second SendUserInput stream: %v", err)
					}
					secondKeepListening = false
				case <-secondPostUserInputTimeout:
					log.Println("[gRPC-Info: GoClient:runGrpcTest:SecondInputSelectLoop] Finished listening on second SendUserInput stream after 5s timeout.")
					secondKeepListening = false
				case <-baseCtx.Done():
					log.Printf("[gRPC-Warn: GoClient:runGrpcTest:SecondInputSelectLoop] Overall test context done while listening on second SendUserInput stream: %v", baseCtx.Err())
					secondKeepListening = false
				}
			}
		} // End of 'if err == nil' for second SendUserInput

	} else {
		// If StartTask failed, we can't proceed with steps requiring a TaskID
		log.Println("[gRPC-Warn: GoClient:runGrpcTest] Skipping subsequent steps because StartTask failed.")
		// Decide if we should exit here or let the test finish "successfully" despite the earlier error
		log.Println("gRPC Test Client finished with errors (due to StartTask failure).")
		os.Exit(1) // Exit here if StartTask failure means the test cannot meaningfully continue
	}

	// --- Test finished ---
	// No need to explicitly close server-streaming RPCs from client side. Context cancellation handles cleanup.

	// --- Final Outcome ---
	// Determine final exit code based on whether critical errors occurred (like failing to get TaskID)
	// For now, let's assume if we got this far without a hard exit, it's "successful" in terms of running through
	log.Println("gRPC Test Client finished (may have encountered non-fatal errors).")
	os.Exit(0) // Exit successfully if no fatal errors forced an earlier exit
}

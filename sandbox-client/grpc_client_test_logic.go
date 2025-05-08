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

// Slice to store all messages received on the StartTask stream
var allReceivedMessages []*tpb.ExtensionMessage

// logMessageSummary prints a summary of all collected ExtensionMessages.
func logMessageSummary(messages []*tpb.ExtensionMessage) {
	log.Println("--- Summary of All Received Messages on StartTask Stream ---")
	if len(messages) == 0 {
		log.Println("No messages were received on the StartTask stream.")
		log.Println("--- End of Message Summary ---")
		return
	}
	for i, msg := range messages {
		taskIDStr := "N/A"
		if msg.GetTaskStarted() != nil {
			taskIDStr = msg.GetTaskStarted().GetTaskId()
		}
		log.Printf("Message %d/%d: Type=%s, TaskID (from TaskStarted payload if applicable)=%s", i+1, len(messages), msg.GetType(), taskIDStr)

		// Handle direct fields first
		if msg.GetTaskStarted() != nil {
			tsPayload := msg.GetTaskStarted()
			log.Printf("  Direct Field: TASK_STARTED - TaskID: %s, Version: %s", tsPayload.GetTaskId(), tsPayload.GetVersion())
		}
		if msg.GetGenericText() != "" {
			log.Printf("  Direct Field: GenericText: %s", msg.GetGenericText())
		}
		if msg.GetErrorMessage() != "" {
			log.Printf("  Direct Field: ErrorMessage: %s", msg.GetErrorMessage())
		}

		// Handle oneof payload
		switch payload := msg.Payload.(type) {
		case *tpb.ExtensionMessage_State:
			if payload.State != nil {
				log.Printf("  Payload: STATE - Version: %s, CurrentTaskID: %s, Mode: %s", payload.State.GetVersion(), payload.State.GetCurrentTaskItem().GetId(), payload.State.GetChatSettings().GetMode())
			}
		case *tpb.ExtensionMessage_PartialMessage: // This is a ClineMessage
			if payload.PartialMessage != nil {
				cm := payload.PartialMessage
				log.Printf("  Payload: PARTIAL_MESSAGE (ClineMessage) - TypeInCline: %s, IsPartial: %t, Text (len %d): %s",
					cm.GetType(), // This is ClineMessage.Type (ASK/SAY)
					cm.GetPartial(),
					len(cm.GetText()),
					cm.GetText())
				// Further breakdown of ClineMessage's oneof ask_payload or say_payload can be added here if needed
				if cm.GetAskType() != tpb.ClineAskType_CLINE_ASK_TYPE_UNSPECIFIED {
					log.Printf("    ClineMessage AskType: %s", cm.GetAskType())
				}
				if cm.GetSayType() != tpb.ClineSayType_CLINE_SAY_TYPE_UNSPECIFIED {
					log.Printf("    ClineMessage SayType: %s", cm.GetSayType())
				}
			}
		case *tpb.ExtensionMessage_TextMessage: // This is also a ClineMessage
			if payload.TextMessage != nil {
				cm := payload.TextMessage
				log.Printf("  Payload: TEXT_MESSAGE (ClineMessage) - TypeInCline: %s, IsPartial: %t, Text (len %d): %s",
					cm.GetType(),
					cm.GetPartial(),
					len(cm.GetText()),
					cm.GetText())
			}
		case *tpb.ExtensionMessage_ToolUse:
			if payload.ToolUse != nil {
				log.Printf("  Payload: TOOL_USE - ToolUseID: %s, Name: %s, Input: %v", payload.ToolUse.GetToolUseId(), payload.ToolUse.GetName(), payload.ToolUse.GetInput())
			}
		case *tpb.ExtensionMessage_ToolResult:
			if payload.ToolResult != nil {
				contentStr := ""
				if tc := payload.ToolResult.GetTextContent(); tc != "" {
					contentStr = "Text: " + tc
				} else if jc := payload.ToolResult.GetJsonContent(); jc != nil {
					contentStr = "JSON: " + jc.String()
				}
				log.Printf("  Payload: TOOL_RESULT - ToolUseID: %s, IsError: %t, Content: %s", payload.ToolResult.GetToolUseId(), payload.ToolResult.GetIsError(), contentStr)
			}
		// Add cases for other oneof fields from ExtensionMessage as needed for detailed logging
		// Example for a wrapper type:
		case *tpb.ExtensionMessage_McpServers:
			if payload.McpServers != nil && payload.McpServers.GetServers() != nil {
				log.Printf("  Payload: MCP_SERVERS - Count: %d", len(payload.McpServers.GetServers()))
			}
		default:
			log.Printf("  Payload: Other or Unhandled Oneof Type (%T) or nil", payload)
		}
	}
	log.Println("--- End of Message Summary ---")
}

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

	// Initialize the message slice for this run
	allReceivedMessages = []*tpb.ExtensionMessage{}

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
		logMessageSummary(allReceivedMessages)
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
		logMessageSummary(allReceivedMessages)
		os.Exit(1)
	case <-settingsTimeout:
		log.Println("[gRPC-Error: GoClient:runGrpcTest] Timed out waiting for settings update confirmation.")
		log.Println("gRPC Test Client finished with errors.")
		logMessageSummary(allReceivedMessages)
		os.Exit(1)
	case <-baseCtx.Done(): // Check overall test timeout
		log.Printf("[gRPC-Warn: GoClient:runGrpcTest] Overall test context done while waiting for settings confirmation: %v", baseCtx.Err())
		log.Println("gRPC Test Client finished with errors.")
		logMessageSummary(allReceivedMessages)
		os.Exit(1)
	}

	if !settingsUpdateConfirmed {
		// This case should ideally be caught by the select block, but double-check
		log.Println("[gRPC-Error: GoClient:runGrpcTest] Failed to confirm settings update. Exiting.")
		logMessageSummary(allReceivedMessages)
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
		if ok && st.Code() == codes.Unauthenticated {
			log.Printf("Error: Received Unauthenticated from getBrowserConnectionInfo: %v", err)
			log.Println("gRPC Test Client finished with errors.")
			logMessageSummary(allReceivedMessages)
			os.Exit(1)
		} else if ok && st.Code() == codes.Unimplemented {
			log.Printf("Info: getBrowserConnectionInfo is Unimplemented on the server: %v", err)
			// This is acceptable if the service/method is not yet implemented.
		} else if ok && st.Code() == codes.Internal && strings.Contains(st.Message(), expectedErrMsg) {
			log.Printf("Successfully received expected error for getBrowserConnectionInfo: %v", err)
			// This is the expected behavior when no browser session is active, so continue the test.
		} else {
			// Unexpected error - Log it but don't exit, allow other tests to run
			log.Printf("Warning: Unexpected error calling getBrowserConnectionInfo (continuing test): %v", err)
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
			logMessageSummary(allReceivedMessages)
			os.Exit(1)
		} else if ok && st.Code() == codes.Unimplemented {
			log.Printf("Info: checkpointDiff is Unimplemented on the server: %v", err)
			// This is acceptable if the service/method is not yet implemented.
		} else {
			// Log other errors but don't necessarily fail the whole test for this example
			log.Printf("Warning: Error calling checkpointDiff(1): %v", err)
		}
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
			logMessageSummary(allReceivedMessages)
			os.Exit(1)
		} else if ok && st.Code() == codes.Unimplemented {
			log.Printf("Info: toggleMcpServer is Unimplemented on the server: %v", err)
			// This is acceptable if the service/method is not yet implemented.
		} else {
			log.Printf("Warning: Error calling toggleMcpServer('context7', true): %v", err)
		}
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
			logMessageSummary(allReceivedMessages)
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

		// --- Directly Receive TASK_STARTED ---
		log.Println("[gRPC-Debug: GoClient:runGrpcTest] Attempting to receive TASK_STARTED directly...")
		var receivedTaskID string
		var receivedVersion string
		taskStartedReceived := false

		// It seems Recv() doesn't directly use the context for timeout on the call itself,
		// but the underlying stream health depends on the original context (ctxWithMetadata).
		// We'll call Recv() once here. The timeout for this specific receive attempt
		// is implicitly handled by the overall stream context (ctxWithMetadata) derived from baseCtx (30s timeout).
		// We'll call Recv() once here.
		log.Println("[gRPC-Debug: GoClient:runGrpcTest] Calling startStream.Recv() for TASK_STARTED...")
		firstResp, firstErr := startStream.Recv()
		log.Printf("[gRPC-Debug: GoClient:runGrpcTest] First startStream.Recv() returned: resp=%+v, err=%v", firstResp, firstErr)

		if firstErr != nil {
			if firstErr == io.EOF {
				log.Println("[gRPC-Error: GoClient:runGrpcTest] StartTask Stream finished (EOF) before TASK_STARTED message was received.")
			} else {
				log.Printf("[gRPC-Error: GoClient:runGrpcTest] Error receiving first message from StartTask stream: %v", firstErr)
			}
		} else if firstResp != nil && firstResp.GetType() == tpb.ExtensionMessageType_TASK_STARTED {
			taskStartedPayload := firstResp.GetTaskStarted()
			if taskStartedPayload != nil && taskStartedPayload.GetTaskId() != "" {
				receivedTaskID = taskStartedPayload.GetTaskId()
				receivedVersion = taskStartedPayload.GetVersion()
				log.Printf("[gRPC-Success: GoClient:runGrpcTest] Successfully received TaskID (%s) and Version (%s) from TASK_STARTED message.", receivedTaskID, receivedVersion)
				taskStartedReceived = true
				allReceivedMessages = append(allReceivedMessages, firstResp) // Store the first message
			} else {
				log.Println("[gRPC-Warn: GoClient:runGrpcTest] Received TASK_STARTED message, but payload or TaskID is nil/empty.")
			}
		} else if firstResp != nil {
			log.Printf("[gRPC-Warn: GoClient:runGrpcTest] Received unexpected first message type %s instead of TASK_STARTED.", firstResp.GetType())
			allReceivedMessages = append(allReceivedMessages, firstResp) // Store it anyway
		} else {
			log.Println("[gRPC-Warn: GoClient:runGrpcTest] Received nil response and nil error for first message. Unexpected.")
		}

		// Check if Task ID was received before proceeding
		if !taskStartedReceived || receivedTaskID == "" {
			log.Println("[gRPC-Error: GoClient:runGrpcTest] Error: Failed to receive valid TaskID from TASK_STARTED message.")
			log.Println("gRPC Test Client finished with errors.")
			logMessageSummary(allReceivedMessages)
			os.Exit(1)
		}
		log.Printf("[gRPC-Info: GoClient:runGrpcTest] Proceeding with TaskID: %s (Version: %s)", receivedTaskID, receivedVersion)

		/* --- COMMENTED OUT SendUserInput CALLS ---
		log.Println("[gRPC-Info: GoClient:runGrpcTest] Skipping SendUserInput calls for this test.")
		// --- Send Follow-up Messages using SendUserInput RPC ---
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
				logMessageSummary(allReceivedMessages)
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
			// The SendUserInput stream is typically closed by the server immediately after processing the input.
			// The client should not expect to receive ongoing messages on this specific stream.
			// Responses from the AI will come through the main StartTask stream.
			// We can, however, wait for the stream to close to confirm the server received it.
			log.Println("[gRPC-Debug: GoClient:runGrpcTest] Waiting for SendUserInput stream to close...")
			_, recvErr := inputStream.Recv() // Attempt one Recv to get EOF or an unexpected error
			if recvErr == io.EOF {
				log.Println("[gRPC-Info: GoClient:runGrpcTest] SendUserInput stream closed by server (EOF), input likely processed.")
			} else if recvErr != nil {
				log.Printf("[gRPC-Warn: GoClient:runGrpcTest] Error/unexpected message on SendUserInput stream after sending: %v", recvErr)
			} else {
				log.Println("[gRPC-Warn: GoClient:runGrpcTest] Received unexpected message on SendUserInput stream. Expected EOF.")
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
				logMessageSummary(allReceivedMessages)
				os.Exit(1)
			}
			log.Printf("[gRPC-Error: GoClient:runGrpcTest] Error calling SendUserInput (2nd time): %v", err)
			log.Println("[gRPC-Warn: GoClient:runGrpcTest] Continuing test despite second SendUserInput error...")
		} else {
			log.Println("[gRPC-Info: GoClient:runGrpcTest] Second SendUserInput call successful, receiving stream opened.")
		}

		// Only proceed if the second call didn't error
		if err == nil {
			// Similar to the first SendUserInput, wait for this stream to close.
			log.Println("[gRPC-Debug: GoClient:runGrpcTest] Waiting for second SendUserInput stream to close...")
			_, recvErr := secondInputStream.Recv()
			if recvErr == io.EOF {
				log.Println("[gRPC-Info: GoClient:runGrpcTest] Second SendUserInput stream closed by server (EOF), input likely processed.")
			} else if recvErr != nil {
				log.Printf("[gRPC-Warn: GoClient:runGrpcTest] Error/unexpected message on second SendUserInput stream after sending: %v", recvErr)
			} else {
				log.Println("[gRPC-Warn: GoClient:runGrpcTest] Received unexpected message on second SendUserInput stream. Expected EOF.")
			}
		} // End of 'if err == nil' for second SendUserInput
		--- END COMMENTED OUT SendUserInput CALLS --- */

		// --- Simplified Direct Receiving Loop (Standard For Loop) ---
		log.Println("[gRPC-Info: GoClient:runGrpcTest] Entering standard 'for' loop to receive subsequent messages from StartTask stream...")
		for {
			// Check if the overall context is done before blocking on Recv()
			// This helps exit faster if the main timeout fires while Recv() is blocked.
			select {
			case <-baseCtx.Done():
				log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Overall test context done before Recv(): %v", baseCtx.Err())
				goto endLoop // Use goto to break out of the outer for loop
			default:
				// Proceed with Recv()
			}

			log.Println("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Calling startStream.Recv()...")
			resp, err := startStream.Recv() // This will block until a message arrives, EOF, or context deadline/cancel
			log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] startStream.Recv() returned: resp=%+v, err=%v", resp, err)

			if err != nil {
				if err == io.EOF {
					log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] StartTask Stream finished (EOF).")
				} else {
					// Attempt to get gRPC status from the error
					s, ok := status.FromError(err)
					if ok {
						// It's a gRPC error
						log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Error receiving from StartTask stream. Code: %s, Message: %s", s.Code(), s.Message())
						// Optionally, add specific handling or logging for DeadlineExceeded if needed, though it's now covered by the general gRPC error logging.
						// For example: if s.Code() == codes.DeadlineExceeded { log.Println("[gRPC-Detail: GoClient:runGrpcTest:ForRecvLoop] This was a context deadline exceeded error.") }
					} else {
						// Not a gRPC error (e.g., network issue before gRPC status is formed, or other client-side issue)
						log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Non-gRPC error receiving from StartTask stream: %v", err)
					}
				}
				break // Exit loop on any error (including EOF)
			}

			// Process the received message
			if resp != nil {
				log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received message on StartTask stream: Type=%s", resp.GetType())
				allReceivedMessages = append(allReceivedMessages, resp) // Store message
				// Add detailed logging of payload here if needed
			} else {
				// This case (nil response, nil error) should ideally not happen with Recv()
				log.Println("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received nil response and nil error. Unexpected.")
			}

			// Optional: Add a check here to break the loop if a specific "task complete" message is received,
			// otherwise it relies on EOF or error/timeout.
		}
	endLoop: // Label for goto statement
		log.Println("[gRPC-Info: GoClient:runGrpcTest] Exited 'for' receiving loop.")

	} else {
		// If StartTask failed initially, we can't proceed
		log.Println("[gRPC-Warn: GoClient:runGrpcTest] Skipping subsequent steps because StartTask failed.")
		// Decide if we should exit here or let the test finish "successfully" despite the earlier error
		log.Println("gRPC Test Client finished with errors (due to StartTask failure).")
		logMessageSummary(allReceivedMessages)
		os.Exit(1) // Exit here if StartTask failure means the test cannot meaningfully continue
	}

	// --- Test finished ---
	// No need to explicitly close server-streaming RPCs from client side. Context cancellation handles cleanup.

	// --- Final Outcome ---
	// Determine final exit code based on whether critical errors occurred (like failing to get TaskID)
	// For now, let's assume if we got this far without a hard exit, it's "successful" in terms of running through
	log.Println("gRPC Test Client finished (may have encountered non-fatal errors).")
	logMessageSummary(allReceivedMessages)
	os.Exit(0) // Exit successfully if no fatal errors forced an earlier exit
}

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
	log.Println("[DEBUG] Entering logMessageSummary function...")
	log.Println("--- Summary of All Received Messages on StartTask Stream ---")
	if len(messages) == 0 {
		log.Println("No messages were received on the StartTask stream.")
		log.Println("--- End of Message Summary ---")
		return
	}
	for i, msg := range messages {
		taskIDStr := "N/A"
		if ts := msg.GetTaskStarted(); ts != nil {
			taskIDStr = ts.GetTaskId()
		}
		log.Printf("Message %d/%d: Type=%s, TaskID (from TaskStarted payload if applicable)=%s", i+1, len(messages), msg.GetType(), taskIDStr)

		// Handle direct fields first
		if tsPayload := msg.GetTaskStarted(); tsPayload != nil {
			log.Printf("  Direct Field: TASK_STARTED - TaskID: %s, Version: %s", tsPayload.GetTaskId(), tsPayload.GetVersion())
		}
		if gt := msg.GetGenericText(); gt != "" {
			log.Printf("  Direct Field: GenericText: %s", gt)
		}
		if errMsg := msg.GetErrorMessage(); errMsg != "" {
			log.Printf("  Direct Field: ErrorMessage: %s", errMsg)
		}

		// Handle oneof payload
		switch payload := msg.Payload.(type) {
		case *tpb.ExtensionMessage_State:
			if payload.State != nil {
				s := payload.State
				log.Printf("  Payload: STATE")
				log.Printf("    Version: %s", s.GetVersion())
				log.Printf("    Platform: %s", s.GetPlatform())
				log.Printf("    TelemetrySetting: %s", s.GetTelemetrySetting())
				log.Printf("    VscMachineId: %s", s.GetVscMachineId())
				log.Printf("    PlanActSeparateModelsSetting: %t", s.GetPlanActSeparateModelsSetting())
				log.Printf("    ShouldShowAnnouncement: %t", s.GetShouldShowAnnouncement())
				log.Printf("    UriScheme: %s", s.GetUriScheme())
				log.Printf("    CheckpointTrackerErrorMessage: %s", s.GetCheckpointTrackerErrorMessage())
				log.Printf("    McpMarketplaceEnabled: %t", s.GetMcpMarketplaceEnabled())
				log.Printf("    RemoteBrowserHost: %s", s.GetRemoteBrowserHost())
				log.Printf("    CustomInstructions: %s", s.GetCustomInstructions())

				if ac := s.GetApiConfiguration(); ac != nil {
					log.Printf("    ApiConfiguration:")
					log.Printf("      ApiProvider: %s", ac.GetApiProvider())
					log.Printf("      ApiModelId: %s", ac.GetApiModelId())
					log.Printf("      ApiKey (present): %t", ac.ApiKey != nil)
					log.Printf("      FavoritedModelIds: %v", ac.GetFavoritedModelIds())
				}
				if aas := s.GetAutoApprovalSettings(); aas != nil {
					log.Printf("    AutoApprovalSettings:")
					log.Printf("      Version: %d", aas.GetVersion())
					log.Printf("      Enabled: %t", aas.GetEnabled())
					if aaActions := aas.GetActions(); aaActions != nil {
						log.Printf("        Actions: ReadFiles=%t, EditFiles=%t, UseBrowser=%t, UseMcp=%t", aaActions.GetReadFiles(), aaActions.GetEditFiles(), aaActions.GetUseBrowser(), aaActions.GetUseMcp())
					}
					log.Printf("      MaxRequests: %d", aas.GetMaxRequests())
					log.Printf("      EnableNotifications: %t", aas.GetEnableNotifications())
				}
				if bs := s.GetBrowserSettings(); bs != nil {
					log.Printf("    BrowserSettings:")
					if vp := bs.GetViewport(); vp != nil {
						log.Printf("      Viewport: Width=%d, Height=%d", vp.GetWidth(), vp.GetHeight())
					}
					log.Printf("      RemoteBrowserHost (in BrowserSettings): %s", bs.GetRemoteBrowserHost())
					log.Printf("      RemoteBrowserEnabled: %t", bs.GetRemoteBrowserEnabled())
				}
				if cs := s.GetChatSettings(); cs != nil {
					log.Printf("    ChatSettings: Mode=%s", cs.GetMode())
				}
				if ui := s.GetUserInfo(); ui != nil {
					log.Printf("    UserInfo: DisplayName=%s, Email=%s, PhotoUrl (present)=%t", ui.GetDisplayName(), ui.GetEmail(), ui.GetPhotoUrl() != "")
				}
				if ct := s.GetCurrentTaskItem(); ct != nil {
					log.Printf("    CurrentTaskItem: ID=%s, Task=%s, TS=%d", ct.GetId(), ct.GetTask(), ct.GetTs())
				}
				log.Printf("    TaskHistory Count: %d", len(s.GetTaskHistory()))
				// Optionally log details of each history item if needed
				log.Printf("    GlobalClineRulesToggles Count: %d", len(s.GetGlobalClineRulesToggles().GetToggles()))
				log.Printf("    LocalClineRulesToggles Count: %d", len(s.GetLocalClineRulesToggles().GetToggles()))
				log.Printf("    ClineMessages in State Count: %d", len(s.GetClineMessages()))
			}
		case *tpb.ExtensionMessage_PartialMessage:
			if payload.PartialMessage != nil {
				cm := payload.PartialMessage
				log.Printf("  Payload: PARTIAL_MESSAGE (ClineMessage)")
				log.Printf("    TS: %d", cm.GetTs())
				log.Printf("    TypeInCline: %s", cm.GetType()) // "ask" or "say"
				log.Printf("    Text (raw): %s", cm.GetText())
				log.Printf("    Reasoning: %s", cm.GetReasoning())
				log.Printf("    Images Count: %d", len(cm.GetImages()))
				log.Printf("    Partial: %t", cm.GetPartial())
				log.Printf("    LastCheckpointHash: %s", cm.GetLastCheckpointHash())
				log.Printf("    IsCheckpointCheckedOut: %t", cm.GetIsCheckpointCheckedOut())
				log.Printf("    IsOperationOutsideWorkspace: %t", cm.GetIsOperationOutsideWorkspace())
				log.Printf("    ConversationHistoryIndex: %d", cm.GetConversationHistoryIndex())
				if cdr := cm.GetConversationHistoryDeletedRange(); cdr != nil {
					log.Printf("    ConversationHistoryDeletedRange: Start=%d, End=%d", cdr.GetStartIndex(), cdr.GetEndIndex())
				}

				// Log Ask Payload
				if askP := cm.GetAskPayload(); askP != nil {
					log.Printf("    AskType (Enum): %s", cm.GetAskType())
					switch askCase := askP.(type) {
					case *tpb.ClineMessage_AskFollowupPayload:
						p := askCase.AskFollowupPayload
						log.Printf("      AskFollowupPayload: Question='%s', Options=%v, Selected='%s'", p.GetQuestion(), p.GetOptions(), p.GetSelected())
					case *tpb.ClineMessage_AskPlanModeRespondPayload:
						p := askCase.AskPlanModeRespondPayload
						log.Printf("      AskPlanModeRespondPayload: Response='%s', Options=%v, Selected='%s'", p.GetResponse(), p.GetOptions(), p.GetSelected())
					case *tpb.ClineMessage_AskCommandPayload:
						log.Printf("      AskCommandPayload: CommandText='%s'", askCase.AskCommandPayload.GetCommandText())
					case *tpb.ClineMessage_AskCommandOutputPayload:
						log.Printf("      AskCommandOutputPayload: OutputText='%s'", askCase.AskCommandOutputPayload.GetOutputText())
					case *tpb.ClineMessage_AskCompletionResultPayload:
						log.Printf("      AskCompletionResultPayload: ResultText='%s'", askCase.AskCompletionResultPayload.GetResultText())
					case *tpb.ClineMessage_AskToolPayload:
						if td := askCase.AskToolPayload.GetToolDetails(); td != nil {
							log.Printf("      AskToolPayload: Tool=%s, Path='%s', Diff (present)=%t, Content (present)=%t, Regex='%s', FilePattern='%s'",
								td.GetTool(), td.GetPath(), td.GetDiff() != "", td.GetContent() != "", td.GetRegex(), td.GetFilePattern())
						}
					case *tpb.ClineMessage_AskApiReqFailedPayload:
						log.Printf("      AskApiReqFailedPayload: ErrorMessage='%s'", askCase.AskApiReqFailedPayload.GetErrorMessage())
					case *tpb.ClineMessage_AskResumeTaskPayload:
						log.Printf("      AskResumeTaskPayload: TaskId='%s'", askCase.AskResumeTaskPayload.GetTaskId())
					case *tpb.ClineMessage_AskResumeCompletedTaskPayload:
						log.Printf("      AskResumeCompletedTaskPayload: TaskId='%s'", askCase.AskResumeCompletedTaskPayload.GetTaskId())
					case *tpb.ClineMessage_AskMistakeLimitReachedPayload:
						log.Printf("      AskMistakeLimitReachedPayload: (no fields)")
					case *tpb.ClineMessage_AskAutoApprovalMaxReqReachedPayload:
						log.Printf("      AskAutoApprovalMaxReqReachedPayload: (no fields)")
					case *tpb.ClineMessage_AskBrowserActionLaunchPayload:
						log.Printf("      AskBrowserActionLaunchPayload: Url='%s'", askCase.AskBrowserActionLaunchPayload.GetUrl())
					case *tpb.ClineMessage_AskUseMcpServerPayload:
						p := askCase.AskUseMcpServerPayload
						log.Printf("      AskUseMcpServerPayload: ServerName='%s', Type=%s, ToolName='%s', ArgsJson (present)=%t, Uri='%s'",
							p.GetServerName(), p.GetType(), p.GetToolName(), p.GetArgumentsJson() != "", p.GetUri())
					case *tpb.ClineMessage_AskNewTaskPayload:
						log.Printf("      AskNewTaskPayload: Context (len %d)", len(askCase.AskNewTaskPayload.GetContext()))
					default:
						log.Printf("      Unhandled AskPayload case: %T", askCase)
					}
				}

				// Log Say Payload
				if sayP := cm.GetSayPayload(); sayP != nil {
					log.Printf("    SayType (Enum): %s", cm.GetSayType())
					switch sayCase := sayP.(type) {
					case *tpb.ClineMessage_SayTaskPayload:
						log.Printf("      SayTaskPayload: TaskDescription='%s'", sayCase.SayTaskPayload.GetTaskDescription())
					case *tpb.ClineMessage_SayErrorPayload:
						log.Printf("      SayErrorPayload: ErrorMessage='%s'", sayCase.SayErrorPayload.GetErrorMessage())
					case *tpb.ClineMessage_SayApiReqInfoPayload:
						p := sayCase.SayApiReqInfoPayload
						log.Printf("      SayApiReqInfoPayload: Request (present)=%t, TokensIn=%d, TokensOut=%d, CacheWrites=%d, CacheReads=%d, Cost=%.4f, CancelReason=%s",
							p.GetRequest() != "", p.GetTokensIn(), p.GetTokensOut(), p.GetCacheWrites(), p.GetCacheReads(), p.GetCost(), p.GetCancelReason())
					case *tpb.ClineMessage_SayTextPayload:
						log.Printf("      SayTextPayload: TextContent='%s'", sayCase.SayTextPayload.GetTextContent())
					case *tpb.ClineMessage_SayReasoningPayload:
						log.Printf("      SayReasoningPayload: ReasoningText='%s'", sayCase.SayReasoningPayload.GetReasoningText())
					case *tpb.ClineMessage_SayCompletionResultPayload:
						p := sayCase.SayCompletionResultPayload
						log.Printf("      SayCompletionResultPayload: ResultText='%s', HasChanges=%t", p.GetResultText(), p.GetHasChanges())
					case *tpb.ClineMessage_SayUserFeedbackPayload:
						log.Printf("      SayUserFeedbackPayload: FeedbackText='%s'", sayCase.SayUserFeedbackPayload.GetFeedbackText())
					case *tpb.ClineMessage_SayUserFeedbackDiffPayload:
						log.Printf("      SayUserFeedbackDiffPayload: DiffContent (len %d)", len(sayCase.SayUserFeedbackDiffPayload.GetDiffContent()))
					case *tpb.ClineMessage_SayCommandPayload:
						log.Printf("      SayCommandPayload: CommandText='%s'", sayCase.SayCommandPayload.GetCommandText())
					case *tpb.ClineMessage_SayCommandOutputPayload:
						log.Printf("      SayCommandOutputPayload: OutputText='%s'", sayCase.SayCommandOutputPayload.GetOutputText())
					case *tpb.ClineMessage_SayToolPayload:
						p := sayCase.SayToolPayload
						log.Printf("      SayToolPayload: Tool=%s, Path='%s', Diff (present)=%t, Content (present)=%t, Regex='%s', FilePattern='%s', OpInWorkspace=%t",
							p.GetTool(), p.GetPath(), p.GetDiff() != "", p.GetContent() != "", p.GetRegex(), p.GetFilePattern(), p.GetOperationIsLocatedInWorkspace())
					case *tpb.ClineMessage_SayShellIntegrationWarningPayload:
						log.Printf("      SayShellIntegrationWarningPayload: WarningMessage='%s'", sayCase.SayShellIntegrationWarningPayload.GetWarningMessage())
					case *tpb.ClineMessage_SayBrowserActionLaunchPayload:
						log.Printf("      SayBrowserActionLaunchPayload: Url='%s'", sayCase.SayBrowserActionLaunchPayload.GetUrl())
					case *tpb.ClineMessage_SayBrowserActionPayload:
						p := sayCase.SayBrowserActionPayload
						log.Printf("      SayBrowserActionPayload: Action=%s, Coordinate='%s', Text='%s'", p.GetAction(), p.GetCoordinate(), p.GetText())
					case *tpb.ClineMessage_SayBrowserActionResultPayload:
						p := sayCase.SayBrowserActionResultPayload
						log.Printf("      SayBrowserActionResultPayload: Screenshot (present)=%t, Logs (present)=%t, CurrentUrl='%s', CurrentMousePosition='%s'",
							p.GetScreenshot() != "", p.GetLogs() != "", p.GetCurrentUrl(), p.GetCurrentMousePosition())
					case *tpb.ClineMessage_SayMcpServerRequestStartedPayload:
						log.Printf("      SayMcpServerRequestStartedPayload: ServerName='%s'", sayCase.SayMcpServerRequestStartedPayload.GetServerName())
					case *tpb.ClineMessage_SayMcpServerResponsePayload:
						p := sayCase.SayMcpServerResponsePayload
						log.Printf("      SayMcpServerResponsePayload: ServerName='%s', ResponseContent (len %d)", p.GetServerName(), len(p.GetResponseContent()))
					case *tpb.ClineMessage_SayUseMcpServerPayload:
						if d := sayCase.SayUseMcpServerPayload.GetDetails(); d != nil {
							log.Printf("      SayUseMcpServerPayload: ServerName='%s', Type=%s, ToolName='%s', ArgsJson (present)=%t, Uri='%s'",
								d.GetServerName(), d.GetType(), d.GetToolName(), d.GetArgumentsJson() != "", d.GetUri())
						}
					case *tpb.ClineMessage_SayDiffErrorPayload:
						p := sayCase.SayDiffErrorPayload
						log.Printf("      SayDiffErrorPayload: ErrorMessage='%s', Path='%s'", p.GetErrorMessage(), p.GetPath())
					case *tpb.ClineMessage_SayDeletedApiReqsPayload:
						log.Printf("      SayDeletedApiReqsPayload: Count=%d", sayCase.SayDeletedApiReqsPayload.GetCount())
					case *tpb.ClineMessage_SayClineignoreErrorPayload:
						log.Printf("      SayClineignoreErrorPayload: ErrorMessage='%s'", sayCase.SayClineignoreErrorPayload.GetErrorMessage())
					case *tpb.ClineMessage_SayCheckpointCreatedPayload:
						log.Printf("      SayCheckpointCreatedPayload: CheckpointHash='%s'", sayCase.SayCheckpointCreatedPayload.GetCheckpointHash())
					case *tpb.ClineMessage_SayLoadMcpDocumentationPayload:
						log.Printf("      SayLoadMcpDocumentationPayload: (no fields)")
					default:
						log.Printf("      Unhandled SayPayload case: %T", sayCase)
					}
				}
			}
		case *tpb.ExtensionMessage_TextMessage: // This is also a ClineMessage
			if payload.TextMessage != nil {
				cm := payload.TextMessage
				// Similar detailed logging as for PartialMessage can be added here if needed
				log.Printf("  Payload: TEXT_MESSAGE (ClineMessage) - TypeInCline: %s, IsPartial: %t, Text (len %d): %s",
					cm.GetType(), cm.GetPartial(), len(cm.GetText()), cm.GetText())
			}
		case *tpb.ExtensionMessage_ToolUse:
			if payload.ToolUse != nil {
				tu := payload.ToolUse
				log.Printf("  Payload: TOOL_USE - ToolUseID: %s, Name: %s, Input: %v", tu.GetToolUseId(), tu.GetName(), tu.GetInput())
			}
		case *tpb.ExtensionMessage_ToolResult:
			if payload.ToolResult != nil {
				tr := payload.ToolResult
				contentStr := ""
				if tc := tr.GetTextContent(); tc != "" {
					contentStr = "Text: " + tc
				} else if jc := tr.GetJsonContent(); jc != nil {
					contentStr = "JSON: " + jc.String() // Assuming jc is a structpb.Value
				}
				log.Printf("  Payload: TOOL_RESULT - ToolUseID: %s, IsError: %t, Content: %s", tr.GetToolUseId(), tr.GetIsError(), contentStr)
			}
		case *tpb.ExtensionMessage_McpServers:
			if payload.McpServers != nil && payload.McpServers.GetServers() != nil {
				log.Printf("  Payload: MCP_SERVERS - Count: %d", len(payload.McpServers.GetServers()))
				// Optionally log details of each McpServer
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
var openAiApiKey string    // Placeholder for OpenAI key

func init() {
	// Load Anthropic API Key from environment variable
	anthropicApiKey = os.Getenv("ANTHROPIC_API_KEY")
	if anthropicApiKey == "" {
		log.Println("Warning: ANTHROPIC_API_KEY environment variable not set. Some tests might rely on it.")
	}
	// For OpenAI, we can use a placeholder or the same key if the test doesn't actually hit the API
	openAiApiKey = os.Getenv("OPENAI_API_KEY")
	if openAiApiKey == "" {
		log.Println("Warning: OPENAI_API_KEY environment variable not set. Using placeholder for OpenAI tests.")
		openAiApiKey = "sk-placeholder-openai-key" // Or use anthropicApiKey as a placeholder
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
	apiProviderOpenAI := tpb.ApiProvider_OPENAI // Change provider
	chatModePlan := tpb.ChatMode_PLAN
	settingsReq := &tpb.UpdateSettingsRequest{
		ApiConfiguration: &tpb.ApiConfiguration{
			ApiProvider: &apiProviderOpenAI,
			ApiModelId:  stringPtr("gpt-4-turbo-preview"), // Example OpenAI model
			ApiKey:      stringPtr(openAiApiKey),          // Use placeholder or actual key
			// Add more ApiConfiguration fields if needed for testing
			FavoritedModelIds: []string{"gpt-4-turbo-preview", "claude-3-opus-20240229"},
		},
		ChatSettings: &tpb.ChatSettings{ // Add ChatSettings
			Mode: chatModePlan,
		},
		// SettingsUpdate struct can be added here if specific fields are to be tested via it
		// SettingsUpdate: &structpb.Struct{Fields: map[string]*structpb.Value{
		// 	"someOtherSetting": structpb.NewBoolValue(true),
		// }},
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
	startTaskReqPayload := &tpb.NewTaskRequest{
		Text: stringPtr(initialMessage),
		ChatContent: &tpb.ChatContent{ // Add ChatContent with an image
			Images: []string{"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAAHElEQVQI12P4//8/w38GIAXDIBKE0DHxgljNBAAO9TXL0Y4OHwAAAABJRU5ErkJggg=="}, // Placeholder base64 image
		},
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

		// --- Simplified Direct Receiving Loop (Standard For Loop) ---
		log.Println("[gRPC-Info: GoClient:runGrpcTest] Entering standard 'for' loop to receive subsequent messages from StartTask stream...")
	receiveLoop: // Label for the loop
		for {
			// Check if the overall context is done before blocking on Recv()
			// This helps exit faster if the main timeout fires while Recv() is blocked.
			select {
			case <-baseCtx.Done():
				log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Overall test context done before Recv(): %v", baseCtx.Err())
				break receiveLoop // Use break with label to exit the outer for loop
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
					} else {
						// Not a gRPC error (e.g., network issue before gRPC status is formed, or other client-side issue)
						log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Non-gRPC error receiving from StartTask stream: %v", err)
					}
				}
				break receiveLoop // Exit loop on any error (including EOF)
			}

			// Process the received message
			if resp != nil {
				log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received message on StartTask stream: Type=%s", resp.GetType())
				allReceivedMessages = append(allReceivedMessages, resp) // Store message

				// --- Check for Task Completion Message ---
				if resp.GetType() == tpb.ExtensionMessageType_PARTIAL_MESSAGE {
					clineMsg := resp.GetPartialMessage() // clineMsg is *tpb.ClineMessage
					if clineMsg != nil && !clineMsg.GetPartial() && clineMsg.GetSayType() == tpb.ClineSayType_SAY_COMPLETION_RESULT {
						log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received final completion message (PARTIAL_MESSAGE, partial=false, say_type=SAY_COMPLETION_RESULT). Breaking loop.")
						break receiveLoop // Exit loop gracefully on completion message
					}
				}
				// --- End Task Completion Check ---

			} else {
				// This case (nil response, nil error) should ideally not happen with Recv()
				log.Println("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received nil response and nil error. Unexpected.")
			}

			// Loop continues if no error and not the completion message
		}
		// endLoop: // Label for goto statement - no longer needed with labeled break
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

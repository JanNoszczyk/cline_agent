package main

import (
	// Corrected import path
	"context"
	"io" // Import io for EOF check
	"log"
	"os"
	"time"

	// Corrected import paths using the module name 'sandboxclient'
	// browserpb "sandboxclient/genproto/browser" // Removed as BrowserService tests are commented out
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
		case *tpb.ExtensionMessage_NewChatMessage: // <<< ADDED CASE for NewChatMessage
			if payload.NewChatMessage != nil {
				cm := payload.NewChatMessage
				log.Printf("  Payload: NEW_CHAT_MESSAGE (ClineMessage)")
				log.Printf("    TS: %d", cm.GetTs())
				log.Printf("    TypeInCline: %s", cm.GetType()) // "ask" or "say"
				log.Printf("    Text (raw): %s", cm.GetText())
				log.Printf("    Reasoning: %s", cm.GetReasoning())
				log.Printf("    Images Count: %d", len(cm.GetImages()))
				log.Printf("    Partial: %t", cm.GetPartial()) // Should always be false for NewChatMessage
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
					// Detailed AskPayload logging can be duplicated/refactored from PARTIAL_MESSAGE if needed
				}
				// Log Say Payload
				if sayP := cm.GetSayPayload(); sayP != nil {
					log.Printf("    SayType (Enum): %s", cm.GetSayType())
					// Detailed SayPayload logging can be duplicated/refactored from PARTIAL_MESSAGE if needed
				}
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

var anthropicApiKey string  // Will be loaded from environment variable
var openAiApiKey string     // Placeholder for OpenAI key
var anthropicModelId string // Will store the Anthropic model ID

func init() {
	// Load Anthropic API Key from environment variable
	anthropicApiKey = os.Getenv("ANTHROPIC_API_KEY")
	if anthropicApiKey == "" {
		log.Println("Warning: ANTHROPIC_API_KEY environment variable not set. Some tests might rely on it.")
	}
	// Load Anthropic Model ID from environment variable
	anthropicModelId = os.Getenv("ANTHROPIC_MODEL")
	if anthropicModelId == "" {
		log.Println("Warning: ANTHROPIC_MODEL environment variable not set. Using default or tests might fail.")
		// Optionally set a default if ANTHROPIC_MODEL is not found, e.g.:
		// anthropicModelId = "claude-3-opus-20240229"
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
	// browserClient := browserpb.NewBrowserServiceClient(conn) // Commented out as BrowserService tests are removed
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
	apiProviderAnthropic := tpb.ApiProvider_ANTHROPIC // Use Anthropic provider
	chatModePlan := tpb.ChatMode_PLAN
	settingsReq := &tpb.UpdateSettingsRequest{
		ApiConfiguration: &tpb.ApiConfiguration{
			ApiProvider: &apiProviderAnthropic,
			ApiModelId:  stringPtr(anthropicModelId), // Use ANTHROPIC_MODEL from env
			ApiKey:      stringPtr(anthropicApiKey),  // Use ANTHROPIC_API_KEY from env
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

	// --- Test 1: Call BrowserService.getBrowserConnectionInfo (COMMENTED OUT AS PER USER REQUEST) ---
	// log.Println("Calling BrowserService.getBrowserConnectionInfo...")
	// infoReq := &pb.EmptyRequest{} // <<< Use pb alias
	// // <<< Use ctxWithMetadata
	// infoResp, err := browserClient.GetBrowserConnectionInfo(ctxWithMetadata, infoReq)

	// expectedErrMsg := "Browser session is not available"
	// if err != nil {
	// 	st, ok := status.FromError(err)
	// 	if ok && st.Code() == codes.Unauthenticated {
	// 		log.Printf("Error: Received Unauthenticated from getBrowserConnectionInfo: %v", err)
	// 		log.Println("gRPC Test Client finished with errors.")
	// 		logMessageSummary(allReceivedMessages)
	// 		os.Exit(1)
	// 	} else if ok && st.Code() == codes.Unimplemented {
	// 		log.Printf("Info: getBrowserConnectionInfo is Unimplemented on the server: %v", err)
	// 		// This is acceptable if the service/method is not yet implemented.
	// 	} else if ok && st.Code() == codes.Internal && strings.Contains(st.Message(), expectedErrMsg) {
	// 		log.Printf("Successfully received expected error for getBrowserConnectionInfo: %v", err)
	// 		// This is the expected behavior when no browser session is active, so continue the test.
	// 	} else {
	// 		// Unexpected error - Log it but don't exit, allow other tests to run
	// 		log.Printf("Warning: Unexpected error calling getBrowserConnectionInfo (continuing test): %v", err)
	// 	}
	// } else {
	// 	// If there was NO error, log the received info (unexpected success in this test context)
	// 	// Depending on test requirements, this might also be considered a failure.
	// 	log.Printf("Warning: getBrowserConnectionInfo succeeded unexpectedly (expected error '%s').", expectedErrMsg)
	// 	log.Printf("Received Browser Connection Info:")
	// 	log.Printf("  Is Connected: %t", infoResp.GetIsConnected())
	// 	log.Printf("  Is Remote: %t", infoResp.GetIsRemote())
	// 	if infoResp.Host != nil {
	// 		log.Printf("  Host: %s", infoResp.GetHost())
	// 	} else {
	// 		log.Printf("  Host: (not set)")
	// 	}
	// 	// Decide if unexpected success should halt the test
	// 	// log.Println("Halting test due to unexpected success in getBrowserConnectionInfo.")
	// 	// os.Exit(1)
	// }

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
	initialMessage := "whats 2+2" // This will trigger a plan_mode_respond from the AI if in PLAN mode
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

		// --- Simplified Direct Receiving Loop (Standard For Loop) ---
		log.Println("[gRPC-Info: GoClient:runGrpcTest] Entering standard 'for' loop to receive subsequent messages from StartTask stream...")
		var followUpQuerySent bool = false // True after the client sends its "what's next.js?" query
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
					s, ok := status.FromError(err)
					if ok {
						log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Error receiving from StartTask stream. Code: %s, Message: %s", s.Code(), s.Message())
					} else {
						log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Non-gRPC error receiving from StartTask stream: %v", err)
					}
				}
				break receiveLoop // Exit loop on any error (including EOF)
			}

			if resp != nil {
				log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received message on StartTask stream: Type=%s", resp.GetType())
				allReceivedMessages = append(allReceivedMessages, resp) // Store message

				var clineMsg *tpb.ClineMessage
				var isCompleteMessage bool // Initialize isCompleteMessage

				switch p := resp.Payload.(type) {
				case *tpb.ExtensionMessage_PartialMessage:
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Processing PARTIAL_MESSAGE payload.")
					if p.PartialMessage != nil {
						clineMsg = p.PartialMessage
						isCompleteMessage = !clineMsg.GetPartial()
					} else {
						log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] PartialMessage payload is nil.")
					}
				case *tpb.ExtensionMessage_NewChatMessage:
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Processing NEW_CHAT_MESSAGE payload.")
					if p.NewChatMessage != nil {
						clineMsg = p.NewChatMessage
						isCompleteMessage = true // NewChatMessage is always complete
						if clineMsg.GetPartial() {
							log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] NewChatMessage received with Partial=true. This is unexpected. TS: %d", clineMsg.GetTs())
						}
					} else {
						log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] NewChatMessage payload is nil.")
					}
				case *tpb.ExtensionMessage_State:
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Received STATE update. Logging and continuing.")
					// State updates are usually for context, main interaction logic is with ClineMessage
					// No clineMsg or isCompleteMessage to set here for the main logic flow
				default:
					log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received unhandled payload type: %T", p)
					// No clineMsg or isCompleteMessage to set here
				}

				if clineMsg != nil { // Check if clineMsg was successfully assigned
					if isCompleteMessage {
						log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Processing complete ClineMessage (Type: %s, AskType: %s, SayType: %s, Text: %s)", clineMsg.GetType(), clineMsg.GetAskType(), clineMsg.GetSayType(), clineMsg.GetText())

						if clineMsg.GetType() == tpb.ClineMessage_ASK {
							if !followUpQuerySent {
								log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] AI sent its first ASK (response to initial task). Responding with follow-up query...")
								askResponseReq := &tpb.AskResponseRequest{
									AskResponseType: tpb.AskResponseType_MESSAGE_RESPONSE,
									Text:            stringPtr("what's next.js? Describe concisely."),
								}
								log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Calling taskControlClient.SubmitAskResponse with: %+v", askResponseReq)
								submitAskStream, submitErr := taskControlClient.SubmitAskResponse(ctxWithMetadata, askResponseReq)
								if submitErr != nil {
									st, ok := status.FromError(submitErr)
									if ok && st.Code() == codes.Unauthenticated {
										log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Received Unauthenticated from SubmitAskResponse: %v", submitErr)
										log.Println("gRPC Test Client finished with errors.")
										logMessageSummary(allReceivedMessages)
										os.Exit(1)
									}
									log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Error calling SubmitAskResponse: %v", submitErr)
									// Optionally, break loop or exit if submitting ask response fails critically
									break receiveLoop
								} else {
									log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] SubmitAskResponse call successful, stream opened. Draining stream...")
									for {
										_, ackErr := submitAskStream.Recv()
										if ackErr == io.EOF {
											log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] SubmitAskResponse stream closed by server (EOF). Response submitted.")
											break
										}
										if ackErr != nil {
											log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Error/unexpected message on SubmitAskResponse stream: %v", ackErr)
											break
										}
										log.Println("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received unexpected message on SubmitAskResponse stream.")
									}
									followUpQuerySent = true
									log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Follow-up query submitted. Continuing to listen for AI's response to this query.")
								}
							} else {
								// This is the AI's ASK in response to our follow-up query.
								log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received AI's ASK in response to the follow-up query. Concluding interaction cycle.")
								break receiveLoop // Exit the loop
							}
						} else if clineMsg.GetType() == tpb.ClineMessage_SAY {
							if followUpQuerySent {
								log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received SAY message after follow-up query was sent. Text: %s", clineMsg.GetText())
							} else {
								log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received SAY message (likely part of initial task response). Text: %s", clineMsg.GetText())
							}
							// Check for overall task completion if it's a SAY
							if clineMsg.GetSayType() == tpb.ClineSayType_SAY_COMPLETION_RESULT {
								log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received SAY_COMPLETION_RESULT. Breaking loop.")
								break receiveLoop
							}
						}
					} else { // This means it was a PartialMessage that is actually partial (and clineMsg is not nil)
						log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Received PARTIAL ClineMessage update (Type: %s, Text: %s). Waiting for completion.", clineMsg.GetType(), clineMsg.GetText())
					}
				} else if resp.GetPayload() != nil && resp.GetType() != tpb.ExtensionMessageType_STATE && resp.GetType() != tpb.ExtensionMessageType_TASK_STARTED && resp.GetType() != tpb.ExtensionMessageType_DID_UPDATE_SETTINGS {
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Payload type %T (Message Type: %s) did not yield a ClineMessage for main processing loop.", resp.GetPayload(), resp.GetType())
				} else if resp.GetPayload() == nil && resp.GetType() != tpb.ExtensionMessageType_TASK_STARTED && resp.GetType() != tpb.ExtensionMessageType_DID_UPDATE_SETTINGS {
					log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received message type %s with nil payload and it's not a simple signal type.", resp.GetType())
				}

			} else {
				log.Println("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received nil response and nil error. Unexpected.")
			}
		}
		log.Println("[gRPC-Info: GoClient:runGrpcTest] Exited 'for' receiving loop.")

	} else { // This 'else' corresponds to 'if err == nil' after StartTask call
		log.Println("[gRPC-Warn: GoClient:runGrpcTest] Skipping subsequent steps because StartTask failed.")
		log.Println("gRPC Test Client finished with errors (due to StartTask failure).")
		logMessageSummary(allReceivedMessages)
		os.Exit(1)
	}

	// --- Test finished ---
	log.Println("gRPC Test Client finished (may have encountered non-fatal errors).")
	logMessageSummary(allReceivedMessages)
	os.Exit(0)
}

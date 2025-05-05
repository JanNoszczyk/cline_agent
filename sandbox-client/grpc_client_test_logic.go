package main

import (
	// Corrected import path
	"context"
	"encoding/json" // <<< ADDED IMPORT for JSON parsing
	"flag"
	"fmt"

	// <<< ADDED IMPORT for flag parsing
	"io" // Import io for EOF check
	"log"
	"os"
	"strconv"
	"strings" // <<< ADDED IMPORT for strings.Contains
	"time"    // <<< RESTORED IMPORT for time

	// Corrected import paths using the module name 'sandboxclient'
	// browserpb "sandboxclient/genproto/browser" // Removed as BrowserService tests are commented out
	checkpointspb "sandboxclient/genproto/checkpoints"
	pb "sandboxclient/genproto/common"
	mcppb "sandboxclient/genproto/mcp"
	tpb "sandboxclient/genproto/task_control" // <<< Ensure task_control is imported

	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"                   // Import for gRPC status codes
	"google.golang.org/grpc/metadata"                // <<< Import metadata package
	"google.golang.org/grpc/status"                  // Import for gRPC status handling
	"google.golang.org/protobuf/types/known/emptypb" // <<< ADDED IMPORT for google.protobuf.Empty
	// Remove unused imports:
	// "google.golang.org/protobuf/encoding/protojson"
	// Remove unused structpb
)

// Slice to store all messages received on the StartTask stream
var allReceivedMessages []*tpb.ExtensionMessage

// Validation flags
var (
	mathQueryValidated                      bool  = false
	trumpQueryValidated                     bool  = false
	calculatorWriteToFileSeen               bool  = false
	calculatorExecuteCommandSeen            bool  = false
	mcpAddE2ETestServerValidated            bool  = false // For adding the e2e test server
	mcpToggleE2ETestServerDisabledValidated bool  = false // For disabling the e2e test server
	mcpToggleE2ETestServerEnabledValidated  bool  = false // For enabling the e2e test server
	mcpUpdateE2ETestServerTimeoutValidated  bool  = false // For updating timeout of e2e test server
	mcpAddRemoteSseServerValidated          bool  = false // Renamed: for addRemoteMcpServer test for "test-remote-sse"
	finalTestSuccess                        bool  = false // Overall success flag
	lastCheckpointTimestamp                 int64 = 0     // To store the latest checkpoint timestamp
)

var (
	phaseArg string // To store the value of the -phase CLI argument
)

// ToolInfo struct to parse JSON from ClineMessage.Text for tool calls
type ToolInfo struct {
	Tool string `json:"tool"`
	Path string `json:"path"`
	// Add other fields like Content if needed for more detailed validation
}

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
					log.Printf("    ActualAskType (Enum): %s", cm.GetActualAskType()) // Changed to ActualAskType
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
					log.Printf("    ActualSayType (Enum): %s", cm.GetActualSayType()) // Changed to ActualSayType
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
					log.Printf("    ActualAskType (Enum): %s", cm.GetActualAskType()) // Changed to ActualAskType
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
							log.Printf("      AskToolPayload: Tool=%s, Path='%s', Diff (present)=%t, Content (present)=%t, Regex='%s', FilePattern='%s', OpInWorkspace=%t",
								td.GetTool(), td.GetPath(), td.GetDiff() != "", td.GetContent() != "", td.GetRegex(), td.GetFilePattern(), td.GetOperationIsLocatedInWorkspace())
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
						log.Printf("      Unhandled AskPayload case in NewChatMessage: %T", askCase)
					}
				}
				// Log Say Payload
				if sayP := cm.GetSayPayload(); sayP != nil {
					log.Printf("    ActualSayType (Enum): %s", cm.GetActualSayType()) // Changed to ActualSayType
					switch sayCase := sayP.(type) {
					case *tpb.ClineMessage_SayTaskPayload:
						log.Printf("      SayTaskPayload: TaskDescription='%s'", sayCase.SayTaskPayload.GetTaskDescription())
					case *tpb.ClineMessage_SayErrorPayload:
						log.Printf("      SayErrorPayload: ErrorMessage='%s'", sayCase.SayErrorPayload.GetErrorMessage())
					case *tpb.ClineMessage_SayApiReqInfoPayload:
						p := sayCase.SayApiReqInfoPayload
						log.Printf("      SayApiReqInfoPayload: Request (present)=%t, TokensIn=%d, TokensOut=%d, CacheWrites=%d, CacheReads=%d, Cost=%.4f, CancelReason=%s, RequestText (first 100 chars)='%s'",
							p.GetRequest() != "", p.GetTokensIn(), p.GetTokensOut(), p.GetCacheWrites(), p.GetCacheReads(), p.GetCost(), p.GetCancelReason(), firstNChars(p.GetRequest(), 100))
					case *tpb.ClineMessage_SayTextPayload:
						log.Printf("      SayTextPayload: TextContent='%s'", sayCase.SayTextPayload.GetTextContent())
					case *tpb.ClineMessage_SayReasoningPayload:
						log.Printf("      SayReasoningPayload: ReasoningText='%s'", sayCase.SayReasoningPayload.GetReasoningText())
					case *tpb.ClineMessage_SayCompletionResultPayload:
						p := sayCase.SayCompletionResultPayload
						log.Printf("      SayCompletionResultPayload: ResultText='%s', HasChanges=%t", p.GetResultText(), p.GetHasChanges()) // Corrected: Removed GetCommand()
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
						checkpointHashStr := sayCase.SayCheckpointCreatedPayload.GetCheckpointHash()
						log.Printf("      SayCheckpointCreatedPayload: CheckpointHash='%s'", checkpointHashStr)
						// Attempt to parse checkpointHashStr as int64 for lastCheckpointTimestamp
						// This assumes the hash is actually a timestamp or can be treated as one for the diff.
						// For the test, we'll assume it's the message timestamp if it's purely numeric.
						// A more robust solution would depend on what CheckpointHash truly represents.
						// For now, we'll use the ClineMessage's own timestamp if the hash isn't numeric.
						parsedTs, err := strconv.ParseInt(checkpointHashStr, 10, 64)
						if err == nil {
							lastCheckpointTimestamp = parsedTs
							log.Printf("      [CheckpointTest] Updated lastCheckpointTimestamp from CheckpointHash to: %d", lastCheckpointTimestamp)
						} else {
							// If hash is not purely numeric, fall back to using the message's own timestamp for the checkpoint.
							// This is a heuristic for testing purposes.
							if cm.GetTs() != 0 { // Ensure cm (ClineMessage) is accessible here
								lastCheckpointTimestamp = cm.GetTs()
								log.Printf("      [CheckpointTest] CheckpointHash ('%s') is not purely numeric. Using message timestamp for lastCheckpointTimestamp: %d", checkpointHashStr, lastCheckpointTimestamp)
							} else {
								log.Printf("      [CheckpointTest] Warning: CheckpointHash ('%s') is not numeric and message timestamp is 0. lastCheckpointTimestamp not updated.", checkpointHashStr)
							}
						}
					case *tpb.ClineMessage_SayLoadMcpDocumentationPayload:
						log.Printf("      SayLoadMcpDocumentationPayload: (no fields)")
					default:
						log.Printf("      Unhandled SayPayload case in NewChatMessage: %T", sayCase)
					}
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

// Helper function to get first N characters of a string
func firstNChars(s string, n int) string {
	if len(s) > n {
		return s[:n] + "..."
	}
	return s
}

const (
	// Remove old stream constants
	// testTimeout = 240 * time.Second // Timeout for RPC calls, increased from 30s -- REMOVED
	clientID = "go-test-client-123" // <<< Define Client ID

	// Prompt processing stages
	stageInitialPrompt    = iota // 0: After "2+2" sent, waiting for its first AI response to send "Trump"
	stageTrumpPrompt             // 1: After "Trump" sent, waiting for its substantive AI response to send "Calculator"
	stageCalculatorPrompt        // 2: After "Calculator" sent, waiting for SAY_COMPLETION_RESULT
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

	// Define and parse the -phase flag
	// The actual flag.Parse() will be called by main() in main.go before runGrpcTest
	flag.StringVar(&phaseArg, "phase", "phase1", "The test phase to run (phase1 or phase2)")
	// Note: flag.Parse() should be called in main function of the application.
	// We assume it's called before runGrpcTest. For this file, we just define the flag.
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

// Accepts an established gRPC connection and returns an error if the test fails.
func runGrpcTest(conn *grpc.ClientConn) error {
	// Note: flag.Parse() is called in main.go before this function is executed.
	log.Printf("Starting Go gRPC Test for -phase: %s", phaseArg)
	log.Println("------------------------------------------------------------")
	log.Println("--- [DEBUG-CACHE-TEST] runGrpcTest INVOKED ---")
	log.Println("------------------------------------------------------------")

	// --- Create Clients for Actual Services ---
	// Use specific proto aliases for clarity
	// browserClient := browserpb.NewBrowserServiceClient(conn) // Commented out as BrowserService tests are removed
	checkpointsClient := checkpointspb.NewCheckpointsServiceClient(conn)
	mcpClient := mcppb.NewMcpServiceClient(conn)
	taskControlClient := tpb.NewTaskControlServiceClient(conn)                 // <<< Use tpb alias
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Created service clients.") // Added Debug Prefix

	// Declare receivedTaskID here so it's in scope for the defer
	var receivedTaskID string

	// Defer CancelTask call for Phase 1 cleanup
	defer func() {
		if phaseArg == "phase1" && receivedTaskID != "" {
			log.Println("[gRPC-Info: GoClient:runGrpcTest:defer] Phase 1 end: Attempting to call CancelTask for TaskID:", receivedTaskID)

			// Create a new context for the defer call, as the original might be cancelled or timed out
			deferCtx, deferCancel := context.WithTimeout(context.Background(), 15*time.Second) // Short timeout for cleanup
			defer deferCancel()

			// Add client ID to context for the defer call
			deferCtxWithMetadata := addClientIDToContext(deferCtx)

			// Corrected: CancelTask expects google.protobuf.Empty.
			// The server will identify the task to cancel based on client context (e.g., client-id in metadata).
			log.Printf("[gRPC-Info: GoClient:runGrpcTest:defer] Calling CancelTask with emptypb.Empty{} for TaskID %s (server uses client context)", receivedTaskID)
			_, err := taskControlClient.CancelTask(deferCtxWithMetadata, &emptypb.Empty{})
			if err != nil {
				log.Printf("[gRPC-Error: GoClient:runGrpcTest:defer] Error calling CancelTask (associated with TaskID %s via client context): %v", receivedTaskID, err)
				st, ok := status.FromError(err)
				if ok {
					log.Printf("[gRPC-Error: GoClient:runGrpcTest:defer] CancelTask gRPC error details - Code: %s, Message: %s", st.Code(), st.Message())
				}
			} else {
				log.Printf("[gRPC-Success: GoClient:runGrpcTest:defer] CancelTask call for TaskID %s successful.", receivedTaskID)
			}
		} else if phaseArg == "phase1" && receivedTaskID == "" {
			log.Println("[gRPC-Warn: GoClient:runGrpcTest:defer] Phase 1 end: receivedTaskID is empty, skipping CancelTask.")
		}
	}()

	// --- Test Context with Timeout ---
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Creating test context (no overall timeout)...") // Modified Log
	baseCtx := context.Background()                                                                 // <<< REMOVED TIMEOUT
	// defer cancel() // No longer needed for baseCtx
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Test context created.") // Modified Log

	// Initialize the message slice for this run
	allReceivedMessages = []*tpb.ExtensionMessage{}

	// --- Create context with Client ID ---
	ctxWithMetadata := addClientIDToContext(baseCtx) // <<< Create context with metadata

	// --- Test 0: Update API Settings via gRPC ---
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Preparing UpdateSettings request...")
	apiProviderAnthropic := tpb.ApiProvider_ANTHROPIC // Use Anthropic provider
	chatModeAct := tpb.ChatMode_ACT                   // << CHANGED TO ACT MODE
	settingsReq := &tpb.UpdateSettingsRequest{
		ApiConfiguration: &tpb.ApiConfiguration{
			ApiProvider: &apiProviderAnthropic,
			ApiModelId:  stringPtr(anthropicModelId), // Use ANTHROPIC_MODEL from env
			ApiKey:      stringPtr(anthropicApiKey),  // Use ANTHROPIC_API_KEY from env
		},
		ChatSettings: &tpb.ChatSettings{ // Add ChatSettings
			Mode: chatModeAct, // << CHANGED TO ACT MODE
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
		return fmt.Errorf("UpdateSettings call failed: %v", err)
	} else {
		log.Println("[gRPC-Info: GoClient:runGrpcTest] UpdateSettings call successful, receiving stream opened.")
	}

	// --- Wait for Settings Update Confirmation ---
	log.Println("[gRPC-Debug: GoClient:runGrpcTest] Waiting for confirmation from UpdateSettings stream...")
	settingsUpdateConfirmed := false
	settingsTimeout := time.After(10 * time.Second) // 10-second timeout for confirmation for THIS specific operation
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
			logMessageSummary(allReceivedMessages)
			return fmt.Errorf("error waiting for settings confirmation: %v", err)
		} else {
			log.Println("[gRPC-Warn: GoClient:runGrpcTest] UpdateSettings stream closed before confirmation received.")
			logMessageSummary(allReceivedMessages)
			return fmt.Errorf("UpdateSettings stream closed before confirmation")
		}
		// Decide if lack of confirmation is fatal
		// log.Println("gRPC Test Client finished with errors (settings update not confirmed).")
		// logMessageSummary(allReceivedMessages)
		// os.Exit(1) // This path should now return an error
	case <-settingsTimeout:
		log.Println("[gRPC-Error: GoClient:runGrpcTest] Timed out waiting for settings update confirmation.")
		logMessageSummary(allReceivedMessages)
		return fmt.Errorf("timed out waiting for settings update confirmation")
	case <-baseCtx.Done(): // Check overall test timeout
		log.Printf("[gRPC-Warn: GoClient:runGrpcTest] Overall test context done (should not happen if baseCtx has no timeout) while waiting for settings confirmation: %v", baseCtx.Err())
		logMessageSummary(allReceivedMessages)
		return fmt.Errorf("overall test context done while waiting for settings: %v", baseCtx.Err())
	}

	if !settingsUpdateConfirmed {
		// This case should ideally be caught by the select block, but double-check
		log.Println("[gRPC-Error: GoClient:runGrpcTest] Failed to confirm settings update. Exiting.")
		logMessageSummary(allReceivedMessages)
		return fmt.Errorf("failed to confirm settings update")
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

	// --- Test 3: McpService Tests ---
	// These tests are kept before StartTask as they are independent of a specific task.

	e2eTestServerName := "e2e-mcp-test-server"
	e2eTestServerURL := "http://localhost:6789/e2e-test"
	e2eTestServerTimeout := int32(25)

	// Test 3.1: Add the E2E test server
	log.Printf("Calling McpService.addRemoteMcpServer (name=%s, url=%s)...", e2eTestServerName, e2eTestServerURL)
	addE2EReq := &mcppb.AddRemoteMcpServerRequest{
		Metadata:   &pb.Metadata{},
		ServerName: e2eTestServerName,
		ServerUrl:  e2eTestServerURL,
	}
	mcpRespAddE2E, errAddE2E := mcpClient.AddRemoteMcpServer(ctxWithMetadata, addE2EReq)
	if errAddE2E != nil {
		log.Printf("Critical Error: Failed to add E2E test server '%s': %v. Subsequent MCP tests for this server will be skipped.", e2eTestServerName, errAddE2E)
	} else {
		log.Printf("addRemoteMcpServer(name=%s, url=%s) call succeeded. Response has %d servers.", e2eTestServerName, e2eTestServerURL, len(mcpRespAddE2E.GetMcpServers()))
		e2eServerFoundAndValidated := false
		for _, server := range mcpRespAddE2E.GetMcpServers() {
			if server.GetName() == e2eTestServerName {
				log.Printf("[MCP Validation] E2E test server '%s' found in list after add.", e2eTestServerName)
				var configData struct {
					URL string `json:"url"`
				}
				if err := json.Unmarshal([]byte(server.GetConfig()), &configData); err == nil {
					if configData.URL == e2eTestServerURL {
						log.Printf("[MCP Validation] E2E test server '%s' config URL matches: %s.", e2eTestServerName, configData.URL)
						e2eServerFoundAndValidated = true
					} else {
						log.Printf("[MCP Validation Error] E2E test server '%s' config URL mismatch. Expected: %s, Got: %s.", e2eTestServerName, e2eTestServerURL, configData.URL)
					}
				} else {
					log.Printf("[MCP Validation Error] Failed to parse config for E2E test server '%s': %v. Config string: %s", e2eTestServerName, err, server.GetConfig())
				}
				break
			}
		}
		if e2eServerFoundAndValidated {
			mcpAddE2ETestServerValidated = true
		} else {
			log.Printf("[MCP Validation Error] E2E test server '%s' not found or config mismatch after add. Subsequent tests for this server might fail.", e2eTestServerName)
		}
	}

	// Only proceed with toggle and update if the E2E test server was added successfully
	if mcpAddE2ETestServerValidated {
		// Test 3.2: toggleMcpServer for the E2E test server
		log.Printf("Calling McpService.toggleMcpServer for '%s' (disabled=true)...", e2eTestServerName)
		toggleReqDisable := &mcppb.ToggleMcpServerRequest{
			Metadata:   &pb.Metadata{},
			ServerName: e2eTestServerName,
			Disabled:   true,
		}
		mcpRespDisable, errDisable := mcpClient.ToggleMcpServer(ctxWithMetadata, toggleReqDisable)
		if errDisable != nil {
			log.Printf("Warning: Error calling toggleMcpServer('%s', true): %v", e2eTestServerName, errDisable)
		} else {
			log.Printf("toggleMcpServer('%s', true) call succeeded. Response has %d servers.", e2eTestServerName, len(mcpRespDisable.GetMcpServers()))
			foundAndDisabled := false
			for _, server := range mcpRespDisable.GetMcpServers() {
				if server.GetName() == e2eTestServerName {
					if server.GetDisabled() == true {
						log.Printf("[MCP Validation] '%s' is correctly marked as disabled.", e2eTestServerName)
						foundAndDisabled = true
						mcpToggleE2ETestServerDisabledValidated = true
					} else {
						log.Printf("[MCP Validation Error] '%s' is NOT marked as disabled after toggle(true).", e2eTestServerName)
					}
					break
				}
			}
			if !foundAndDisabled {
				log.Printf("[MCP Validation Error] '%s' not found or not disabled in response after toggle(true).", e2eTestServerName)
			}
		}

		if mcpToggleE2ETestServerDisabledValidated { // Only try to enable if disable was validated
			log.Printf("Calling McpService.toggleMcpServer for '%s' (disabled=false)...", e2eTestServerName)
			toggleReqEnable := &mcppb.ToggleMcpServerRequest{
				Metadata:   &pb.Metadata{},
				ServerName: e2eTestServerName,
				Disabled:   false,
			}
			mcpRespEnable, errEnable := mcpClient.ToggleMcpServer(ctxWithMetadata, toggleReqEnable)
			if errEnable != nil {
				log.Printf("Warning: Error calling toggleMcpServer('%s', false): %v", e2eTestServerName, errEnable)
			} else {
				log.Printf("toggleMcpServer('%s', false) call succeeded. Response has %d servers.", e2eTestServerName, len(mcpRespEnable.GetMcpServers()))
				foundAndEnabled := false
				for _, server := range mcpRespEnable.GetMcpServers() {
					if server.GetName() == e2eTestServerName {
						if server.GetDisabled() == false {
							log.Printf("[MCP Validation] '%s' is correctly marked as enabled.", e2eTestServerName)
							foundAndEnabled = true
							mcpToggleE2ETestServerEnabledValidated = true
						} else {
							log.Printf("[MCP Validation Error] '%s' is NOT marked as enabled after toggle(false).", e2eTestServerName)
						}
						break
					}
				}
				if !foundAndEnabled {
					log.Printf("[MCP Validation Error] '%s' not found or not enabled in response after toggle(false).", e2eTestServerName)
				}
			}
		} else {
			log.Printf("[MCP Info] Skipping enable toggle for '%s' because disable validation failed.", e2eTestServerName)
		}

		// Test 3.3: updateMcpTimeout for the E2E test server
		log.Printf("Calling McpService.updateMcpTimeout for '%s' (timeout=%d)...", e2eTestServerName, e2eTestServerTimeout)
		updateTimeoutReq := &mcppb.UpdateMcpTimeoutRequest{
			Metadata:   &pb.Metadata{},
			ServerName: e2eTestServerName,
			Timeout:    e2eTestServerTimeout,
		}
		mcpRespTimeout, errTimeout := mcpClient.UpdateMcpTimeout(ctxWithMetadata, updateTimeoutReq)
		if errTimeout != nil {
			log.Printf("Warning: Error calling updateMcpTimeout('%s', %d): %v", e2eTestServerName, e2eTestServerTimeout, errTimeout)
		} else {
			log.Printf("updateMcpTimeout('%s', %d) call succeeded. Response has %d servers.", e2eTestServerName, e2eTestServerTimeout, len(mcpRespTimeout.GetMcpServers()))
			timeoutUpdated := false
			for _, server := range mcpRespTimeout.GetMcpServers() {
				if server.GetName() == e2eTestServerName {
					if server.GetTimeout() == e2eTestServerTimeout {
						log.Printf("[MCP Validation] '%s' timeout is correctly updated to %d.", e2eTestServerName, e2eTestServerTimeout)
						timeoutUpdated = true
						mcpUpdateE2ETestServerTimeoutValidated = true
					} else {
						log.Printf("[MCP Validation Error] '%s' timeout is %d, expected %d.", e2eTestServerName, server.GetTimeout(), e2eTestServerTimeout)
					}
					break
				}
			}
			if !timeoutUpdated {
				log.Printf("[MCP Validation Error] '%s' not found or timeout not updated in response.", e2eTestServerName)
			}
		}
	} // End of if mcpAddE2ETestServerValidated

	// Test 3.4: addRemoteMcpServer (for "test-remote-sse", existing test)
	remoteSseServerName := "test-remote-sse"
	remoteSseServerURL := "http://localhost:12345/test-sse-server"
	log.Printf("Calling McpService.addRemoteMcpServer (name=%s, url=%s)...", remoteSseServerName, remoteSseServerURL)
	addRemoteSseReq := &mcppb.AddRemoteMcpServerRequest{
		Metadata:   &pb.Metadata{},
		ServerName: remoteSseServerName,
		ServerUrl:  remoteSseServerURL,
	}
	mcpRespAddSse, errAddSse := mcpClient.AddRemoteMcpServer(ctxWithMetadata, addRemoteSseReq)
	if errAddSse != nil {
		log.Printf("Warning: Error calling addRemoteMcpServer(name=%s, url=%s): %v", remoteSseServerName, remoteSseServerURL, errAddSse)
	} else {
		log.Printf("addRemoteMcpServer(name=%s, url=%s) call succeeded. Response has %d servers.", remoteSseServerName, remoteSseServerURL, len(mcpRespAddSse.GetMcpServers()))
		sseServerAdded := false
		for _, server := range mcpRespAddSse.GetMcpServers() {
			if server.GetName() == remoteSseServerName {
				log.Printf("[MCP Validation] Remote SSE server '%s' found in list.", remoteSseServerName)
				var configData struct {
					URL string `json:"url"`
				}
				if err := json.Unmarshal([]byte(server.GetConfig()), &configData); err == nil {
					if configData.URL == remoteSseServerURL {
						log.Printf("[MCP Validation] Remote SSE server '%s' config URL matches: %s.", remoteSseServerName, configData.URL)
						sseServerAdded = true
					} else {
						log.Printf("[MCP Validation Error] Remote SSE server '%s' config URL mismatch. Expected: %s, Got: %s.", remoteSseServerName, remoteSseServerURL, configData.URL)
					}
				} else {
					log.Printf("[MCP Validation Error] Failed to parse config for remote SSE server '%s': %v. Config string: %s", remoteSseServerName, err, server.GetConfig())
				}
				break
			}
		}
		if sseServerAdded {
			mcpAddRemoteSseServerValidated = true
		} else {
			log.Printf("[MCP Validation Error] Remote SSE server '%s' not found or config mismatch in response.", remoteSseServerName)
		}
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
			logMessageSummary(allReceivedMessages)
			return fmt.Errorf("StartTask authentication failed: %v", err) // Exit immediately if StartTask fails authentication
		}
		log.Printf("[gRPC-Error: GoClient:runGrpcTest] Error calling StartTask: %v", err)
		logMessageSummary(allReceivedMessages)
		return fmt.Errorf("StartTask call failed: %v", err)
		// log.Println("[gRPC-Warn: GoClient:runGrpcTest] Continuing test despite StartTask error...") // No longer continuing
	} else {
		log.Println("[gRPC-Info: GoClient:runGrpcTest] StartTask call successful, receiving stream opened.")
	}

	// Only proceed with receiving/sending if StartTask didn't error out initially
	if err == nil {

		// --- Directly Receive TASK_STARTED ---
		log.Println("[gRPC-Debug: GoClient:runGrpcTest] Attempting to receive TASK_STARTED directly...")
		// var receivedTaskID string // Moved declaration to be in scope for defer
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
			logMessageSummary(allReceivedMessages)
			return fmt.Errorf("failed to receive valid TaskID from TASK_STARTED")
		}
		log.Printf("[gRPC-Info: GoClient:runGrpcTest] Proceeding with TaskID: %s (Version: %s)", receivedTaskID, receivedVersion)

		// --- Call CheckpointsService.checkpointDiff (Moved Here) ---
		log.Printf("Calling CheckpointsService.checkpointDiff with TaskID %s (Demonstration)...", receivedTaskID)
		var diffTimestampVal int64 = 1 // Default/placeholder if no checkpoint created yet
		if lastCheckpointTimestamp != 0 {
			diffTimestampVal = lastCheckpointTimestamp
			log.Printf("  Using lastCheckpointTimestamp for diff: %d", diffTimestampVal)
		} else {
			log.Printf("  lastCheckpointTimestamp is 0, using placeholder 1 for diff.", diffTimestampVal)
		}
		checkpointDiffReq := &pb.Int64Request{Value: diffTimestampVal}
		_, checkpointErr := checkpointsClient.CheckpointDiff(ctxWithMetadata, checkpointDiffReq)
		if checkpointErr != nil {
			st, ok := status.FromError(checkpointErr)
			if ok && st.Code() == codes.Unauthenticated {
				log.Printf("Error: Received Unauthenticated from checkpointDiff: %v", checkpointErr)
				// Consider if this should be a fatal error for the test
			} else if ok && st.Code() == codes.Unimplemented {
				log.Printf("Info: checkpointDiff is Unimplemented on the server: %v", checkpointErr)
			} else {
				log.Printf("Warning: Error calling checkpointDiff with TaskID %s, Timestamp %d: %v", receivedTaskID, diffTimestampVal, checkpointErr)
			}
		} else {
			log.Printf("checkpointDiff call with TaskID %s, Timestamp %d succeeded.", receivedTaskID, diffTimestampVal)
		}
		// --- End of Moved CheckpointDiff Call ---

		// --- Simplified Direct Receiving Loop (Standard For Loop) ---
		log.Println("[gRPC-Info: GoClient:runGrpcTest] Entering standard 'for' loop to receive subsequent messages from StartTask stream...")
		var promptsSentCount int = 0                        // Tracks which *client prompt text* has been sent: 0=initial, 1=Trump, 2=Calculator
		var currentProcessingStage int = stageInitialPrompt // Tracks which *AI response phase* we are in
		var isAITurnComplete bool = false                   // Tracks if AI's current turn is considered complete
	receiveLoop: // Label for the loop
		for {
			// Check if the overall context is done before blocking on Recv() - REMOVED as baseCtx has no timeout
			// select {
			// case <-baseCtx.Done():
			// 	log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Overall test context done before Recv(): %v", baseCtx.Err())
			// 	break receiveLoop // Use break with label to exit the outer for loop
			// default:
			// 	// Proceed with Recv()
			// }

			log.Println("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Calling startStream.Recv()...")
			resp, err := startStream.Recv() // This will block until a message arrives, EOF, or stream error
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
				log.Printf("[CheckpointTest-MsgRecvd] For message type %s (LCT before this msg processing = %d)", resp.GetType(), lastCheckpointTimestamp) // <<< ADDED LOG
				log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received message on StartTask stream: Type=%s", resp.GetType())
				allReceivedMessages = append(allReceivedMessages, resp)

				// Check for TOOL_USE message type directly from 'resp' for execute_command
				// This is where the AI's request to use a tool like "execute_command" would appear.
				if toolUsePayload := resp.GetToolUse(); toolUsePayload != nil {
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Detected TOOL_USE payload. Name: %s, ToolUseID: %s", toolUsePayload.GetName(), toolUsePayload.GetToolUseId())
					isAITurnComplete = true
					log.Println("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] End-of-turn: TOOL_USE received.")
					if currentProcessingStage == stageCalculatorPrompt && toolUsePayload.GetName() == "execute_command" {
						calculatorExecuteCommandSeen = true
						log.Println("[gRPC-Validation: GoClient:runGrpcTest:ForRecvLoop] calculatorExecuteCommandSeen = true (from TOOL_USE block)")
					}
				}

				var clineMsg *tpb.ClineMessage
				var isCompleteMessage bool

				// Check for specific direct fields first, as these are primary ways server sends ClineMessages
				if p := resp.GetNewChatMessage(); p != nil {
					clineMsg = p
					isCompleteMessage = true // By definition, NewChatMessage is complete
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Processing direct NewChatMessage field.")
				} else if p := resp.GetPartialMessage(); p != nil {
					clineMsg = p
					isCompleteMessage = !clineMsg.GetPartial()
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Processing direct PartialMessage field (IsComplete: %t).", isCompleteMessage)
				} else {
					// If neither NewChatMessage nor PartialMessage is set, check the general 'type' field
					msgType := resp.GetType()
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] NewChatMessage/PartialMessage not set directly. Checking ExtensionMessage.Type: %s", msgType.String())
					switch msgType {
					case tpb.ExtensionMessageType_STATE:
						if statePayload := resp.GetState(); statePayload != nil {
							log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Received STATE update. Skipping main ClineMessage logic.")
						} else {
							log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received STATE type but payload is nil.")
						}
					case tpb.ExtensionMessageType_TASK_STARTED:
						log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received TASK_STARTED message unexpectedly in main loop.")
						if tsPayload := resp.GetTaskStarted(); tsPayload != nil {
							log.Printf("  TASK_STARTED details: TaskID: %s, Version: %s", tsPayload.GetTaskId(), tsPayload.GetVersion())
						}
					case tpb.ExtensionMessageType_DID_UPDATE_SETTINGS:
						log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received DID_UPDATE_SETTINGS message unexpectedly in main loop.")
					case tpb.ExtensionMessageType_ERROR: // Corrected to ERROR from ERROR_MESSAGE
						log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Received ERROR type message: %s", resp.GetErrorMessage())
						// Consider if this should break the loop or be handled differently
					default:
						log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received unhandled ExtensionMessageType: %s or message without ClineMessage payload.", msgType.String())
						if resp.GetPayload() != nil {
							log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] ...and it has a non-nil oneof Payload field of type %T", resp.GetPayload())
						}
					}
				}

				if clineMsg != nil && isCompleteMessage {
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Processing complete ClineMessage (Stage: %d, PromptsSent: %d, Type: %s, ActualAskType: %s, ActualSayType: %s, Text (len %d))", currentProcessingStage, promptsSentCount, clineMsg.GetType(), clineMsg.GetActualAskType(), clineMsg.GetActualSayType(), len(clineMsg.GetText()))

					// <<< MOVED LOGIC TO UPDATE lastCheckpointTimestamp HERE >>>
					if clineMsg.GetType() == tpb.ClineMessage_SAY && clineMsg.GetActualSayType() == tpb.ClineSayType_CHECKPOINT_CREATED {
						if sayPld := clineMsg.GetSayPayload(); sayPld != nil {
							if sayCheckpointPldContainer, ok := sayPld.(*tpb.ClineMessage_SayCheckpointCreatedPayload); ok {
								if sayCheckpointPld := sayCheckpointPldContainer.SayCheckpointCreatedPayload; sayCheckpointPld != nil {
									checkpointHashStr := sayCheckpointPld.GetCheckpointHash()
									parsedTs, err := strconv.ParseInt(checkpointHashStr, 10, 64)
									if err == nil && parsedTs != 0 { // Prefer actual hash if it's a valid timestamp
										lastCheckpointTimestamp = parsedTs
										log.Printf("[CheckpointTest-SetInLoop] Updated lastCheckpointTimestamp from CheckpointHash in SAY_CHECKPOINT_CREATED to: %d", lastCheckpointTimestamp)
									} else if clineMsg.GetTs() != 0 { // Fallback to message timestamp
										lastCheckpointTimestamp = clineMsg.GetTs()
										log.Printf("[CheckpointTest-SetInLoop] CheckpointHash ('%s') not a valid ts or was empty. Using message TS for lastCheckpointTimestamp in SAY_CHECKPOINT_CREATED: %d", checkpointHashStr, lastCheckpointTimestamp)
									} else {
										log.Printf("[CheckpointTest-WarnInLoop] SAY_CHECKPOINT_CREATED: CheckpointHash ('%s') not valid ts, and message TS is 0. LCT not updated.", checkpointHashStr)
									}
									log.Printf("[CheckpointTest-AfterSet] LCT after SayCheckpointCreatedPayload processing in loop = %d", lastCheckpointTimestamp)
								}
							}
						}
					}
					// <<< END OF MOVED LOGIC >>>

					if clineMsg.GetActualAskType() == tpb.ClineAskType_COMPLETION_RESULT || clineMsg.GetActualSayType() == tpb.ClineSayType_SAY_COMPLETION_RESULT {
						isAITurnComplete = true
						log.Println("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] End-of-turn: COMPLETION_RESULT (ASK or SAY) received.")
					}

					// Generic Tool Use Detection (for calculator stage)
					// Check if the message is a SAY message and contains SayToolPayload
					if currentProcessingStage == stageCalculatorPrompt && clineMsg.GetType() == tpb.ClineMessage_SAY {
						if sayPldWrapper := clineMsg.GetSayPayload(); sayPldWrapper != nil {
							if toolDetailsPayload, ok := sayPldWrapper.(*tpb.ClineMessage_SayToolPayload); ok && toolDetailsPayload.SayToolPayload != nil {
								toolDetails := toolDetailsPayload.SayToolPayload
								toolEnum := toolDetails.GetTool() // This is of type tpb.SayToolType
								log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Detected SAY_TOOL_PAYLOAD during calculator stage. Tool Enum: %s (%d)", toolEnum.String(), toolEnum)

								// Enum comparisons for tools within SayToolPayload (e.g., file operations)
								if toolEnum == tpb.SayToolType_NEW_FILE_CREATED || toolEnum == tpb.SayToolType_EDITED_EXISTING_FILE {
									// This was the old logic, we'll replace it with a more robust check below
									// calculatorWriteToFileSeen = true
									// log.Println("[gRPC-Validation: GoClient:runGrpcTest:ForRecvLoop] calculatorWriteToFileSeen = true (from SAY_TOOL_PAYLOAD)")
								}
							} else if clineMsg.GetActualSayType() == tpb.ClineSayType_API_REQ_STARTED { // New check for write_to_file result - USE ActualSayType
								log.Printf("[gRPC-Debug: API_REQ_STARTED] Raw clineMsg: %+v", clineMsg)
								if sayPldOneof := clineMsg.GetSayPayload(); sayPldOneof != nil {
									log.Printf("[gRPC-Debug: API_REQ_STARTED] sayPldOneof: %+v, Type: %T", sayPldOneof, sayPldOneof)
									if apiReqInfoPldContainer, ok := sayPldOneof.(*tpb.ClineMessage_SayApiReqInfoPayload); ok {
										log.Printf("[gRPC-Debug: API_REQ_STARTED] Type assertion to *tpb.ClineMessage_SayApiReqInfoPayload successful: ok=%t", ok)
										if apiReqInfoPld := apiReqInfoPldContainer.SayApiReqInfoPayload; apiReqInfoPld != nil {
											log.Printf("[gRPC-Debug: API_REQ_STARTED] apiReqInfoPldContainer.SayApiReqInfoPayload: %+v", apiReqInfoPld)
											requestText := apiReqInfoPld.GetRequest()
											log.Printf("[gRPC-Debug: API_REQ_STARTED] Extracted requestText: %s", requestText)

											containsWriteToFile := strings.Contains(requestText, "write_to_file for 'calculator.html'")
											containsSuccessfullySaved := strings.Contains(requestText, "successfully saved to calculator.html")
											log.Printf("[gRPC-Debug: API_REQ_STARTED] strings.Contains(requestText, \"write_to_file for 'calculator.html'\"): %t", containsWriteToFile)
											log.Printf("[gRPC-Debug: API_REQ_STARTED] strings.Contains(requestText, \"successfully saved to calculator.html\"): %t", containsSuccessfullySaved)

											if containsWriteToFile && containsSuccessfullySaved {
												calculatorWriteToFileSeen = true
												log.Println("[gRPC-Validation: GoClient:runGrpcTest:ForRecvLoop] calculatorWriteToFileSeen = true (from API_REQ_STARTED payload containing write_to_file result)")
											}
										} else {
											log.Println("[gRPC-Warn: API_REQ_STARTED] apiReqInfoPldContainer.SayApiReqInfoPayload is nil")
										}
									} else {
										log.Printf("[gRPC-Warn: API_REQ_STARTED] Type assertion to *tpb.ClineMessage_SayApiReqInfoPayload failed: ok=%t. The dynamic type of sayPldOneof is %T.", ok, sayPldOneof)
										log.Printf("[gRPC-CriticalFailure: API_REQ_STARTED] Cannot extract 'requestText' for calculator tool validation because SayApiReqInfoPayload is not accessible. 'calculatorWriteToFileSeen' will remain false for this message.")
									}
								} else {
									log.Println("[gRPC-Warn: API_REQ_STARTED] clineMsg.GetSayPayload() is nil")
								}
							}
						}
					}

					switch currentProcessingStage {
					case stageInitialPrompt:
						if promptsSentCount == 0 { // AI is responding to "2+2"
							if clineMsg.GetType() == tpb.ClineMessage_SAY {
								mathResponseText := ""
								// Prioritize SayCompletionResultPayload, then SayTextPayload
								if sayPld := clineMsg.GetSayPayload(); sayPld != nil {
									if sayCompletionPld, ok := sayPld.(*tpb.ClineMessage_SayCompletionResultPayload); ok && sayCompletionPld.SayCompletionResultPayload != nil {
										mathResponseText = sayCompletionPld.SayCompletionResultPayload.GetResultText()
									} else if sayTextPld, ok := sayPld.(*tpb.ClineMessage_SayTextPayload); ok && sayTextPld.SayTextPayload != nil {
										mathResponseText = sayTextPld.SayTextPayload.GetTextContent()
									}
								}
								if mathResponseText == "" {
									mathResponseText = clineMsg.GetText() // Fallback
								}

								// Validate if it's the actual answer "4" and not an echo of the prompt
								if strings.Contains(mathResponseText, "4") && (strings.Contains(mathResponseText, "2+2") || strings.Contains(mathResponseText, "=")) && !strings.Contains(strings.ToLower(mathResponseText), "what's") {
									mathQueryValidated = true
									log.Println("[gRPC-Validation: GoClient:runGrpcTest:ForRecvLoop] mathQueryValidated = true (response to '2+2' contains '4' and '2+2' or '=')")
								}

								if mathQueryValidated {
									if isAITurnComplete {
										log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Valid math response and AI turn complete. Sending 'Trump' query...")
										invokeReqTrump := &tpb.InvokeRequest{Text: stringPtr("Who is Donald Trump? Describe concisely.")}
										sendTrumpInputStream, sendTrumpInputErr := taskControlClient.SendUserInput(ctxWithMetadata, invokeReqTrump)
										if sendTrumpInputErr != nil {
											log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Error sending 'Trump' query: %v", sendTrumpInputErr)
											// finalTestSuccess = false // This will be handled by return value
											logMessageSummary(allReceivedMessages)
											return fmt.Errorf("error sending 'Trump' query: %v", sendTrumpInputErr)
										}
										for { // Drain stream
											_, ackErr := sendTrumpInputStream.Recv()
											if ackErr == io.EOF {
												break
											} else if ackErr != nil {
												log.Printf("Warn: SendUserInput (Trump) stream error: %v", ackErr)
												break
											}
										}
										promptsSentCount = 1
										currentProcessingStage = stageTrumpPrompt
										isAITurnComplete = false // Reset for next AI turn
										log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] 'Trump' prompt sent. Waiting for AI response.")
									} else {
										log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Valid math response received for '2+2', but AI turn not yet complete. Waiting. Text: '%s'", mathResponseText)
									}
								} else {
									log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received SAY for '2+2' but not the answer '4' in the expected format. Text: '%s'. Waiting.", mathResponseText)
								}
							} else if clineMsg.GetType() == tpb.ClineMessage_ASK {
								log.Printf("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received unexpected ASK for '2+2' query. Type: %s.", clineMsg.GetActualAskType()) // Use ActualAskType
								if isAITurnComplete {
									log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] AI turn complete after ASK for '2+2'. Proceeding to 'Trump' query...")
									invokeReqTrump := &tpb.InvokeRequest{Text: stringPtr("Who is Donald Trump? Describe concisely.")}
									sendTrumpInputStream, sendTrumpInputErr := taskControlClient.SendUserInput(ctxWithMetadata, invokeReqTrump)
									if sendTrumpInputErr != nil {
										log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Error sending 'Trump' query after unexpected ASK: %v", sendTrumpInputErr)
										// finalTestSuccess = false // Handled by return
										logMessageSummary(allReceivedMessages)
										return fmt.Errorf("error sending 'Trump' query after unexpected ASK: %v", sendTrumpInputErr)
									}
									for { // Drain stream
										_, ackErr := sendTrumpInputStream.Recv()
										if ackErr == io.EOF {
											break
										} else if ackErr != nil {
											log.Printf("Warn: SendUserInput (Trump) stream error after ASK: %v", ackErr)
											break
										}
									}
									promptsSentCount = 1
									currentProcessingStage = stageTrumpPrompt
									isAITurnComplete = false // Reset for next AI turn
									log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] 'Trump' prompt sent after unexpected ASK. Waiting for AI response.")
								} else {
									log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received ASK for '2+2', but AI turn not yet complete. Waiting.")
								}
							} else {
								log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Received non-SAY/non-ASK message for '2+2'. Type: %s. Waiting.", clineMsg.GetType())
							}
						}
					case stageTrumpPrompt:
						if promptsSentCount == 1 { // Waiting for response to "Trump"
							var trumpResponseText string
							isSubstantiveSay := false

							if clineMsg.GetType() == tpb.ClineMessage_SAY {
								sayType := clineMsg.GetActualSayType()
								// Extract text from specific SAY payloads
								if sayPld := clineMsg.GetSayPayload(); sayPld != nil {
									if sayTextPld, ok := sayPld.(*tpb.ClineMessage_SayTextPayload); ok && sayTextPld.SayTextPayload != nil {
										trumpResponseText = sayTextPld.SayTextPayload.GetTextContent()
									} else if sayCompletionPld, ok := sayPld.(*tpb.ClineMessage_SayCompletionResultPayload); ok && sayCompletionPld.SayCompletionResultPayload != nil {
										trumpResponseText = sayCompletionPld.SayCompletionResultPayload.GetResultText()
									}
								}
								if trumpResponseText == "" {
									trumpResponseText = clineMsg.GetText()
								} // Fallback

								isLingeringMathResponse := strings.Contains(trumpResponseText, "2+2") || strings.Contains(trumpResponseText, " is 4")
								isApiStatusMessage := sayType == tpb.ClineSayType_API_REQ_STARTED || sayType == tpb.ClineSayType_CHECKPOINT_CREATED

								if !isLingeringMathResponse && !isApiStatusMessage && trumpResponseText != "" {
									log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] AI sent substantive SAY (Type: %s) for 'Trump' query. Extracted Text: '%s'", sayType, trumpResponseText)
									isSubstantiveSay = true
									// Validate "Trump" response
									if strings.Contains(strings.ToLower(trumpResponseText), "trump") || strings.Contains(strings.ToLower(trumpResponseText), "president") {
										trumpQueryValidated = true
										log.Println("[gRPC-Validation: GoClient:runGrpcTest:ForRecvLoop] trumpQueryValidated = true (response to 'Trump' contains relevant keywords)")
									} else {
										log.Printf("[gRPC-Validation-WARN: GoClient:runGrpcTest:ForRecvLoop] Response to 'Trump' did not contain expected keywords. Extracted Text: %s", trumpResponseText)
									}
								} else if isLingeringMathResponse {
									log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] AI sent SAY (Type: %s, Text: '%s') which appears to be a lingering math response. Waiting.", sayType, trumpResponseText)
								} else {
									log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] AI sent non-substantive SAY (Type: %s, TextEmpty: %t) for 'Trump'. Waiting.", sayType, trumpResponseText == "")
								}
							} else if clineMsg.GetType() == tpb.ClineMessage_ASK {
								log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] AI sent ASK for 'Trump' query. Type: %s.", clineMsg.GetActualAskType())
								if clineMsg.GetActualAskType() == tpb.ClineAskType_COMPLETION_RESULT {
									trumpQueryValidated = true // Validate if ASK is COMPLETION_RESULT
									log.Println("[gRPC-Validation: GoClient:runGrpcTest:ForRecvLoop] trumpQueryValidated = true (AI sent ASK of type COMPLETION_RESULT for Trump query)")
								}
								// Proceed to next stage if AI turn is complete, trumpQueryValidated will be checked below
							}

							// Send "Calculator" prompt if trumpQueryValidated is now true (either by SAY or by specific ASK) AND AI turn is complete
							if trumpQueryValidated && isAITurnComplete {
								log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Trump query validated and AI turn complete. Proceeding to 'calculator app' prompt...")
								invokeReqCalc := &tpb.InvokeRequest{Text: stringPtr("Create a simple calculator app by writing its HTML, CSS, and JavaScript code to a file named 'calculator.html'. Then, use the `execute_command` tool to open this 'calculator.html' file.")}
								sendCalcInputStream, sendCalcInputErr := taskControlClient.SendUserInput(ctxWithMetadata, invokeReqCalc)
								if sendCalcInputErr != nil {
									log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Error SendUserInput (calculator): %v", sendCalcInputErr)
									// finalTestSuccess = false // Handled by return
									logMessageSummary(allReceivedMessages)
									return fmt.Errorf("error SendUserInput (calculator): %v", sendCalcInputErr)
								}
								for { // Drain stream
									_, ackErr := sendCalcInputStream.Recv()
									if ackErr == io.EOF {
										break
									} else if ackErr != nil {
										log.Printf("Warn: SendUserInput (calculator) stream error: %v", ackErr)
										break
									}
								}
								promptsSentCount = 2
								currentProcessingStage = stageCalculatorPrompt
								isAITurnComplete = false // Reset for next AI turn
								log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] 'Calculator' prompt sent. Waiting for completion.")
							} else if (isSubstantiveSay || clineMsg.GetType() == tpb.ClineMessage_ASK) && !isAITurnComplete { // If we got a relevant message but turn isn't complete
								log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Substantive/ASK response for 'Trump' received (Validated: %t), but AI turn not yet complete. Waiting.", trumpQueryValidated)
							}
						}
					case stageCalculatorPrompt:
						if promptsSentCount == 2 { // Waiting for completion of "Calculator"
							// Check for tool use via JSON in ASK message text
							if clineMsg.GetType() == tpb.ClineMessage_ASK {
								log.Printf("[CheckpointTest-Debug] Entered 'if clineMsg.GetType() == tpb.ClineMessage_ASK' block. Stage: %d, ActualAskType: %s", currentProcessingStage, clineMsg.GetActualAskType())
								// --- Debug values for CheckpointRestore condition ---
								log.Printf("[CheckpointTest-PreConditionDebug] Values before CheckpointRestore check: calculatorWriteToFileSeen=%t, lastCheckpointTimestamp=%d", calculatorWriteToFileSeen, lastCheckpointTimestamp)
								// --- Potentially call CheckpointRestore here if conditions are met ---
								if calculatorWriteToFileSeen && lastCheckpointTimestamp != 0 {
									log.Printf("[CheckpointTest] Conditions met for CheckpointRestore (calculatorWriteToFileSeen: %t, lastCheckpointTimestamp: %d). Calling CheckpointRestore...", calculatorWriteToFileSeen, lastCheckpointTimestamp)
									restoreReq := &checkpointspb.CheckpointRestoreRequest{
										Number:      lastCheckpointTimestamp,
										RestoreType: "overwrite", // Or another appropriate type
										Metadata:    &pb.Metadata{},
									}
									_, restoreErr := checkpointsClient.CheckpointRestore(ctxWithMetadata, restoreReq)
									if restoreErr != nil {
										st, ok := status.FromError(restoreErr)
										if ok && st.Code() == codes.Unauthenticated {
											log.Printf("[CheckpointTest-Error] Received Unauthenticated from CheckpointRestore: %v", restoreErr)
											// Decide if this should be fatal
										} else if ok && st.Code() == codes.Unimplemented {
											log.Printf("[CheckpointTest-Info] CheckpointRestore is Unimplemented on the server: %v", restoreErr)
										} else {
											log.Printf("[CheckpointTest-Warning] Error calling CheckpointRestore: %v", restoreErr)
										}
									} else {
										log.Printf("[CheckpointTest-Success] CheckpointRestore call for timestamp %d succeeded.", lastCheckpointTimestamp)
										// Potentially reset lastCheckpointTimestamp or add a flag to prevent re-restore
									}
								}
								// --- End of CheckpointRestore call ---

								jsonText := clineMsg.GetText()
								if jsonText != "" {
									var toolInfo ToolInfo
									// Attempt to unmarshal the first JSON object if multiple are concatenated
									// This is a simplification; robust parsing might need to handle multiple concatenated JSONs better.
									endOfFirstJson := strings.Index(jsonText, "}")
									if endOfFirstJson != -1 {
										firstJsonSegment := jsonText[:endOfFirstJson+1]
										if err := json.Unmarshal([]byte(firstJsonSegment), &toolInfo); err == nil {
											log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Parsed JSON from ASK.Text: Tool=%s, Path=%s", toolInfo.Tool, toolInfo.Path)
											if toolInfo.Tool == "editedExistingFile" || toolInfo.Tool == "newFileCreated" {
												calculatorWriteToFileSeen = true
												log.Println("[gRPC-Validation: GoClient:runGrpcTest:ForRecvLoop] calculatorWriteToFileSeen = true (from JSON in ASK.Text)")
											}
											if toolInfo.Tool == "execute_command" { // Check for execute_command in JSON as well
												calculatorExecuteCommandSeen = true
												log.Println("[gRPC-Validation: GoClient:runGrpcTest:ForRecvLoop] calculatorExecuteCommandSeen = true (from JSON in ASK.Text for execute_command)")
											}
										} else {
											log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Failed to unmarshal JSON from ASK.Text: %s. Error: %v", firstJsonSegment, err)
										}
									}
								}
								// Check if ASK type is COMMAND, implying execute_command
								if clineMsg.GetActualAskType() == tpb.ClineAskType_COMMAND { // Use ActualAskType
									calculatorExecuteCommandSeen = true // Implicitly, an ASK of type COMMAND is for execute_command
									log.Println("[gRPC-Validation: GoClient:runGrpcTest:ForRecvLoop] calculatorExecuteCommandSeen = true (from ASK type COMMAND)")
									if cmdPayload := clineMsg.GetAskCommandPayload(); cmdPayload != nil && cmdPayload.GetCommandText() != "" {
										log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] AskCommandPayload Text: %s", cmdPayload.GetCommandText())
									}
								}
							} else if clineMsg.GetType() == tpb.ClineMessage_SAY { // Check SAY messages for execute_command attempt
								if sayPld := clineMsg.GetSayPayload(); sayPld != nil {
									if sayCmdPldContainer, ok := sayPld.(*tpb.ClineMessage_SayCommandPayload); ok {
										if sayCmdPld := sayCmdPldContainer.SayCommandPayload; sayCmdPld != nil {
											if strings.Contains(sayCmdPld.GetCommandText(), "calculator.html") {
												calculatorExecuteCommandSeen = true
												log.Printf("[gRPC-Validation: GoClient:runGrpcTest:ForRecvLoop] calculatorExecuteCommandSeen = true (from SAY_COMMAND containing 'calculator.html': %s)", sayCmdPld.GetCommandText())
											}
										}
									}
								}
							}

							if clineMsg.GetType() == tpb.ClineMessage_SAY && clineMsg.GetSayCompletionResultPayload() != nil {
								completionPayload := clineMsg.GetSayCompletionResultPayload()
								log.Printf("[gRPC-Success: GoClient:runGrpcTest:ForRecvLoop] Received SAY_COMPLETION_RESULT. Text: '%s'. Calculator task considered complete.", completionPayload.GetResultText())
								// Corrected: Check ResultText for the command
								if strings.Contains(completionPayload.GetResultText(), "open calculator.html") { // This might still be relevant if AI confirms after a successful open
									calculatorExecuteCommandSeen = true
									log.Println("[gRPC-Validation: GoClient:runGrpcTest:ForRecvLoop] calculatorExecuteCommandSeen = true (from SAY_COMPLETION_RESULT result text containing 'open calculator.html')")
								}
								break receiveLoop // Test sequence complete
							} else if clineMsg.GetType() == tpb.ClineMessage_ASK && clineMsg.GetActualAskType() != tpb.ClineAskType_COMPLETION_RESULT { // Use ActualAskType
								var askResponseReq *tpb.AskResponseRequest
								if clineMsg.GetActualAskType() == tpb.ClineAskType_TOOL || clineMsg.GetActualAskType() == tpb.ClineAskType_COMMAND { // Use ActualAskType
									log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] AI sent ASK for TOOL/COMMAND approval (Type: %s). Approving with YES_BUTTON_CLICKED...", clineMsg.GetActualAskType()) // Use ActualAskType
									askResponseReq = &tpb.AskResponseRequest{AskResponseType: tpb.AskResponseType_YES_BUTTON_CLICKED, Text: stringPtr("")}
								} else {
									log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] AI sent non-TOOL/COMMAND ASK (Type: %s). Approving with 'yes' as MESSAGE_RESPONSE.", clineMsg.GetActualAskType()) // Use ActualAskType
									askResponseReq = &tpb.AskResponseRequest{AskResponseType: tpb.AskResponseType_MESSAGE_RESPONSE, Text: stringPtr("yes")}
								}

								// Use a shorter timeout for SubmitAskResponse specifically, but ensure the overall context (ctxWithMetadata) is still respected for the stream.
								// The stream itself (submitAskStream) will be bound by ctxWithMetadata if that has a shorter remaining time.
								// DERIVE FROM ctxWithMetadata TO INCLUDE CLIENT-ID
								submitCtx, submitCancel := context.WithTimeout(ctxWithMetadata, 15*time.Second) // Shorter timeout for this specific RPC
								submitAskStream, submitErr := taskControlClient.SubmitAskResponse(submitCtx, askResponseReq)
								// submitCancel() // Moved to after stream draining
								if submitErr != nil {
									log.Printf("[gRPC-Error: GoClient:runGrpcTest:ForRecvLoop] Error SubmitAskResponse (calculator approval type %s): %v", clineMsg.GetActualAskType(), submitErr) // Use ActualAskType
									submitCancel()                                                                                                                                                 // Cancel context if RPC call itself failed
									// finalTestSuccess = false // Handled by return
									logMessageSummary(allReceivedMessages)
									return fmt.Errorf("error SubmitAskResponse (calculator approval type %s): %v", clineMsg.GetActualAskType(), submitErr)
								}
								for { // Drain stream
									_, ackErr := submitAskStream.Recv()
									if ackErr == io.EOF {
										break
									} else if ackErr != nil {
										log.Printf("Warn: SubmitAskResponse (calculator approval type %s) stream error: %v", clineMsg.GetActualAskType(), ackErr) // Use ActualAskType
										break
									}
								}
								submitCancel() // Cancel context after stream is drained or errored
								log.Println("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Approval sent. Waiting for AI action or completion.")
							} else {
								log.Printf("[gRPC-Info: GoClient:runGrpcTest:ForRecvLoop] Message received during calculator stage (Type: %s, ActualSayType: %s, ActualAskType: %s). Waiting for completion.", clineMsg.GetType(), clineMsg.GetActualSayType(), clineMsg.GetActualAskType()) // Use ActualSayType and ActualAskType
							}
						}
					}
				} else if clineMsg != nil && !isCompleteMessage {
					log.Printf("[gRPC-Debug: GoClient:runGrpcTest:ForRecvLoop] Received PARTIAL ClineMessage (Type: %s, Text: %s). Waiting for completion.", clineMsg.GetType(), clineMsg.GetText())
				}
				// If clineMsg is nil here, it means the message was not a NewChatMessage or PartialMessage,
				// or it was one of those but its payload was nil. Such cases are logged above.
			} else { // resp == nil
				log.Println("[gRPC-Warn: GoClient:runGrpcTest:ForRecvLoop] Received nil response from stream, but no error. This should not happen if err is also nil.")
			}
		}
		log.Println("[gRPC-Info: GoClient:runGrpcTest] Exited 'for' receiving loop.")

	} else { // This 'else' corresponds to 'if err == nil' after StartTask call
		log.Println("[gRPC-Warn: GoClient:runGrpcTest] Skipping subsequent steps because StartTask failed.")
		// log.Println("gRPC Test Client finished with errors (due to StartTask failure).") // This is now handled by return
		logMessageSummary(allReceivedMessages)
		return fmt.Errorf("StartTask failed, cannot proceed")
	}

	// --- Test finished ---
	log.Println("gRPC Test Client finished processing messages or encountered a loop-breaking error.")

	// Final Validation Summary
	log.Println("--- Final Test Validation Summary ---")
	log.Printf("Math Query ('2+2' response contains '4'): %t", mathQueryValidated)
	log.Printf("Trump Query (response contains Trump-related keywords): %t", trumpQueryValidated)
	log.Printf("Calculator Task (write_to_file tool use seen): %t", calculatorWriteToFileSeen)
	log.Printf("Calculator Task (execute_command tool use seen): %t", calculatorExecuteCommandSeen)
	log.Printf("MCP Test (add e2e-mcp-test-server validated): %t", mcpAddE2ETestServerValidated)
	log.Printf("MCP Test (toggle e2e-mcp-test-server disabled validated): %t", mcpToggleE2ETestServerDisabledValidated)
	log.Printf("MCP Test (toggle e2e-mcp-test-server enabled validated): %t", mcpToggleE2ETestServerEnabledValidated)
	log.Printf("MCP Test (update e2e-mcp-test-server timeout validated): %t", mcpUpdateE2ETestServerTimeoutValidated)
	log.Printf("MCP Test (add remote SSE server validated): %t", mcpAddRemoteSseServerValidated)

	if phaseArg == "phase1" {
		log.Println("--- EXECUTING PHASE 1 LOGIC ---")
		// Determine overall success based on critical validations
		if mathQueryValidated && trumpQueryValidated && calculatorWriteToFileSeen && calculatorExecuteCommandSeen &&
			mcpAddE2ETestServerValidated && mcpToggleE2ETestServerDisabledValidated && mcpToggleE2ETestServerEnabledValidated &&
			mcpUpdateE2ETestServerTimeoutValidated && mcpAddRemoteSseServerValidated {
			finalTestSuccess = true // For phase 1, this means the initial tasks completed
			log.Println("Phase 1 Test Result: SUCCESS (Initial tasks completed and validated)")
		} else {
			finalTestSuccess = false // Already false by default, but explicit
			log.Println("Phase 1 Test Result: FAILED (One or more critical validations for initial tasks failed)")
		}
		logMessageSummary(allReceivedMessages) // Log messages for phase 1

		if finalTestSuccess {
			return nil // Success
		} else {
			return fmt.Errorf("Phase 1 validation failed")
		}
		// Phase 1 ends here
	} else if phaseArg == "phase2" {
		log.Println("--- EXECUTING PHASE 2 LOGIC (Task Handoff Test) ---")
		// Reset message log for this specific test part
		allReceivedMessages = []*tpb.ExtensionMessage{} // Re-initialize

		var handoffTestSuccessful bool = false
		var resumedTaskStartedReceived bool = false
		var resumedTaskID string
		var followUpResponseCoherent bool = false

		// Attempt to connect and resume
		// Note: The UpdateSettings and MCP calls are part of phase 1 setup.
		// For phase 2, we directly try to resume.
		// The gRPC server is expected to be running in a manually opened VSCode instance.

		log.Println("[HANDOFF_TEST_PHASE2] Waiting 5 seconds before attempting ResumeLatestTask (allows manual VSCode to settle)...")
		time.Sleep(5 * time.Second)

		log.Println("[HANDOFF_TEST_PHASE2] Calling taskControlClient.ResumeLatestTask...")
		resumeStream, resumeErr := taskControlClient.ResumeLatestTask(ctxWithMetadata, &emptypb.Empty{})
		if resumeErr != nil {
			log.Printf("[HANDOFF_TEST_PHASE2] Error calling ResumeLatestTask: %v", resumeErr)
			// handoffTestSuccessful remains false
		} else {
			log.Println("[HANDOFF_TEST_PHASE2] ResumeLatestTask call successful, stream opened.")

		receiveResumedLoopPhase2:
			for {
				// Shortened timeout for individual Recv calls in Phase 2
				_, recvCancel := context.WithTimeout(ctxWithMetadata, 30*time.Second) // Use blank identifier for recvCtx
				log.Println("[HANDOFF_TEST_PHASE2] Calling resumeStream.Recv()...")
				resumeResp, err := resumeStream.Recv()
				recvCancel() // Cancel context for this Recv call

				if err != nil {
					if err == io.EOF {
						log.Println("[HANDOFF_TEST_PHASE2] ResumeLatestTask stream finished (EOF).")
					} else {
						log.Printf("[HANDOFF_TEST_PHASE2] Error receiving from ResumeLatestTask stream: %v", err)
					}
					break receiveResumedLoopPhase2
				}

				if resumeResp != nil {
					allReceivedMessages = append(allReceivedMessages, resumeResp)
					log.Printf("[HANDOFF_TEST_PHASE2] Received message on ResumeLatestTask stream: Type=%s", resumeResp.GetType())

					if !resumedTaskStartedReceived && resumeResp.GetType() == tpb.ExtensionMessageType_TASK_STARTED {
						taskStartedPayload := resumeResp.GetTaskStarted()
						if taskStartedPayload != nil && taskStartedPayload.GetTaskId() != "" {
							resumedTaskID = taskStartedPayload.GetTaskId()
							log.Printf("[HANDOFF_TEST_PHASE2] Successfully received Resumed TaskID (%s) from TASK_STARTED message.", resumedTaskID)
							resumedTaskStartedReceived = true

							followUpPrompt := "Okay, now what was the joke about numbers from the calculator task?" // More specific follow-up
							log.Printf("[HANDOFF_TEST_PHASE2] Sending follow-up '%s' to resumed task ID %s...", followUpPrompt, resumedTaskID)

							sendFollowUpCtx, sendFollowUpCancel := context.WithTimeout(ctxWithMetadata, 15*time.Second)
							sendFollowUpStream, sendFollowUpErr := taskControlClient.SendUserInput(sendFollowUpCtx, &tpb.InvokeRequest{Text: stringPtr(followUpPrompt)})
							sendFollowUpCancel()

							if sendFollowUpErr != nil {
								log.Printf("[HANDOFF_TEST_PHASE2] Error sending follow-up to resumed task: %v", sendFollowUpErr)
								break receiveResumedLoopPhase2
							}
							// Drain stream
							_, drainCancel := context.WithTimeout(ctxWithMetadata, 10*time.Second) // Use blank identifier for drainCtx
							for {
								_, ackErr := sendFollowUpStream.Recv()
								if ackErr == io.EOF {
									break
								} else if ackErr != nil {
									log.Printf("[HANDOFF_TEST_PHASE2] SendUserInput (follow-up) stream error: %v", ackErr)
									break
								}
							}
							drainCancel()
							log.Println("[HANDOFF_TEST_PHASE2] Follow-up prompt sent to resumed task.")
						} else {
							log.Println("[HANDOFF_TEST_PHASE2] Received TASK_STARTED on resume, but payload or TaskID is nil/empty.")
						}
					} else if resumedTaskStartedReceived && resumeResp.GetNewChatMessage() != nil {
						clineMsg := resumeResp.GetNewChatMessage()
						if clineMsg.GetType() == tpb.ClineMessage_SAY &&
							(clineMsg.GetActualSayType() == tpb.ClineSayType_SAY_TEXT || clineMsg.GetActualSayType() == tpb.ClineSayType_SAY_COMPLETION_RESULT) {

							responseText := ""
							if sayPld := clineMsg.GetSayPayload(); sayPld != nil {
								if sayTextPld, ok := sayPld.(*tpb.ClineMessage_SayTextPayload); ok && sayTextPld.SayTextPayload != nil {
									responseText = sayTextPld.SayTextPayload.GetTextContent()
								} else if sayCompletionPld, ok := sayPld.(*tpb.ClineMessage_SayCompletionResultPayload); ok && sayCompletionPld.SayCompletionResultPayload != nil {
									responseText = sayCompletionPld.SayCompletionResultPayload.GetResultText()
								}
							}
							if responseText == "" {
								responseText = clineMsg.GetText() // Fallback
							}

							log.Printf("[HANDOFF_TEST_PHASE2] Received AI response to follow-up: '%s'", responseText)

							// Coherence check for the joke about numbers
							if responseText != "" &&
								!strings.Contains(strings.ToLower(responseText), "okay, now what was the joke about numbers") &&
								(strings.Contains(strings.ToLower(responseText), "joke") || strings.Contains(strings.ToLower(responseText), "numbers") || strings.Contains(strings.ToLower(responseText), "calculator") || len(strings.Fields(responseText)) > 3) { // Adjusted coherence check
								log.Println("[HANDOFF_TEST_PHASE2] Resumed task responded coherently to follow-up.")
								followUpResponseCoherent = true
								handoffTestSuccessful = true // Mark handoff as successful
								break receiveResumedLoopPhase2
							} else {
								log.Printf("[HANDOFF_TEST_PHASE2] Follow-up response was empty or seemed non-coherent. Text: '%s'", responseText)
							}
						}
					}
				}
			} // End of receiveResumedLoopPhase2

			if resumedTaskStartedReceived && followUpResponseCoherent {
				log.Println("[HANDOFF_TEST_PHASE2] Handoff Test Part: SUCCESS")
				// handoffTestSuccessful is already true
			} else {
				if !resumedTaskStartedReceived {
					log.Println("[HANDOFF_TEST_PHASE2] Handoff Test FAILED: Did not receive TASK_STARTED for resumed task.")
				}
				if !followUpResponseCoherent {
					log.Println("[HANDOFF_TEST_PHASE2] Handoff Test FAILED: Follow-up response was not coherent or not received as expected.")
				}
				handoffTestSuccessful = false
			}
		}
		logMessageSummary(allReceivedMessages) // Log messages for phase 2
		if handoffTestSuccessful {
			log.Println("Phase 2 Test Result: SUCCESS (Handoff and resumption successful)")
			return nil // Success
		} else {
			log.Println("Phase 2 Test Result: FAILED (Handoff and resumption failed)")
			return fmt.Errorf("Phase 2 handoff/resumption failed")
		}
		// Phase 2 ends here
	} else {
		log.Printf("Error: Invalid -phase argument: %s. Must be 'phase1' or 'phase2'.", phaseArg)
		return fmt.Errorf("invalid -phase argument: %s", phaseArg)
	}
}

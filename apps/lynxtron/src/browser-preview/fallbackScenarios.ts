/**
 * Deterministic fallback scenario catalog (renderer-neutral).
 *
 * One physical module owns static connector snapshots used by the Lynx-for-Web
 * preview when it is NOT driven by a live shared server (SB1's default is the
 * live transport; these snapshots remain the fault-injection/offline fallback
 * and the source of the BW3 calibration faults).
 *
 * It moved here from `apps/web/src/browser-workbench-reference` when Plan 11B
 * deleted the hand-built Web reference host. It is contracts-only fixture data:
 * no product JSX, renderer imports, or transport code.
 */
import {
  DEFAULT_SERVER_SETTINGS,
  CheckpointRef,
  EnvironmentId,
  EventId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type DesktopAppBranding,
  type OrchestrationCheckpointSummary,
  type OrchestrationLatestTurn,
  type OrchestrationMessage,
  type OrchestrationProjectShell,
  type OrchestrationProposedPlan,
  type OrchestrationSessionStatus,
  type OrchestrationThreadActivity,
  type OrchestrationThreadShell,
  type ServerConfig,
  type ServerProvider,
  type TurnId as TurnIdType,
} from "@t3tools/contracts";
import type { AuthAccessPresentation } from "@t3tools/client-runtime/presentation/connections";
import type {
  ActivePlanState,
  LatestProposedPlanState,
} from "@t3tools/client-runtime/presentation/thread";

/**
 * Structural mirror of the Lynxtron connector protocol's status/shell/thread/
 * snapshot payloads. Kept here so the catalog has no cross-app import; the Lynx
 * preview asserts these against its own `ConnectorSnapshot` type.
 */
export type WorkbenchConnectorStatus =
  | "idle"
  | "starting-server"
  | "connecting"
  | "reconnecting"
  | "ready"
  | "error";

export interface WorkbenchStatusPayload {
  readonly status: WorkbenchConnectorStatus;
  readonly detail?: string;
}

export interface WorkbenchShellPayload {
  readonly projects: ReadonlyArray<OrchestrationProjectShell>;
  readonly threads: ReadonlyArray<OrchestrationThreadShell>;
  readonly archivedThreads?: ReadonlyArray<OrchestrationThreadShell>;
}

export interface WorkbenchThreadPayload {
  readonly threadId: string;
  readonly messages: ReadonlyArray<OrchestrationMessage>;
  readonly checkpoints: ReadonlyArray<OrchestrationCheckpointSummary>;
  readonly sessionStatus: OrchestrationSessionStatus;
  readonly activities?: ReadonlyArray<OrchestrationThreadActivity>;
  readonly activePlan?: ActivePlanState | null;
  readonly activeProposedPlan?: LatestProposedPlanState | null;
  readonly latestTurn?: OrchestrationLatestTurn | null;
  readonly proposedPlans?: ReadonlyArray<OrchestrationProposedPlan>;
  readonly activeTurnId?: TurnIdType | null;
}

export interface WorkbenchConnectorSnapshot {
  readonly status: WorkbenchStatusPayload;
  readonly config: ServerConfig | null;
  readonly access: AuthAccessPresentation;
  readonly shell: WorkbenchShellPayload;
  readonly threads: Readonly<Record<string, WorkbenchThreadPayload>>;
}

const NOW = "2026-08-02T09:00:00.000Z";
const FOLLOW_UP_REQUESTED = "2026-08-02T09:01:00.000Z";
const FOLLOW_UP_THINKING = "2026-08-02T09:01:01.000Z";
const FOLLOW_UP_TOOL = "2026-08-02T09:01:02.000Z";
const FOLLOW_UP_COMPLETED = "2026-08-02T09:01:03.000Z";
const EARLIER = "2026-08-02T08:30:00.000Z";
const OLDER = "2026-08-01T14:00:00.000Z";

const ENVIRONMENT_ID = EnvironmentId.make("browser-preview");
const PROJECT_ID = ProjectId.make("browser-preview-project");
const SECOND_PROJECT_ID = ProjectId.make("browser-preview-project-2");
const THREAD_ID = ThreadId.make("browser-preview-thread");
const SECOND_THREAD_ID = ThreadId.make("browser-preview-thread-2");
const NEW_THREAD_ID = ThreadId.make("browser-preview-new-thread");
const TURN_ID = TurnId.make("browser-preview-turn");
const SECOND_TURN_ID = TurnId.make("browser-preview-turn-2");
const PROVIDER_ID = ProviderInstanceId.make("codex");
const CLAUDE_PROVIDER_ID = ProviderInstanceId.make("claudeAgent");
const MODEL = "gpt-5.6-sol";
const MODEL_NAME = "GPT-5.6 Sol";

const provider: ServerProvider = {
  instanceId: PROVIDER_ID,
  driver: ProviderDriverKind.make("codex"),
  displayName: "Codex",
  enabled: true,
  installed: true,
  version: "0.70.0-preview",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: NOW,
  models: [
    { slug: MODEL, name: MODEL_NAME, isCustom: false, isDefault: true, capabilities: {} },
    { slug: "gpt-5.6-luna", name: "GPT-5.6 Luna", isCustom: false, isDefault: false, capabilities: {} },
    { slug: "gpt-5.6-mini", name: "GPT-5.6 Mini", isCustom: false, isDefault: false, capabilities: {} },
  ],
  slashCommands: [],
  skills: [],
};

const claudeProvider: ServerProvider = {
  instanceId: CLAUDE_PROVIDER_ID,
  driver: ProviderDriverKind.make("claudeAgent"),
  displayName: "Claude",
  enabled: true,
  installed: true,
  version: "1.2.0",
  status: "ready",
  auth: { status: "authenticated" },
  checkedAt: NOW,
  models: [
    { slug: "claude-fable-5", name: "Claude Fable 5", isCustom: false, isDefault: true, capabilities: {} },
    { slug: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", isCustom: false, isDefault: false, capabilities: {} },
  ],
  slashCommands: [],
  skills: [],
};

const config: ServerConfig = {
  environment: {
    environmentId: ENVIRONMENT_ID,
    label: "Browser Preview",
    platform: { os: "darwin", arch: "arm64" },
    serverVersion: "0.0.0-nightly.20260802.1",
    capabilities: { repositoryIdentity: true, connectionProbe: true },
  },
  auth: {
    policy: "loopback-browser",
    bootstrapMethods: ["one-time-token"],
    sessionMethods: ["browser-session-cookie", "bearer-access-token"],
    sessionCookieName: "t3_preview_session",
  },
  cwd: "/preview/t3code",
  keybindingsConfigPath: "/preview/t3code/keybindings.json",
  keybindings: [],
  issues: [],
  providers: [provider, claudeProvider],
  availableEditors: ["cursor", "file-manager"],
  observability: {
    logsDirectoryPath: "/preview/logs",
    localTracingEnabled: false,
    otlpTracesEnabled: false,
    otlpMetricsEnabled: false,
  },
  settings: DEFAULT_SERVER_SETTINGS,
};

const project: OrchestrationProjectShell = {
  id: PROJECT_ID,
  title: "T3 Code Browser Lab",
  workspaceRoot: "/preview/t3code",
  repositoryIdentity: null,
  defaultModelSelection: { instanceId: PROVIDER_ID, model: MODEL },
  scripts: [],
  createdAt: EARLIER,
  updatedAt: NOW,
};

const secondProject: OrchestrationProjectShell = {
  id: SECOND_PROJECT_ID,
  title: "Sparkling Router",
  workspaceRoot: "/preview/sparkling",
  repositoryIdentity: null,
  defaultModelSelection: { instanceId: PROVIDER_ID, model: MODEL },
  scripts: [],
  createdAt: OLDER,
  updatedAt: OLDER,
};

function completedThread(
  id: ThreadId,
  projectId: ProjectId,
  title: string,
  branch: string,
  worktreePath: string,
  createdAt: string,
  updatedAt: string,
): OrchestrationThreadShell {
  return {
    id,
    projectId,
    title,
    modelSelection: { instanceId: PROVIDER_ID, model: MODEL },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch,
    worktreePath,
    latestTurn: {
      turnId: TURN_ID,
      state: "completed",
      requestedAt: EARLIER,
      startedAt: EARLIER,
      completedAt: updatedAt,
      assistantMessageId: null,
    },
    createdAt,
    updatedAt,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: createdAt,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

const existingThread = completedThread(
  THREAD_ID,
  PROJECT_ID,
  "Validate the dual renderer workbench",
  "lynxtron-port",
  "/preview/t3code",
  NOW,
  NOW,
);

const secondThread = completedThread(
  SECOND_THREAD_ID,
  SECOND_PROJECT_ID,
  "URL-first container routing",
  "router-rfc",
  "/preview/sparkling",
  OLDER,
  OLDER,
);

const newThread: OrchestrationThreadShell = {
  ...completedThread(
    NEW_THREAD_ID,
    PROJECT_ID,
    "New thread",
    "lynxtron-port",
    "/preview/t3code",
    NOW,
    NOW,
  ),
  latestTurn: null,
  latestUserMessageAt: null,
};

const existingThreadPayload: WorkbenchThreadPayload = {
  threadId: THREAD_ID,
  messages: [
    {
      id: MessageId.make("browser-preview-user-message"),
      role: "user",
      text: "Keep the Web and Native Lynx renderers on one shared composition.",
      turnId: TURN_ID,
      streaming: false,
      createdAt: EARLIER,
      updatedAt: EARLIER,
    },
    {
      id: MessageId.make("browser-preview-assistant-message"),
      role: "assistant",
      text: "The typed preview host is serving deterministic connector state.",
      turnId: TURN_ID,
      streaming: false,
      createdAt: NOW,
      updatedAt: NOW,
    },
  ],
  checkpoints: [],
  sessionStatus: "idle",
  activities: [],
  latestTurn: existingThread.latestTurn,
  proposedPlans: [],
  activeTurnId: null,
};

const newThreadPayload: WorkbenchThreadPayload = {
  threadId: NEW_THREAD_ID,
  messages: [],
  checkpoints: [],
  sessionStatus: "idle",
  activities: [],
  latestTurn: null,
  proposedPlans: [],
  activeTurnId: null,
};

const access: AuthAccessPresentation = {
  pairingLinks: [],
  clientSessions: [],
  pairingLinkCount: 0,
  clientSessionCount: 0,
  hasEntries: false,
};

const branding: DesktopAppBranding = {
  baseName: "T3 Code",
  stageLabel: "Nightly",
  displayName: "T3 Code (Nightly)",
};

const preferences: Readonly<Record<string, unknown>> = {
  themePreference: "dark",
  clientSettings: { sidebarV2Enabled: true, sidebarV2ConfiguredByUser: true },
};

export type WorkbenchScenarioId =
  | "new-thread"
  | "existing-thread"
  | "conversation-code-review"
  | "project-scope-open"
  | "lifecycle-error"
  | "settings-general"
  | "quick-switch"
  | "model-picker";

export interface WorkbenchScenario {
  readonly id: WorkbenchScenarioId;
  readonly label: string;
  readonly route: string;
  readonly theme: "dark";
  readonly activeThreadId: string;
  readonly known: {
    readonly project: string;
    readonly thread: string;
    readonly model: string;
  };
  /**
   * Text that must be visible in both panes for semantic readiness. Chat
   * scenarios default to the `known` labels; non-chat surfaces (Settings,
   * overlays) override this because those chat labels are not on screen.
   */
  readonly readyMarkers?: ReadonlyArray<string>;
  /**
   * Initial route the renderer boots into. The Web reference host reads it
   * directly; the Lynx pane reads it from `preferences.initialRoute` at boot
   * and navigates its pathname authority once. Defaults to the chat route.
   */
  readonly openProjectScope: boolean;
  readonly branding: DesktopAppBranding;
  readonly preferences: Readonly<Record<string, unknown>>;
  readonly snapshot: WorkbenchConnectorSnapshot;
}

function baseSnapshot(
  status: WorkbenchStatusPayload,
  activeThread: OrchestrationThreadShell,
  threadPayload: WorkbenchThreadPayload,
): WorkbenchConnectorSnapshot {
  // The active thread must be FIRST in shell.threads. The Lynx preview
  // connector auto-selects `threads[0]` (it has no scenario `activeThreadId`
  // concept), while the Web reference host selects `activeThreadId` directly.
  // Ordering the active thread first keeps both panes on the same active thread
  // — otherwise New Thread renders the hero on Web but an existing thread on
  // Lynx. Sidebar order is unaffected (it sorts by createdAt), so this only
  // fixes the active-thread pick.
  const siblingThreads = [existingThread, secondThread, newThread].filter(
    (thread) => thread.id !== activeThread.id,
  );
  return {
    status,
    config,
    access,
    shell: {
      projects: [project, secondProject],
      threads: [activeThread, ...siblingThreads],
      archivedThreads: [],
    },
    threads: {
      [THREAD_ID]: existingThreadPayload,
      [NEW_THREAD_ID]: newThreadPayload,
      [activeThread.id]: threadPayload,
    },
  };
}

export const WORKBENCH_SCENARIOS: Readonly<Record<WorkbenchScenarioId, WorkbenchScenario>> = {
  "new-thread": {
    id: "new-thread",
    label: "New Thread",
    route: `/local/${NEW_THREAD_ID}`,
    theme: "dark",
    activeThreadId: NEW_THREAD_ID,
    known: { project: project.title, thread: "New thread", model: MODEL_NAME },
    openProjectScope: false,
    branding,
    preferences,
    snapshot: baseSnapshot({ status: "ready" }, newThread, newThreadPayload),
  },
  "existing-thread": {
    id: "existing-thread",
    label: "Existing Thread",
    route: `/local/${THREAD_ID}`,
    theme: "dark",
    activeThreadId: THREAD_ID,
    known: { project: project.title, thread: existingThread.title, model: MODEL_NAME },
    openProjectScope: false,
    branding,
    preferences,
    snapshot: baseSnapshot({ status: "ready" }, existingThread, existingThreadPayload),
  },
  "conversation-code-review": {
    id: "conversation-code-review",
    label: "Conversation Code Review",
    route: `/local/${THREAD_ID}`,
    theme: "dark",
    activeThreadId: THREAD_ID,
    known: { project: project.title, thread: existingThread.title, model: MODEL_NAME },
    readyMarkers: [
      "Keep the Web and Native Lynx renderers",
      "Add a follow-up formatter",
      "src/formatStatus.ts",
      "Turn changes",
    ],
    openProjectScope: false,
    branding,
    preferences,
    snapshot: baseSnapshot(
      { status: "ready" },
      {
        ...existingThread,
        latestTurn: {
          turnId: SECOND_TURN_ID,
          state: "completed",
          requestedAt: FOLLOW_UP_REQUESTED,
          startedAt: FOLLOW_UP_REQUESTED,
          completedAt: FOLLOW_UP_COMPLETED,
          assistantMessageId: MessageId.make("browser-preview-assistant-message-2"),
        },
      },
      {
        threadId: THREAD_ID,
        messages: [
          ...existingThreadPayload.messages,
          {
            id: MessageId.make("browser-preview-user-message-2"),
            role: "user",
            text: "Add a follow-up formatter and show the final TypeScript.",
            turnId: SECOND_TURN_ID,
            streaming: false,
            createdAt: FOLLOW_UP_REQUESTED,
            updatedAt: FOLLOW_UP_REQUESTED,
          },
          {
            id: MessageId.make("browser-preview-assistant-message-2"),
            role: "assistant",
            text:
              "Implemented the formatter and kept the API small.\n\n```ts title=\"src/formatStatus.ts\"\nexport function formatStatus(value: string): string {\n  return value.trim().toLowerCase();\n}\n```\n\nThe focused tests pass.",
            turnId: SECOND_TURN_ID,
            streaming: false,
            createdAt: FOLLOW_UP_COMPLETED,
            updatedAt: FOLLOW_UP_COMPLETED,
          },
        ],
        activities: [
          {
            id: EventId.make("browser-preview-thinking-2"),
            tone: "info",
            kind: "task.progress",
            summary: "Thinking through the smallest formatter API",
            payload: {
              summary: "Thinking through the smallest formatter API",
              detail: "Compare existing helpers and preserve call sites.",
            },
            turnId: SECOND_TURN_ID,
            createdAt: FOLLOW_UP_THINKING,
          },
          {
            id: EventId.make("browser-preview-tool-2"),
            tone: "tool",
            kind: "tool.completed",
            summary: "Updated formatter",
            payload: {
              status: "completed",
              command: "pnpm test formatStatus",
              detail: "2 tests passed",
              changedFiles: ["src/formatStatus.ts"],
            },
            turnId: SECOND_TURN_ID,
            createdAt: FOLLOW_UP_TOOL,
          },
        ],
        checkpoints: [
          {
            turnId: SECOND_TURN_ID,
            checkpointTurnCount: 2,
            checkpointRef: CheckpointRef.make("browser-preview-checkpoint-2"),
            status: "ready",
            files: [
              {
                path: "src/formatStatus.ts",
                kind: "modified",
                additions: 3,
                deletions: 0,
              },
            ],
            assistantMessageId: MessageId.make("browser-preview-assistant-message-2"),
            completedAt: FOLLOW_UP_COMPLETED,
          },
        ],
        sessionStatus: "idle",
        latestTurn: {
          turnId: SECOND_TURN_ID,
          state: "completed",
          requestedAt: FOLLOW_UP_REQUESTED,
          startedAt: FOLLOW_UP_REQUESTED,
          completedAt: FOLLOW_UP_COMPLETED,
          assistantMessageId: MessageId.make("browser-preview-assistant-message-2"),
        },
        proposedPlans: [],
        activeTurnId: null,
      },
    ),
  },
  "project-scope-open": {
    id: "project-scope-open",
    label: "Project Scope Open",
    route: `/local/${THREAD_ID}`,
    theme: "dark",
    activeThreadId: THREAD_ID,
    known: { project: project.title, thread: existingThread.title, model: MODEL_NAME },
    openProjectScope: true,
    branding,
    preferences,
    snapshot: baseSnapshot({ status: "ready" }, existingThread, existingThreadPayload),
  },
  "lifecycle-error": {
    id: "lifecycle-error",
    label: "Lifecycle Error",
    route: `/local/${THREAD_ID}`,
    theme: "dark",
    activeThreadId: THREAD_ID,
    known: { project: project.title, thread: existingThread.title, model: MODEL_NAME },
    openProjectScope: false,
    branding,
    preferences,
    snapshot: baseSnapshot(
      { status: "error", detail: "t3 server process exited before becoming ready" },
      existingThread,
      existingThreadPayload,
    ),
  },
  "settings-general": {
    id: "settings-general",
    label: "Settings General",
    route: "/settings/general",
    theme: "dark",
    activeThreadId: THREAD_ID,
    known: { project: project.title, thread: existingThread.title, model: MODEL_NAME },
    // Settings shows neither the chat labels nor a hero; key readiness to the
    // Settings shell chrome and the General panel's canonical section labels.
    readyMarkers: ["Settings", "General", "Appearance", "Providers"],
    openProjectScope: false,
    branding,
    // The Lynx pane boots at "/" and reads this to navigate its pathname
    // authority once, matching the Web host's `route`.
    preferences: { ...preferences, initialRoute: "/settings/general" },
    snapshot: baseSnapshot({ status: "ready" }, existingThread, existingThreadPayload),
  },
  "quick-switch": {
    id: "quick-switch",
    label: "Quick Switch",
    route: `/local/${THREAD_ID}`,
    theme: "dark",
    activeThreadId: THREAD_ID,
    known: { project: project.title, thread: existingThread.title, model: MODEL_NAME },
    // The overlay covers the chat shell; readiness keys to the palette chrome
    // (section labels) plus a known thread row.
    readyMarkers: ["Actions", "Recent Threads", existingThread.title],
    openProjectScope: false,
    branding,
    // The Lynx pane reads this at boot to open the Quick Switch overlay.
    preferences: { ...preferences, initialOverlay: "quick-switch" },
    snapshot: baseSnapshot({ status: "ready" }, existingThread, existingThreadPayload),
  },
  "model-picker": {
    id: "model-picker",
    label: "Model Picker",
    route: `/local/${THREAD_ID}`,
    theme: "dark",
    activeThreadId: THREAD_ID,
    known: { project: project.title, thread: existingThread.title, model: MODEL_NAME },
    // The model-picker overlay lists provider models; readiness keys to the
    // provider rail + a known model row rather than the chat labels.
    readyMarkers: ["Codex", "Claude", MODEL_NAME, "Claude Fable 5"],
    openProjectScope: false,
    branding,
    preferences: { ...preferences, initialOverlay: "model-picker" },
    snapshot: baseSnapshot({ status: "ready" }, existingThread, existingThreadPayload),
  },
};

export const WORKBENCH_SCENARIO_IDS = Object.keys(
  WORKBENCH_SCENARIOS,
) as ReadonlyArray<WorkbenchScenarioId>;

export const DEFAULT_WORKBENCH_SCENARIO_ID: WorkbenchScenarioId = "existing-thread";

export function isWorkbenchScenarioId(value: string): value is WorkbenchScenarioId {
  return value in WORKBENCH_SCENARIOS;
}

import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  MessageId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  OrchestrationProposedPlanId,
  ThreadId,
  TurnId,
  EventId,
  type DesktopAppBranding,
  type OrchestrationProjectShell,
  type OrchestrationThreadShell,
  type ServerConfig,
  type ServerProvider,
} from "@t3tools/contracts";

import type { ConnectorSnapshot } from "../shared/connectorProtocol.ts";

const NOW = "2026-08-02T09:00:00.000Z";
const EARLIER = "2026-08-02T08:30:00.000Z";
const PROJECT_ID = ProjectId.make("browser-preview-project");
const THREAD_ID = ThreadId.make("browser-preview-thread");
const TURN_ID = TurnId.make("browser-preview-turn");
const PROVIDER_ID = ProviderInstanceId.make("codex");
const MODEL = "gpt-5.6-sol";

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
    {
      slug: MODEL,
      name: "GPT-5.6 Sol",
      isCustom: false,
      isDefault: true,
      capabilities: {},
    },
  ],
  slashCommands: [],
  skills: [],
};

const config: ServerConfig = {
  environment: {
    environmentId: EnvironmentId.make("browser-preview"),
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
  providers: [provider],
  availableEditors: [],
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

const thread: OrchestrationThreadShell = {
  id: THREAD_ID,
  projectId: PROJECT_ID,
  title: "Validate the dual renderer workbench",
  modelSelection: { instanceId: PROVIDER_ID, model: MODEL },
  runtimeMode: "full-access",
  interactionMode: "default",
  branch: "lynxtron-port",
  worktreePath: "/preview/t3code",
  latestTurn: {
    turnId: TURN_ID,
    state: "completed",
    requestedAt: EARLIER,
    startedAt: EARLIER,
    completedAt: NOW,
    assistantMessageId: null,
  },
  createdAt: EARLIER,
  updatedAt: NOW,
  archivedAt: null,
  settledOverride: null,
  settledAt: null,
  session: null,
  latestUserMessageAt: EARLIER,
  hasPendingApprovals: false,
  hasPendingUserInput: false,
  hasActionableProposedPlan: false,
};

const threadPayload: ConnectorSnapshot["threads"][string] = {
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
  latestTurn: thread.latestTurn,
  proposedPlans: [],
  activeTurnId: null,
};

const longTranscriptMessages: ConnectorSnapshot["threads"][string]["messages"] = Array.from(
  { length: 80 },
  (_, index) => ({
    id: MessageId.make(`browser-preview-long-message-${index + 1}`),
    role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
    text:
      index === 79
        ? [
            "Long transcript terminal marker",
            "",
            "| Renderer | Result |",
            "| :--- | ---: |",
            "| Web | pass |",
            "| Lynx | pass |",
            "",
            "- Parent item",
            "  - Nested item",
            "",
            "```ts title=src/example.ts",
            "export const parity = true;",
            "```",
            "",
            "[Open docs](https://example.com/docs)",
            "",
            "![Parity proof](./evidence/parity.png)",
          ].join("\n")
        : `Long transcript message ${index + 1}: preserve order while reading history.`,
    turnId: TurnId.make(`browser-preview-long-turn-${Math.floor(index / 2) + 1}`),
    streaming: false,
    createdAt: new Date(Date.parse(EARLIER) + index * 1_000).toISOString(),
    updatedAt: new Date(Date.parse(EARLIER) + index * 1_000).toISOString(),
  }),
);

const approvalActivity = {
  id: EventId.make("browser-preview-approval"),
  sequence: 1,
  kind: "approval.requested",
  summary: "Command approval requested",
  tone: "approval" as const,
  payload: {
    requestId: "browser-preview-approval-request",
    requestKind: "command",
    detail: "pnpm test --filter composer",
  },
  turnId: TURN_ID,
  createdAt: NOW,
};

const userInputActivity = {
  id: EventId.make("browser-preview-user-input"),
  sequence: 1,
  kind: "user-input.requested",
  summary: "User input requested",
  tone: "info" as const,
  payload: {
    requestId: "browser-preview-user-input-request",
    questions: [
      {
        id: "scope",
        header: "Scope",
        question: "Which renderer should this change target?",
        options: [
          { label: "Lynx", description: "Use the native renderer" },
          { label: "Web", description: "Use the browser renderer" },
        ],
        multiSelect: false,
      },
    ],
  },
  turnId: TURN_ID,
  createdAt: NOW,
};

const proposedPlan = {
  id: OrchestrationProposedPlanId.make("browser-preview-plan"),
  turnId: TURN_ID,
  planMarkdown:
    "# Complete intervention parity\n\n- Wire the canonical command\n- Verify the resolved state",
  implementedAt: null,
  implementationThreadId: null,
  createdAt: NOW,
  updatedAt: NOW,
};

const runningWorkActivity = {
  id: EventId.make("browser-preview-running-work"),
  sequence: 1,
  kind: "tool.completed",
  summary: "Inspected recovery state",
  tone: "tool" as const,
  payload: { status: "completed", data: { toolCallId: "browser-preview-running-tool" } },
  turnId: TURN_ID,
  createdAt: NOW,
};

const access: ConnectorSnapshot["access"] = {
  pairingLinks: [],
  clientSessions: [],
  pairingLinkCount: 0,
  clientSessionCount: 0,
  hasEntries: false,
};

export type BrowserPreviewScenarioId =
  | "populated-ready"
  | "populated-connecting"
  | "connection-error"
  | "long-transcript"
  | "send-recovery"
  | "running-turn"
  | "pending-approval"
  | "pending-user-input"
  | "proposed-plan";

export interface BrowserPreviewScenario {
  readonly id: BrowserPreviewScenarioId;
  readonly route: string;
  readonly theme: "dark";
  readonly known: {
    readonly project: string;
    readonly thread: string;
    readonly model: string;
  };
  readonly branding: DesktopAppBranding;
  readonly preferences: Readonly<Record<string, unknown>>;
  readonly snapshot: ConnectorSnapshot;
}

function scenario(
  id: BrowserPreviewScenarioId,
  status: ConnectorSnapshot["status"],
  activities: NonNullable<ConnectorSnapshot["threads"][string]["activities"]> = [],
  proposedPlans: NonNullable<ConnectorSnapshot["threads"][string]["proposedPlans"]> = [],
  threadOverrides: Partial<ConnectorSnapshot["threads"][string]> = {},
): BrowserPreviewScenario {
  return {
    id,
    route: `/local/${THREAD_ID}`,
    theme: "dark",
    known: { project: project.title, thread: thread.title, model: "GPT-5.6 Sol" },
    branding: { baseName: "T3 Code", stageLabel: "Nightly", displayName: "T3 Code (Nightly)" },
    preferences: {
      themePreference: "dark",
      clientSettings: {
        sidebarV2Enabled: true,
        sidebarV2ConfiguredByUser: true,
      },
    },
    snapshot: {
      status,
      config,
      access,
      shell: { projects: [project], threads: [thread], archivedThreads: [] },
      threads: {
        [THREAD_ID]: {
          ...threadPayload,
          activities,
          proposedPlans,
          activeProposedPlan: proposedPlans[0] ?? null,
          ...threadOverrides,
        },
      },
    },
  };
}

export const BROWSER_PREVIEW_SCENARIOS: Readonly<
  Record<BrowserPreviewScenarioId, BrowserPreviewScenario>
> = {
  "populated-ready": scenario("populated-ready", { status: "ready" }),
  "populated-connecting": scenario("populated-connecting", {
    status: "connecting",
    detail: "Attaching the deterministic preview connector",
  }),
  "connection-error": scenario("connection-error", {
    status: "error",
    detail: "The local server stopped before the workspace was ready.",
  }),
  "long-transcript": scenario("long-transcript", { status: "ready" }, [], [], {
    messages: longTranscriptMessages,
  }),
  "send-recovery": scenario("send-recovery", { status: "ready" }),
  "running-turn": scenario("running-turn", { status: "ready" }, [runningWorkActivity], [], {
    sessionStatus: "running",
    activeTurnId: TURN_ID,
    latestTurn: {
      turnId: TURN_ID,
      state: "running",
      requestedAt: EARLIER,
      startedAt: NOW,
      completedAt: null,
      assistantMessageId: null,
    },
  }),
  "pending-approval": scenario("pending-approval", { status: "ready" }, [approvalActivity]),
  "pending-user-input": scenario("pending-user-input", { status: "ready" }, [userInputActivity]),
  "proposed-plan": scenario("proposed-plan", { status: "ready" }, [], [proposedPlan]),
};

export const DEFAULT_BROWSER_PREVIEW_SCENARIO_ID: BrowserPreviewScenarioId = "populated-connecting";

export function isBrowserPreviewScenarioId(value: string): value is BrowserPreviewScenarioId {
  return value in BROWSER_PREVIEW_SCENARIOS;
}

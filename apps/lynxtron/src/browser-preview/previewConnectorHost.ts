import {
  T3_CONNECTOR_EVENT,
  T3_CONNECTOR_METHODS,
  isConnectorCommandName,
  type ConnectorCommandName,
  type ConnectorCommandRequest,
  type ConnectorConnectionStatus,
  type ConnectorEventEnvelope,
  type ConnectorEventPayload,
  type ConnectorSnapshot,
  type ConnectorSyncReply,
} from "../shared/connectorProtocol.ts";
import { EventId, MessageId, ThreadId, TurnId } from "@t3tools/contracts";
import {
  BROWSER_PREVIEW_SCENARIOS,
  type BrowserPreviewScenario,
  type BrowserPreviewScenarioId,
} from "./previewScenarios.ts";

export interface BrowserPreviewCommandRecord {
  readonly sequence: number;
  readonly method: ConnectorCommandName;
  readonly params?: unknown;
}

export interface BrowserPreviewConnectorDiagnostics {
  readonly hostKind: "typed-browser-preview";
  scenarioId: BrowserPreviewScenarioId;
  route: string;
  lastSequence: number;
  nativeModuleReady: boolean;
  readyCalls: number;
  resyncCalls: number;
  readonly commands: BrowserPreviewCommandRecord[];
  readonly unsupportedCapabilities: readonly [
    "keyboard",
    "filesystem",
    "shell",
    "clipboard",
    "native-navigation",
  ];
}

type EmitGlobalEvent = (eventName: string, params: [ConnectorEventEnvelope]) => void;

const UNSUPPORTED_COMMANDS = new Set<ConnectorCommandName>([
  "listProjectEntries",
  "readProjectFile",
  "writeProjectFile",
  "discoverSourceControl",
]);

export class BrowserPreviewConnectorHost {
  readonly diagnostics: BrowserPreviewConnectorDiagnostics;
  #scenario: BrowserPreviewScenario;
  #snapshot: ConnectorSnapshot;
  #emitGlobalEvent: EmitGlobalEvent;
  #sendPromptAttempts = 0;

  constructor(scenario: BrowserPreviewScenario, emitGlobalEvent: EmitGlobalEvent) {
    this.#scenario = scenario;
    this.#snapshot = scenario.snapshot;
    this.#emitGlobalEvent = emitGlobalEvent;
    this.diagnostics = {
      hostKind: "typed-browser-preview",
      scenarioId: scenario.id,
      route: scenario.route,
      lastSequence: 0,
      nativeModuleReady: false,
      readyCalls: 0,
      resyncCalls: 0,
      commands: [],
      unsupportedCapabilities: [
        "keyboard",
        "filesystem",
        "shell",
        "clipboard",
        "native-navigation",
      ],
    };
  }

  get scenario(): BrowserPreviewScenario {
    return this.#scenario;
  }

  handleNativeCall(method: string, data: unknown, moduleName: string): unknown {
    if (moduleName !== "bridge") {
      throw new Error(`Unsupported preview native module: ${moduleName}`);
    }
    if (method === "t3:preview.module-ready") {
      this.diagnostics.nativeModuleReady = true;
      return { ok: true };
    }
    if (method === T3_CONNECTOR_METHODS.ready) {
      this.diagnostics.nativeModuleReady = true;
      this.diagnostics.readyCalls += 1;
      return this.#syncReply();
    }
    if (method === T3_CONNECTOR_METHODS.resync) {
      this.diagnostics.resyncCalls += 1;
      return this.#syncReply();
    }
    if (method === T3_CONNECTOR_METHODS.command) {
      return this.#recordCommand(data);
    }
    throw new Error(`Unsupported preview bridge method: ${method}`);
  }

  emitStatus(status: ConnectorConnectionStatus, detail?: string): number {
    const payload = { status, ...(detail ? { detail } : {}) };
    this.#snapshot = { ...this.#snapshot, status: payload };
    this.#emit({ kind: "status", payload });
    return this.diagnostics.lastSequence;
  }

  emitSequenceGapForDiagnostic(status: ConnectorConnectionStatus): number {
    const payload = {
      status,
      detail: "Intentional preview sequence gap; renderer must resync",
    };
    this.#snapshot = { ...this.#snapshot, status: payload };
    this.diagnostics.lastSequence += 2;
    this.#emitGlobalEvent(T3_CONNECTOR_EVENT, [
      { kind: "status", payload, seq: this.diagnostics.lastSequence },
    ]);
    return this.diagnostics.lastSequence;
  }

  switchScenario(scenarioId: BrowserPreviewScenarioId): number {
    const scenario = BROWSER_PREVIEW_SCENARIOS[scenarioId];
    this.#scenario = scenario;
    this.#snapshot = scenario.snapshot;
    this.diagnostics.scenarioId = scenario.id;
    this.diagnostics.route = scenario.route;
    this.#emit({ kind: "status", payload: scenario.snapshot.status });
    if (scenario.snapshot.config) {
      this.#emit({ kind: "config", payload: scenario.snapshot.config });
    }
    this.#emit({ kind: "access", payload: scenario.snapshot.access });
    this.#emit({ kind: "shell", payload: scenario.snapshot.shell });
    for (const [threadId, payload] of Object.entries(scenario.snapshot.threads)) {
      this.#emit({ kind: "thread", threadId, payload });
    }
    return this.diagnostics.lastSequence;
  }

  #syncReply(): ConnectorSyncReply {
    return { snapshot: this.#snapshot, seq: this.diagnostics.lastSequence };
  }

  #emit(payload: ConnectorEventPayload): void {
    this.diagnostics.lastSequence += 1;
    this.#emitGlobalEvent(T3_CONNECTOR_EVENT, [
      { ...payload, seq: this.diagnostics.lastSequence } as ConnectorEventEnvelope,
    ]);
  }

  #recordCommand(value: unknown): unknown {
    if (typeof value !== "object" || value === null) {
      throw new Error("Malformed preview connector command");
    }
    const request = value as ConnectorCommandRequest;
    if (!isConnectorCommandName(request.method)) {
      throw new Error(`Rejected preview connector command: ${String(request.method)}`);
    }
    const record: BrowserPreviewCommandRecord = {
      sequence: this.diagnostics.commands.length + 1,
      method: request.method,
      ...(request.params === undefined ? {} : { params: request.params }),
    };
    this.diagnostics.commands.push(record);
    if (request.method === "sendPrompt" && this.#scenario.id === "send-recovery") {
      this.#sendPromptAttempts += 1;
      if (this.#sendPromptAttempts === 1) {
        return new Promise<never>((_resolve, reject) => {
          setTimeout(() => reject(new Error("Preview send failed; retry is available.")), 1_000);
        });
      }
      const params = request.params as {
        readonly threadId?: string;
        readonly text?: string;
        readonly attachments?: ReadonlyArray<{
          readonly type: "image";
          readonly name: string;
          readonly mimeType: string;
          readonly sizeBytes: number;
        }>;
      };
      const threadId = params.threadId;
      const current = threadId ? this.#snapshot.threads[threadId] : undefined;
      if (current && threadId && (params.text || params.attachments?.length)) {
        const createdAt = new Date().toISOString();
        const turnId = TurnId.make("browser-preview-retry-turn");
        const next: ConnectorSnapshot["threads"][string] = {
          ...current,
          messages: [
            ...current.messages,
            {
              id: MessageId.make("browser-preview-retry-message"),
              role: "user",
              text: params.text ?? "",
              ...(params.attachments?.length
                ? {
                    attachments: params.attachments.map((attachment, index) => ({
                      type: attachment.type,
                      id: `preview-image-${this.diagnostics.commands.length}-${index}`,
                      name: attachment.name,
                      mimeType: attachment.mimeType,
                      sizeBytes: attachment.sizeBytes,
                    })),
                  }
                : {}),
              turnId,
              streaming: false,
              createdAt,
              updatedAt: createdAt,
            },
          ],
          sessionStatus: "running",
          activeTurnId: turnId,
          latestTurn: {
            turnId,
            state: "running",
            requestedAt: createdAt,
            startedAt: createdAt,
            completedAt: null,
            assistantMessageId: null,
          },
        };
        this.#snapshot = {
          ...this.#snapshot,
          threads: { ...this.#snapshot.threads, [threadId]: next },
        };
        this.#emit({ kind: "thread", threadId, payload: next });
      }
      return undefined;
    }
    if (request.method === "interrupt" && this.#scenario.id === "running-turn") {
      const params = request.params as { readonly threadId?: string };
      const threadId = params.threadId;
      const current = threadId ? this.#snapshot.threads[threadId] : undefined;
      if (current && threadId) {
        const startedAt = current.latestTurn?.startedAt;
        const completedAt = startedAt
          ? new Date(Date.parse(startedAt) + 1_000).toISOString()
          : new Date().toISOString();
        const next: ConnectorSnapshot["threads"][string] = {
          ...current,
          sessionStatus: "interrupted",
          activeTurnId: null,
          latestTurn: current.latestTurn
            ? { ...current.latestTurn, state: "interrupted", completedAt }
            : null,
        };
        this.#snapshot = {
          ...this.#snapshot,
          threads: { ...this.#snapshot.threads, [threadId]: next },
        };
        this.#emit({ kind: "thread", threadId, payload: next });
      }
      return undefined;
    }
    if (request.method === "respondToApproval" || request.method === "respondToUserInput") {
      const params = request.params as { readonly threadId?: string; readonly requestId?: string };
      const threadId = params.threadId;
      const requestId = params.requestId;
      const current = threadId ? this.#snapshot.threads[threadId] : undefined;
      if (current && threadId && requestId) {
        const resolvedKind =
          request.method === "respondToApproval" ? "approval.resolved" : "user-input.resolved";
        const payload = { requestId };
        const activities = current.activities ?? [];
        const next: ConnectorSnapshot["threads"][string] = {
          ...current,
          activities: [
            ...activities,
            {
              id: EventId.make(`preview-${resolvedKind}-${this.diagnostics.commands.length}`),
              sequence: activities.length + 1,
              kind: resolvedKind,
              summary: "Preview request resolved",
              tone: "info",
              payload,
              turnId: current.activeTurnId ?? null,
              createdAt: new Date().toISOString(),
            },
          ],
        };
        this.#snapshot = {
          ...this.#snapshot,
          threads: { ...this.#snapshot.threads, [threadId]: next },
        };
        this.#emit({ kind: "thread", threadId, payload: next });
      }
      return undefined;
    }
    if (request.method === "implementProposedPlan") {
      const params = request.params as { readonly threadId?: string; readonly planId?: string };
      const threadId = params.threadId;
      const current = threadId ? this.#snapshot.threads[threadId] : undefined;
      if (current && threadId && params.planId) {
        const implementedAt = new Date().toISOString();
        const proposedPlans = (current.proposedPlans ?? []).map((plan) =>
          plan.id === params.planId
            ? {
                ...plan,
                implementedAt,
                implementationThreadId: ThreadId.make(threadId),
                updatedAt: implementedAt,
              }
            : plan,
        );
        const next: ConnectorSnapshot["threads"][string] = {
          ...current,
          proposedPlans,
          activeProposedPlan: null,
          sessionStatus: "running",
        };
        this.#snapshot = {
          ...this.#snapshot,
          threads: { ...this.#snapshot.threads, [threadId]: next },
        };
        this.#emit({ kind: "thread", threadId, payload: next });
      }
      return undefined;
    }
    if (request.method === "implementProposedPlanInNewThread") {
      return { threadId: "browser-preview-implementation-thread" };
    }
    if (UNSUPPORTED_COMMANDS.has(request.method)) {
      throw new Error(`${request.method} is unavailable in the isolated browser preview`);
    }
    if (request.method === "createThread") {
      return { threadId: this.#scenario.snapshot.shell.threads[0]?.id };
    }
    if (request.method === "setProviderEnabled" || request.method === "updateServerSettings") {
      return this.#snapshot.config;
    }
    if (request.method === "createPairingCredential") {
      throw new Error("Pairing credentials are unavailable in the isolated browser preview");
    }
    if (request.method === "revokePairingLink" || request.method === "revokeClientSession") {
      return false;
    }
    if (request.method === "revokeOtherClientSessions") return 0;
    return undefined;
  }
}

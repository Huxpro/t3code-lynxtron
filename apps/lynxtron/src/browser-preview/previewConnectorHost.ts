import {
  T3_CONNECTOR_EVENT,
  T3_CONNECTOR_METHODS,
  encodeConnectorServerConfig,
  isConnectorCommandName,
  type ConnectorCommandName,
  type ConnectorCommandRequest,
  type ConnectorConnectionStatus,
  type ConnectorEventEnvelope,
  type ConnectorEventPayload,
  type ConnectorSnapshot,
  type ConnectorSyncReply,
} from "../shared/connectorProtocol.ts";
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
  initialStateCalls: number;
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
  "createProject",
  "browseFilesystem",
  "lookupRepository",
  "cloneRepository",
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

  constructor(scenario: BrowserPreviewScenario, emitGlobalEvent: EmitGlobalEvent) {
    this.#scenario = scenario;
    this.#snapshot = {
      ...scenario.snapshot,
      config: scenario.snapshot.config
        ? encodeConnectorServerConfig(scenario.snapshot.config)
        : null,
    };
    this.#emitGlobalEvent = emitGlobalEvent;
    this.diagnostics = {
      hostKind: "typed-browser-preview",
      scenarioId: scenario.id,
      route: scenario.route,
      lastSequence: 0,
      nativeModuleReady: false,
      readyCalls: 0,
      resyncCalls: 0,
      initialStateCalls: 0,
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
    if (method === "t3:preview.initial-state") {
      this.diagnostics.initialStateCalls += 1;
      return {
        route: this.#scenario.route,
        overlay: (this.#scenario.preferences as { initialOverlay?: string }).initialOverlay ?? null,
        theme:
          (this.#scenario.preferences as { themePreference?: string }).themePreference ?? "dark",
      };
    }
    if (method === T3_CONNECTOR_METHODS.ready) {
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
    this.#snapshot = {
      ...scenario.snapshot,
      config: scenario.snapshot.config
        ? encodeConnectorServerConfig(scenario.snapshot.config)
        : null,
    };
    this.diagnostics.scenarioId = scenario.id;
    this.diagnostics.route = scenario.route;
    this.#emit({ kind: "status", payload: scenario.snapshot.status });
    if (this.#snapshot.config) {
      this.#emit({ kind: "config", payload: this.#snapshot.config });
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
    if (UNSUPPORTED_COMMANDS.has(request.method)) {
      throw new Error(`${request.method} is unavailable in the isolated browser preview`);
    }
    if (request.method === "createThread") {
      return { threadId: this.#scenario.snapshot.shell.threads[0]?.id };
    }
    if (
      request.method === "refreshProviders" ||
      request.method === "updateProvider" ||
      request.method === "setProviderEnabled" ||
      request.method === "updateServerSettings"
    ) {
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

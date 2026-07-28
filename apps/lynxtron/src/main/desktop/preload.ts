// T3 Code Lynxtron preload (Node host layer).
//
// Loads the self-contained backend connector bundle (built separately against
// t3code's patched effect + contracts) via __non_webpack_require__ so rspack
// does not try to bundle effect/contracts at host-compile time. Exposes a small
// pull-based API to the Lynx UI: the connector buffers the latest status/shell/
// thread snapshots and the UI polls them (Lynx preload has no sendGlobalEvent;
// that is a main-process API).
import { contextBridge } from "@lynx-js/lynxtron/context-bridge";
import { clipboard, shell } from "@lynx-js/lynxtron";
import type { DesktopAppBranding, DesktopAppStageLabel } from "@t3tools/contracts";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

import { resolveLynxtronPrefsPath } from "./prefsPath";

// __non_webpack_require__ bypasses rspack's compile-time require.resolve so the
// prebuilt connector bundle is loaded at runtime from dist/desktop.
declare const __non_webpack_require__: (id: string) => any;

interface LatestState {
  status: { status: string; detail?: string };
  config: any | null;
  access: {
    pairingLinks: any[];
    clientSessions: any[];
    pairingLinkCount: number;
    clientSessionCount: number;
    hasEntries: boolean;
  };
  shell: { projects: any[]; threads: any[] };
  threads: Record<
    string,
    { threadId: string; messages: any[]; checkpoints: any[]; sessionStatus: string }
  >;
  logs: string[];
}

const latest: LatestState = {
  status: { status: "idle" },
  config: null,
  access: {
    pairingLinks: [],
    clientSessions: [],
    pairingLinkCount: 0,
    clientSessionCount: 0,
    hasEntries: false,
  },
  shell: { projects: [], threads: [] },
  threads: {},
  logs: [],
};

let connector: any;
let connectPromise: Promise<any> | null = null;

// --- tiny JSON preference store (UI settings persistence) ---
const PREFS_PATH = resolveLynxtronPrefsPath({
  env: process.env,
  homeDirectory: os.homedir(),
});
let prefsCache: Record<string, unknown> | null = null;

function readPrefs(): Record<string, unknown> {
  if (prefsCache) return prefsCache;
  try {
    prefsCache = JSON.parse(fs.readFileSync(PREFS_PATH, "utf8")) as Record<string, unknown>;
  } catch {
    prefsCache = {};
  }
  return prefsCache!;
}

function writePrefs(patch: Record<string, unknown>): Record<string, unknown> {
  const next = { ...readPrefs(), ...patch };
  prefsCache = next;
  try {
    fs.mkdirSync(path.dirname(PREFS_PATH), { recursive: true });
    fs.writeFileSync(PREFS_PATH, JSON.stringify(next, null, 2));
  } catch {
    /* best-effort persistence */
  }
  return next;
}

function loadConnector() {
  if (connector) return connector;
  // The connector bundle is copied next to preload.js in dist/desktop.
  const connectorPath = path.join(__dirname, "connector.bundle.cjs");
  const { T3Connector } = __non_webpack_require__(connectorPath);
  connector = new T3Connector({
    onStatus: (status: string, detail?: string) => {
      latest.status = { status, detail };
    },
    onConfig: (config: any) => {
      latest.config = config;
    },
    onAccess: (access: LatestState["access"]) => {
      latest.access = access;
    },
    onShell: (payload: any) => {
      latest.shell = payload;
    },
    onThread: (threadId: string, payload: any) => {
      latest.threads[threadId] = payload;
    },
    onLog: (line: string) => {
      latest.logs.push(line);
      if (latest.logs.length > 200) latest.logs.shift();
      // Mirror to host stdout for debugging.
      console.log(line);
    },
  });
  return connector;
}

function resolveAppBranding(): DesktopAppBranding {
  const configuredStage = process.env.T3_LYNXTRON_APP_STAGE_LABEL?.trim();
  const stageLabel: DesktopAppStageLabel =
    configuredStage === "Dev" || configuredStage === "Nightly" || configuredStage === "Alpha"
      ? configuredStage
      : process.env.NODE_ENV === "development"
        ? "Dev"
        : "Alpha";
  return {
    baseName: "T3 Code",
    stageLabel,
    displayName: `T3 Code (${stageLabel})`,
  };
}

contextBridge.exposeInLynxBTS({
  getAppBranding: resolveAppBranding,
  connect: async () => {
    // Idempotent: multiple UI components may call connect(); only the first
    // one actually boots the connector (and its spawned t3 server).
    if (connectPromise) return connectPromise;
    connectPromise = (async () => {
      try {
        const c = loadConnector();
        return await c.connect();
      } catch (err: any) {
        const detail = err?.message ?? String(err);
        latest.status = { status: "error", detail };
        return { status: "error", detail };
      }
    })();
    return connectPromise;
  },
  // Pull-based state accessors (UI polls these).
  getStatus: () => latest.status,
  getConfig: () => latest.config,
  getAccess: () => latest.access,
  getShell: () => latest.shell,
  getThread: (threadId: string) => latest.threads[threadId] ?? null,
  createThread: async (input: { projectId?: string; title?: string }) => {
    const c = loadConnector();
    return c.createThread(input ?? {});
  },
  selectThread: async (threadId: string) => {
    const c = loadConnector();
    c.selectThread(threadId);
  },
  sendPrompt: async (input: { threadId: string; text: string }) => {
    const c = loadConnector();
    return c.sendPrompt(input);
  },
  interrupt: async (input: { threadId: string }) => {
    const c = loadConnector();
    return c.interrupt(input);
  },
  setModelSelection: async (input: {
    threadId?: string;
    selection: { instanceId: string; model: string; options?: unknown };
  }) => {
    const c = loadConnector();
    return c.setModelSelection(input);
  },
  setThreadRuntimeMode: async (input: { threadId: string; runtimeMode: string }) => {
    const c = loadConnector();
    return c.setThreadRuntimeMode(input);
  },
  setThreadInteractionMode: async (input: { threadId: string; interactionMode: string }) => {
    const c = loadConnector();
    return c.setThreadInteractionMode(input);
  },
  setProviderEnabled: async (input: { instanceId: string; enabled: boolean }) => {
    const c = loadConnector();
    return c.setProviderEnabled(input);
  },
  updateServerSettings: async (input: { patch: Record<string, unknown> }) => {
    const c = loadConnector();
    return c.updateServerSettings(input);
  },
  deleteThread: async (input: { threadId: string }) => {
    const c = loadConnector();
    return c.deleteThread(input);
  },
  archiveThread: async (input: { threadId: string; unarchive?: boolean }) => {
    const c = loadConnector();
    return c.archiveThread(input);
  },
  renameThread: async (input: { threadId: string; title: string }) => {
    const c = loadConnector();
    return c.renameThread(input);
  },
  listProjectEntries: async (input: { cwd: string }) => {
    const c = loadConnector();
    return c.listProjectEntries(input);
  },
  readProjectFile: async (input: { cwd: string; relativePath: string }) => {
    const c = loadConnector();
    return c.readProjectFile(input);
  },
  writeProjectFile: async (input: { cwd: string; relativePath: string; contents: string }) => {
    const c = loadConnector();
    return c.writeProjectFile(input);
  },
  discoverSourceControl: async () => {
    const c = loadConnector();
    return c.discoverSourceControl();
  },
  createPairingCredential: async (input?: { label?: string }) => {
    const c = loadConnector();
    return c.createPairingCredential(input);
  },
  revokePairingLink: async (input: { id: string }) => {
    const c = loadConnector();
    return c.revokePairingLink(input.id);
  },
  revokeClientSession: async (input: { sessionId: string }) => {
    const c = loadConnector();
    return c.revokeClientSession(input.sessionId);
  },
  revokeOtherClientSessions: async () => {
    const c = loadConnector();
    return c.revokeOtherClientSessions();
  },
  // Preference persistence (sync; small JSON file).
  getPrefs: () => readPrefs(),
  setPrefs: (patch: Record<string, unknown>) => writePrefs(patch ?? {}),
  writeClipboardText: (value: string) => clipboard.writeText(value),
  openExternal: async (url: string) => {
    await shell.openExternal(url);
  },
  openPath: async (targetPath: string) => {
    const error = await shell.openPath(targetPath);
    if (error) throw new Error(error);
  },
});

process.on("exit", () => {
  try {
    connector?.dispose?.();
  } catch {
    /* ignore */
  }
});

console.log("[T3 Preload] bridge exposed (pull-based)");

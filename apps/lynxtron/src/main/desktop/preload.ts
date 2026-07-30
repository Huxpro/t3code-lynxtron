// T3 Code Lynxtron preload (Node host layer).
//
// After AR2 the connector lives in the main process (see mainConnectorHost.ts
// and src/shared/connectorProtocol.ts); product state reaches the renderer as
// sequenced push events. This preload keeps only the capabilities that stay
// preload-resident: app branding, small JSON preference persistence,
// clipboard, and native/external navigation. It owns no product state.
import { contextBridge } from "@lynx-js/lynxtron/context-bridge";
import { clipboard, shell } from "@lynx-js/lynxtron";
import type { DesktopAppBranding, DesktopAppStageLabel } from "@t3tools/contracts";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

import { resolveLynxtronPrefsPath } from "./prefsPath";

// P3-S1 capability probe (R3/R5): report whether preload shares main's JS
// realm (main plants a pid marker when T3_LYNXTRON_CAPABILITY_PROBE=1). A
// shared realm would have allowed the connector to reach the LynxWindow
// handle directly; the probe stays as regression evidence for the isolated
// realm that motivated the main-owned connector. Remove with the probe in
// main.ts.
if (process.env.T3_LYNXTRON_CAPABILITY_PROBE === "1") {
  setTimeout(() => {
    const mainPid = (globalThis as Record<string, unknown>).__t3CapabilityProbeMainPid;
    const sharedWindow = (globalThis as Record<string, unknown>).__t3CapabilityProbeWindow;
    console.log(
      `[capability-probe] preload pid=${process.pid} mainPidMarker=${String(mainPid)} sharedWindowHandle=${sharedWindow ? "yes" : "no"}`,
    );
    if (sharedWindow && typeof (sharedWindow as any).sendGlobalEvent === "function") {
      const delivered = (sharedWindow as any).sendGlobalEvent("t3-capability-probe", {
        from: "preload-via-shared-realm",
        sentAt: new Date().toISOString(),
      });
      console.log(`[capability-probe] preload sendGlobalEvent returned ${String(delivered)}`);
    }
  }, 6_000);
}

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

console.log("[T3 Preload] bridge exposed (capabilities only; connector is main-owned)");

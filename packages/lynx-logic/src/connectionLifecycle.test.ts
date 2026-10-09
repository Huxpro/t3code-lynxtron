import { describe, expect, it } from "@effect/vitest";

import { projectConnectionLifecycle } from "./connectionLifecycle.ts";

describe("connection lifecycle presentation", () => {
  it.each([
    ["idle", "idle", "Preparing T3 Code", true],
    ["starting-server", "starting", "Starting T3 Code", true],
    ["connecting", "connecting", "T3 Code: Connecting...", true],
    ["reconnecting", "reconnecting", "T3 Code: Reconnecting...", true],
    ["ready", "ready", "T3 Code: Connected", false],
    ["error", "error", "T3 Code: Connection failed", true],
    ["available", "idle", "T3 Code: Available", true],
    ["offline", "error", "T3 Code: Offline", true],
    ["connected", "ready", "T3 Code: Connected", false],
  ] as const)("projects %s without inventing another state", (source, phase, title, visible) => {
    expect(
      projectConnectionLifecycle({
        phase: source,
        targetLabel: "T3 Code",
        recoverySubject: "the local backend",
      }),
    ).toMatchObject({ phase, title, visible });
  });

  it.each([
    [
      "pairing",
      "Remote: Pairing expired",
      "Pair this device with the remote environment again from Connections.",
    ],
    [
      "authentication",
      "Remote: Access denied",
      "The remote environment rejected this client's session. Reconnect or pair again.",
    ],
    [
      "transport",
      "Remote: Unreachable",
      "Cannot reach the remote environment. Check the network and that it is running, then reconnect.",
    ],
    [
      "server-readiness",
      "Remote: Server not ready",
      "The remote environment is not running. Reconnect to start it again.",
    ],
    [
      "product-sync",
      "Remote: Sync failed",
      "Connected to the remote environment, but loading its state failed. Reconnect to resync.",
    ],
  ] as const)("names the %s failure layer and its recovery", (failureLayer, title, description) => {
    expect(
      projectConnectionLifecycle({
        phase: "error",
        targetLabel: "Remote",
        detail: "raw connector detail",
        recoverySubject: "the remote environment",
        failureLayer,
      }),
    ).toMatchObject({ phase: "error", title, description: `raw connector detail ${description}` });
  });

  it("keeps the generic failure copy when the layer is unknown", () => {
    expect(
      projectConnectionLifecycle({
        phase: "error",
        targetLabel: "T3 Code",
        detail: "Something odd.",
        recoverySubject: "the local backend",
        failureLayer: null,
      }),
    ).toMatchObject({ title: "T3 Code: Connection failed", description: "Something odd." });
  });

  it("preserves reconnect detail and disables duplicate retry", () => {
    expect(
      projectConnectionLifecycle({
        phase: "reconnecting",
        targetLabel: "Remote environment",
        detail: "Socket closed.",
        recoverySubject: "this environment",
      }),
    ).toEqual({
      phase: "reconnecting",
      visible: true,
      tone: "warning",
      title: "Remote environment: Failed to connect. Reconnecting...",
      description: "Socket closed.",
      recovery: {
        primaryLabel: "Reconnecting...",
        primaryDisabled: true,
        secondaryLabel: "Connections",
      },
    });
  });

  it("keeps an actionable failure visible until canonical ready state arrives", () => {
    const failed = projectConnectionLifecycle({
      phase: "error",
      targetLabel: "T3 Code",
      detail: "Server exited unexpectedly.",
      recoverySubject: "the local backend",
    });
    const ready = projectConnectionLifecycle({
      phase: "ready",
      targetLabel: "T3 Code",
      recoverySubject: "the local backend",
    });

    expect(failed.recovery).toMatchObject({ primaryLabel: "Reconnect", primaryDisabled: false });
    expect(failed.description).toBe("Server exited unexpectedly.");
    expect(ready.visible).toBe(false);
    expect(ready.recovery).toBeNull();
  });
});

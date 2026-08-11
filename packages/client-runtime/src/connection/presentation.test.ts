import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Option from "effect/Option";

import { BearerConnectionProfile, type ConnectionCatalogEntry } from "./catalog.ts";
import {
  BearerConnectionTarget,
  ConnectionTransientError,
  type SupervisorConnectionState,
} from "./model.ts";
import {
  connectionCatalogDisplayUrl,
  connectionPhaseMessage,
  connectionStatusText,
  connectionStatusTitle,
  presentEnvironmentConnection,
  presentConnectionState,
  projectConnectionLifecycle,
} from "./presentation.ts";

const TARGET = new BearerConnectionTarget({
  environmentId: EnvironmentId.make("environment-1"),
  label: "Remote environment",
  connectionId: "connection-1",
});

const ENTRY: ConnectionCatalogEntry = {
  target: TARGET,
  profile: Option.some(
    new BearerConnectionProfile({
      connectionId: TARGET.connectionId,
      environmentId: TARGET.environmentId,
      label: TARGET.label,
      httpBaseUrl: "https://environment.example.test",
      wsBaseUrl: "wss://environment.example.test",
    }),
  ),
};

function supervisorState(overrides: Partial<SupervisorConnectionState>): SupervisorConnectionState {
  return {
    desired: true,
    network: "online",
    phase: "connecting",
    stage: "preparing",
    attempt: 1,
    generation: 0,
    lastFailure: null,
    retryAt: null,
    ...overrides,
  };
}

describe("connection presentation", () => {
  it("preserves profile display information without exposing credentials", () => {
    expect(connectionCatalogDisplayUrl(ENTRY)).toBe("https://environment.example.test");
  });

  it("distinguishes initial connection, reconnect, and retry errors", () => {
    expect(presentConnectionState(supervisorState({ phase: "connecting", attempt: 1 }))).toEqual({
      phase: "connecting",
      error: null,
      traceId: null,
    });
    expect(
      presentConnectionState(
        supervisorState({
          phase: "connecting",
          attempt: 2,
          lastFailure: new ConnectionTransientError({
            reason: "transport",
            detail: "Socket closed.",
            traceId: "trace-previous",
          }),
        }),
      ),
    ).toEqual({
      phase: "reconnecting",
      error: "Socket closed.",
      traceId: "trace-previous",
    });
    expect(
      presentConnectionState(
        supervisorState({
          phase: "backoff",
          attempt: 2,
          retryAt: 1,
          lastFailure: new ConnectionTransientError({
            reason: "transport",
            detail: "Disconnected.",
            traceId: "trace-1",
          }),
        }),
      ),
    ).toEqual({
      phase: "reconnecting",
      error: "Disconnected.",
      traceId: "trace-1",
    });
  });

  it("preserves the latest failure while the next attempt is active", () => {
    expect(
      presentEnvironmentConnection(
        supervisorState({
          phase: "connecting",
          stage: "opening",
          attempt: 2,
          lastFailure: new ConnectionTransientError({
            reason: "transport",
            detail: "Relay connection timed out.",
            traceId: "trace-retry",
          }),
        }),
      ),
    ).toEqual({
      phase: "reconnecting",
      error: "Relay connection timed out.",
      traceId: "trace-retry",
    });
  });

  it("gives offline status precedence in global messaging", () => {
    expect(connectionPhaseMessage("connected", TARGET.label, "offline")).toBe("You are offline");
  });

  it("combines reconnect progress with the latest failure", () => {
    const connection = {
      phase: "reconnecting",
      error: "Relay request timed out.",
      traceId: "trace-retry",
    } as const;
    expect(connectionStatusText(connection)).toBe(
      "Failed to connect. Reconnecting... Reason: Relay request timed out.",
    );
    expect(connectionStatusTitle(connection)).toBe("Failed to connect. Reconnecting...");
  });

  it("presents the supervisor's offline state without consulting shell state", () => {
    expect(
      presentEnvironmentConnection(
        supervisorState({
          network: "offline",
          phase: "offline",
          stage: null,
        }),
      ),
    ).toEqual({
      phase: "offline",
      error: null,
      traceId: null,
    });
  });

  it("presents a connected supervisor snapshot as connected", () => {
    expect(
      presentEnvironmentConnection(
        supervisorState({
          phase: "connected",
          stage: null,
          generation: 1,
        }),
      ),
    ).toEqual({
      phase: "connected",
      error: null,
      traceId: null,
    });
  });

  it("preserves an explicitly available environment while offline", () => {
    expect(
      presentEnvironmentConnection(
        supervisorState({
          desired: false,
          network: "offline",
          phase: "available",
          stage: null,
          attempt: 0,
        }),
      ),
    ).toEqual({
      phase: "available",
      error: null,
      traceId: null,
    });
  });
});

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

import type { ServerConfig } from "@t3tools/contracts";
import * as Option from "effect/Option";

import type { ConnectionCatalogEntry } from "./catalog.ts";
import type { NetworkStatus, SupervisorConnectionState } from "./model.ts";

export type EnvironmentConnectionPhase =
  | "available"
  | "offline"
  | "connecting"
  | "reconnecting"
  | "connected"
  | "error";

export interface EnvironmentConnectionPresentation {
  readonly phase: EnvironmentConnectionPhase;
  readonly error: string | null;
  readonly traceId: string | null;
}

export interface EnvironmentPresentation {
  readonly entry: ConnectionCatalogEntry;
  readonly connection: EnvironmentConnectionPresentation;
  readonly serverConfig: ServerConfig | null;
}

export type ConnectionLifecycleSourcePhase =
  | EnvironmentConnectionPhase
  | "idle"
  | "starting-server"
  | "ready";

export interface ConnectionLifecycleRecovery {
  readonly primaryLabel: "Reconnect" | "Reconnecting...";
  readonly primaryDisabled: boolean;
  readonly secondaryLabel: "Connections";
}

export interface ConnectionLifecyclePresentation {
  readonly phase: "idle" | "starting" | "connecting" | "reconnecting" | "ready" | "error";
  readonly visible: boolean;
  readonly tone: "default" | "error" | "warning";
  readonly title: string;
  readonly description: string | null;
  readonly recovery: ConnectionLifecycleRecovery | null;
}

/**
 * Renderer-neutral lifecycle copy and recovery contract shared by Web's
 * environment banner and the Lynxtron local-connector banner.
 */
/** The layer a connection failure belongs to, when the client can tell. */
export type ConnectionFailureLayer =
  | "pairing"
  | "authentication"
  | "transport"
  | "server-readiness"
  | "product-sync";

const FAILURE_LAYER_PRESENTATION: Record<
  ConnectionFailureLayer,
  { readonly title: string; readonly recovery: (subject: string) => string }
> = {
  pairing: {
    title: "Pairing expired",
    recovery: (subject) => `Pair this device with ${subject} again from Connections.`,
  },
  authentication: {
    title: "Access denied",
    recovery: (subject) => `${subject} rejected this client's session. Reconnect or pair again.`,
  },
  transport: {
    title: "Unreachable",
    recovery: (subject) =>
      `Cannot reach ${subject}. Check the network and that it is running, then reconnect.`,
  },
  "server-readiness": {
    title: "Server not ready",
    recovery: (subject) => `${subject} did not finish starting. Reconnect to try again.`,
  },
  "product-sync": {
    title: "Sync failed",
    recovery: (subject) =>
      `Connected to ${subject}, but loading its state failed. Reconnect to resync.`,
  },
};

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export function projectConnectionLifecycle(input: {
  readonly phase: ConnectionLifecycleSourcePhase;
  readonly targetLabel: string;
  readonly detail?: string | null;
  readonly recoverySubject: string;
  readonly failureLayer?: ConnectionFailureLayer | null;
}): ConnectionLifecyclePresentation {
  const detail = input.detail?.trim() || null;
  const recoveryDescription = `Reconnect ${input.recoverySubject} before sending messages or running actions.`;
  const recovery = (disabled: boolean): ConnectionLifecycleRecovery => ({
    primaryLabel: disabled ? "Reconnecting..." : "Reconnect",
    primaryDisabled: disabled,
    secondaryLabel: "Connections",
  });

  switch (input.phase) {
    case "connected":
    case "ready":
      return {
        phase: "ready",
        visible: false,
        tone: "default",
        title: `${input.targetLabel}: Connected`,
        description: null,
        recovery: null,
      };
    case "idle":
      return {
        phase: "idle",
        visible: true,
        tone: "default",
        title: `Preparing ${input.targetLabel}`,
        description: detail ?? "Waiting for the connection to start.",
        recovery: null,
      };
    case "starting-server":
      return {
        phase: "starting",
        visible: true,
        tone: "default",
        title: `Starting ${input.targetLabel}`,
        description: detail ?? "Launching the local backend.",
        recovery: null,
      };
    case "connecting":
      return {
        phase: "connecting",
        visible: true,
        tone: "warning",
        title: `${input.targetLabel}: Connecting...`,
        description: detail ?? recoveryDescription,
        recovery: recovery(true),
      };
    case "reconnecting":
      return {
        phase: "reconnecting",
        visible: true,
        tone: "warning",
        title: detail
          ? `${input.targetLabel}: Failed to connect. Reconnecting...`
          : `${input.targetLabel}: Reconnecting...`,
        description: detail ?? recoveryDescription,
        recovery: recovery(true),
      };
    case "available":
      return {
        phase: "idle",
        visible: true,
        tone: "warning",
        title: `${input.targetLabel}: Available`,
        description: detail ?? recoveryDescription,
        recovery: recovery(false),
      };
    case "offline":
      return {
        phase: "error",
        visible: true,
        tone: "warning",
        title: `${input.targetLabel}: Offline`,
        description: detail ?? recoveryDescription,
        recovery: recovery(false),
      };
    case "error": {
      const layer = input.failureLayer ? FAILURE_LAYER_PRESENTATION[input.failureLayer] : null;
      return {
        phase: "error",
        visible: true,
        tone: "error",
        title: `${input.targetLabel}: ${layer?.title ?? "Connection failed"}`,
        description: layer
          ? capitalize(layer.recovery(input.recoverySubject))
          : (detail ?? recoveryDescription),
        recovery: recovery(false),
      };
    }
  }
}

export function presentConnectionState(
  state: SupervisorConnectionState,
): EnvironmentConnectionPresentation {
  switch (state.phase) {
    case "available":
      return { phase: "available", error: null, traceId: null };
    case "offline":
      return { phase: "offline", error: null, traceId: null };
    case "connecting":
      return {
        phase: state.attempt <= 1 && state.lastFailure === null ? "connecting" : "reconnecting",
        error: state.lastFailure?.message ?? null,
        traceId: state.lastFailure?.traceId ?? null,
      };
    case "connected":
      return { phase: "connected", error: null, traceId: null };
    case "backoff":
      return {
        phase: "reconnecting",
        error: state.lastFailure?.message ?? null,
        traceId: state.lastFailure?.traceId ?? null,
      };
    case "blocked":
      return {
        phase: "error",
        error: state.lastFailure?.message ?? null,
        traceId: state.lastFailure?.traceId ?? null,
      };
  }
}

export function connectionStatusText(connection: EnvironmentConnectionPresentation): string {
  switch (connection.phase) {
    case "available":
      return "Available";
    case "offline":
      return "Offline";
    case "connecting":
      return "Connecting...";
    case "reconnecting":
      return connection.error
        ? `Failed to connect. Reconnecting... Reason: ${connection.error}`
        : "Reconnecting...";
    case "connected":
      return "Connected";
    case "error":
      return connection.error
        ? `Connection failed. Reason: ${connection.error}`
        : "Connection failed";
  }
}

export function connectionStatusTitle(connection: EnvironmentConnectionPresentation): string {
  if (connection.phase === "reconnecting" && connection.error) {
    return "Failed to connect. Reconnecting...";
  }
  return connectionStatusText({ ...connection, error: null });
}

export function presentEnvironmentConnection(
  state: SupervisorConnectionState,
): EnvironmentConnectionPresentation {
  return presentConnectionState(state);
}

export function connectionCatalogDisplayUrl(entry: ConnectionCatalogEntry): string | null {
  switch (entry.target._tag) {
    case "PrimaryConnectionTarget":
      return entry.target.httpBaseUrl;
    case "RelayConnectionTarget":
      return null;
    case "BearerConnectionTarget":
      return Option.isSome(entry.profile) && entry.profile.value._tag === "BearerConnectionProfile"
        ? entry.profile.value.httpBaseUrl
        : null;
    case "SshConnectionTarget":
      return Option.isSome(entry.profile) && entry.profile.value._tag === "SshConnectionProfile"
        ? `${entry.profile.value.target.username}@${entry.profile.value.target.hostname}`
        : null;
  }
}

export function connectionPhaseMessage(
  phase: EnvironmentConnectionPhase,
  label: string,
  networkStatus: NetworkStatus,
): string {
  if (networkStatus === "offline" || phase === "offline") {
    return "You are offline";
  }
  switch (phase) {
    case "available":
      return "Available";
    case "connecting":
      return `Connecting to ${label}...`;
    case "reconnecting":
      return `Reconnecting to ${label}...`;
    case "connected":
      return "Connected";
    case "error":
      return "Connection failed";
  }
}

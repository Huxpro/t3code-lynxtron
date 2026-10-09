import type { EnvironmentConnectionPhase } from "@t3tools/client-runtime/connection";

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
    recovery: (subject) => `${subject} is not running. Reconnect to start it again.`,
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
        // The layer names the recovery; the detail keeps the actual reason.
        description: layer
          ? [detail, capitalize(layer.recovery(input.recoverySubject))].filter(Boolean).join(" ")
          : (detail ?? recoveryDescription),
        recovery: recovery(false),
      };
    }
  }
}

export type LocalConnectorLifecycleStatus =
  | "idle"
  | "starting-server"
  | "connecting"
  | "ready"
  | "error";

export interface ConnectorLifecyclePresentation {
  readonly visible: boolean;
  readonly tone: "neutral" | "warning" | "error";
  readonly title: string;
  readonly description: string | null;
  readonly actionLabel: string | null;
  readonly action: "connections" | "retry" | null;
}

export function presentConnectorLifecycle(
  status: LocalConnectorLifecycleStatus,
  detail?: string,
): ConnectorLifecyclePresentation {
  switch (status) {
    case "idle":
      return {
        visible: true,
        tone: "neutral",
        title: "Starting T3 Code...",
        description: "Preparing the local environment.",
        actionLabel: null,
        action: null,
      };
    case "starting-server":
      return {
        visible: true,
        tone: "neutral",
        title: "Starting local server...",
        description: detail?.trim() || "Preparing the local environment.",
        actionLabel: null,
        action: null,
      };
    case "connecting":
      return {
        visible: true,
        tone: "warning",
        title: "Connecting to local server...",
        description: detail?.trim() || "Waiting for the workspace to become available.",
        actionLabel: null,
        action: null,
      };
    case "error":
      return {
        visible: true,
        tone: "error",
        title: "Couldn’t connect to the local server",
        description: detail?.trim() || "Your work is safe. Retry to reconnect this workspace.",
        actionLabel: "Retry",
        action: "retry",
      };
    case "ready":
      return {
        visible: false,
        tone: "neutral",
        title: "Connected",
        description: null,
        actionLabel: null,
        action: null,
      };
  }
}

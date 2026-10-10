// The shell payload the Lynx UI reduces: the sidebar's threads in display
// order and the archived threads in theirs. The main connector builds it from
// its own subscription and the renderer builds it from upstream's atoms; both
// call this so the two sources cannot disagree about filtering or order.
import { sortThreads } from "@t3tools/client-runtime/state/thread-sort";
import type { OrchestrationProjectShell, OrchestrationThreadShell } from "@t3tools/contracts";

import type { ConnectorShellPayload } from "./connectorProtocol.ts";

export interface ConnectorShellInput {
  readonly projects: ReadonlyArray<OrchestrationProjectShell>;
  /** The shell stream's threads. Archived ones are dropped from the sidebar list. */
  readonly threads: ReadonlyArray<OrchestrationThreadShell>;
  /** The archived snapshot's threads, which the shell stream does not carry. */
  readonly archivedThreads: ReadonlyArray<OrchestrationThreadShell>;
  /** Threads the source is already deleting and no longer shows. */
  readonly isHidden?: (thread: OrchestrationThreadShell) => boolean;
  /** Local values the source shows before the server confirms them. */
  readonly overlay?: (thread: OrchestrationThreadShell) => OrchestrationThreadShell;
}

export function projectConnectorShell(input: ConnectorShellInput): ConnectorShellPayload {
  const { isHidden, overlay } = input;
  const visible = sortThreads(
    input.threads.filter((thread) => !thread.archivedAt && !(isHidden?.(thread) ?? false)),
    "updated_at",
  );
  return {
    projects: input.projects,
    threads: overlay ? visible.map(overlay) : visible,
    archivedThreads: input.archivedThreads
      .slice()
      .sort((a, b) => ((b.archivedAt ?? "") > (a.archivedAt ?? "") ? 1 : -1)),
  };
}

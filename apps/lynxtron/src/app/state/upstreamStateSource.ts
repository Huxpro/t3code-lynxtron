// Feeds the Lynx client's server config and shell from upstream's atoms
// instead of the main connector's events. It runs only when the host launches
// with `T3_LYNXTRON_UPSTREAM_STATE=1`; without it every connector payload is
// applied as it arrives and nothing here subscribes to anything.
//
// Upstream owns a domain while its connection is up and it has the data the
// connector's payload carries. Connector payloads for an owned domain are held
// instead of applied, and the latest one is applied if upstream lets go, so a
// dropped upstream connection hands the domain back to the connector.
import type { ServerConfig } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import { projectConnectorShell } from "../../shared/connectorShell.ts";
import type { ConnectorShellPayload } from "../../shared/connectorProtocol.ts";
import {
  readUpstreamRuntimeFlags,
  type UpstreamPrimaryState,
  watchUpstreamPrimary,
} from "./upstreamPrimary.ts";

export type UpstreamStateDomain = "config" | "shell";

export interface UpstreamStatePayloads {
  readonly config: ServerConfig | null;
  readonly shell: ConnectorShellPayload | null;
}

/**
 * The connector-shaped payload for each domain upstream can supply right now,
 * or null where it cannot. The shell needs the archived snapshot as well as
 * the live shell: a payload without it would empty the archive list.
 */
export function upstreamStatePayloads(
  state: Pick<UpstreamPrimaryState, "connection" | "shell" | "config" | "archived">,
): UpstreamStatePayloads {
  const connection =
    state.connection === null ? null : Option.getOrNull(AsyncResult.value(state.connection));
  if (connection?.phase !== "connected") return { config: null, shell: null };
  const snapshot = state.shell?.status === "live" ? Option.getOrNull(state.shell.snapshot) : null;
  return {
    config: state.config,
    shell:
      snapshot === null || state.archived === null
        ? null
        : projectConnectorShell({
            projects: snapshot.projects,
            threads: snapshot.threads,
            archivedThreads: state.archived.threads,
          }),
  };
}

/**
 * Decides, per domain, whether a connector payload is applied or held.
 * `fromUpstream` with a payload takes the domain; with null it gives the
 * domain back and applies the connector payload that was held meanwhile.
 */
export function createUpstreamStateRouter() {
  const owned = new Set<UpstreamStateDomain>();
  const held = new Map<UpstreamStateDomain, () => void>();
  return {
    fromConnector(domain: UpstreamStateDomain, apply: () => void): void {
      if (owned.has(domain)) held.set(domain, apply);
      else apply();
    },
    fromUpstream<T>(domain: UpstreamStateDomain, payload: T | null, apply: (payload: T) => void) {
      if (payload !== null) {
        owned.add(domain);
        apply(payload);
        return;
      }
      if (!owned.delete(domain)) return;
      const replay = held.get(domain);
      held.delete(domain);
      replay?.();
    },
  };
}

const router = createUpstreamStateRouter();

/** Applies a connector payload for `domain` unless upstream currently owns it. */
export const applyFromConnector = router.fromConnector;

export interface UpstreamStateSink {
  readonly applyConfig: (config: ServerConfig) => void;
  readonly applyShell: (shell: ConnectorShellPayload) => void;
}

let started = false;

/** Starts the upstream source once. Does nothing unless the host turned it on. */
export function startUpstreamStateSource(sink: UpstreamStateSink): void {
  if (started) return;
  if (readUpstreamRuntimeFlags().upstreamState !== true) return;
  started = true;

  // The watcher fires for every connection and catalog change; a domain is
  // projected and applied again only when what it is built from changed.
  let previous: Pick<UpstreamPrimaryState, "connection" | "shell" | "config" | "archived"> | null =
    null;
  watchUpstreamPrimary((state) => {
    const connectionChanged = previous?.connection !== state.connection;
    const configChanged = connectionChanged || previous?.config !== state.config;
    const shellChanged =
      connectionChanged || previous?.shell !== state.shell || previous?.archived !== state.archived;
    previous = state;
    if (!configChanged && !shellChanged) return;
    const payloads = upstreamStatePayloads(state);
    if (configChanged) router.fromUpstream("config", payloads.config, sink.applyConfig);
    if (shellChanged) router.fromUpstream("shell", payloads.shell, sink.applyShell);
  });
}

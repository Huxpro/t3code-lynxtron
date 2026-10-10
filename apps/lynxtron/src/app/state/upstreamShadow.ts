// Shadow mode: runs upstream's connection runtime next to the Lynx client's own
// state and publishes what it sees on `globalThis.__T3_UPSTREAM_SHADOW__`,
// with a comparison of the two under `compare`, for DevTool to read. Nothing
// in the UI reads it. It runs only when the host launches with
// `T3_LYNXTRON_UPSTREAM_SHADOW=1`.
import type { SupervisorConnectionState } from "@t3tools/client-runtime/connection";
import type { EnvironmentShellState } from "@t3tools/client-runtime/state/shell";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";

import { appAtomRegistry } from "./atomRegistry.ts";
import type { T3ClientState } from "./t3Client.ts";
import { compareServerConfig, compareShell, type DomainComparison } from "./upstreamCompare.ts";
import {
  primaryEnvironmentId,
  readUpstreamRuntimeFlags,
  type UpstreamPrimaryState,
  watchUpstreamPrimary,
} from "./upstreamPrimary.ts";
import { upstreamStatePayloads } from "./upstreamStateSource.ts";

export interface UpstreamShadowSummary {
  /** The connection phase, or what the runtime is waiting for before it has one. */
  readonly phase: SupervisorConnectionState["phase"] | "starting" | "no-environment" | "failed";
  readonly shell: EnvironmentShellState["status"] | null;
  readonly environmentId: string | null;
  readonly projects: number | null;
  readonly threads: number | null;
  readonly threadIds: ReadonlyArray<string>;
  readonly error: string | null;
  readonly updatedAt: string;
}

export type UpstreamShadowInput = Pick<UpstreamPrimaryState, "catalog" | "connection" | "shell">;

export interface UpstreamShadowComparison {
  readonly config: DomainComparison;
  readonly shell: DomainComparison;
}

type ComparedClientState = Pick<
  T3ClientState,
  "status" | "serverConfig" | "providers" | "settings" | "projects" | "threads" | "archivedThreads"
>;

/** How each domain upstream can supply compares with the Lynx client's state. */
export function compareUpstreamState(
  state: Pick<UpstreamPrimaryState, "connection" | "shell" | "config" | "archived">,
  client: ComparedClientState,
): UpstreamShadowComparison {
  const payloads = upstreamStatePayloads(state);
  return {
    config: compareServerConfig(payloads.config, client),
    shell: compareShell(payloads.shell, client),
  };
}

function failureText(result: AsyncResult.AsyncResult<unknown, unknown> | null): string | null {
  if (result === null) return null;
  return Option.getOrNull(Option.map(AsyncResult.cause(result), Cause.pretty));
}

export function summarizeUpstreamShadow(
  input: UpstreamShadowInput,
  now: Date,
): UpstreamShadowSummary {
  const environmentId = primaryEnvironmentId(input.catalog);
  const catalog = Option.getOrNull(AsyncResult.value(input.catalog));
  const connection =
    input.connection === null ? null : Option.getOrNull(AsyncResult.value(input.connection));
  const snapshot = input.shell === null ? null : Option.getOrNull(input.shell.snapshot);
  const runtimeFailure = failureText(input.catalog) ?? failureText(input.connection);
  const phase =
    runtimeFailure !== null
      ? "failed"
      : catalog === null || !catalog.isReady
        ? "starting"
        : environmentId === null || connection === null
          ? "no-environment"
          : connection.phase;
  return {
    phase,
    shell: input.shell?.status ?? null,
    environmentId,
    projects: snapshot === null ? null : snapshot.projects.length,
    threads: snapshot === null ? null : snapshot.threads.length,
    threadIds: snapshot === null ? [] : snapshot.threads.map((thread) => String(thread.id)).sort(),
    error:
      runtimeFailure ??
      (input.shell === null ? null : Option.getOrNull(input.shell.error)) ??
      connection?.lastFailure?.detail ??
      null,
    updatedAt: now.toISOString(),
  };
}

let started = false;

/**
 * Starts the shadow once. Does nothing unless the host turned it on.
 * `clientStateAtom` is the Lynx client's own state, which upstream's is
 * compared with.
 */
export function startUpstreamShadow(clientStateAtom: Atom.Atom<T3ClientState>): void {
  if (started) return;
  if (readUpstreamRuntimeFlags().upstreamShadow !== true) return;
  started = true;

  const target = globalThis as {
    __T3_UPSTREAM_SHADOW__?: UpstreamShadowSummary & { readonly compare: UpstreamShadowComparison };
  };
  let upstream: UpstreamPrimaryState | null = null;
  let client = appAtomRegistry.get(clientStateAtom);
  const publish = () => {
    if (upstream === null) return;
    target.__T3_UPSTREAM_SHADOW__ = {
      ...summarizeUpstreamShadow(upstream, new Date()),
      compare: compareUpstreamState(upstream, client),
    };
  };

  watchUpstreamPrimary((state) => {
    upstream = state;
    publish();
  });
  // The client state changes with every streamed token; only the fields the
  // comparison reads are worth a new one.
  appAtomRegistry.subscribe(clientStateAtom, (next) => {
    const previous = client;
    client = next;
    if (
      previous.status !== next.status ||
      previous.serverConfig !== next.serverConfig ||
      previous.providers !== next.providers ||
      previous.settings !== next.settings ||
      previous.projects !== next.projects ||
      previous.threads !== next.threads ||
      previous.archivedThreads !== next.archivedThreads
    ) {
      publish();
    }
  });
}

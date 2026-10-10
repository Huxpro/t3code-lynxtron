// A diagnostic summary of what upstream's connection runtime holds for the
// primary environment, published on `globalThis.__T3_UPSTREAM_SHADOW__` for
// DevTool and the gates to read. Nothing in the UI reads it. It runs only when
// the host launches with `T3_LYNXTRON_UPSTREAM_SHADOW=1`.
import type { SupervisorConnectionState } from "@t3tools/client-runtime/connection";
import type { EnvironmentShellState } from "@t3tools/client-runtime/state/shell";
import { threadHasOlderTurns } from "@t3tools/client-runtime/state/threads";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";

import type { T3ClientState } from "./t3Client.ts";
import {
  primaryEnvironmentId,
  readUpstreamRuntimeFlags,
  type UpstreamPrimaryState,
  watchUpstreamPrimary,
} from "./upstreamPrimary.ts";
import { type UpstreamSelectedState, watchUpstreamSelected } from "./upstreamSelected.ts";

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

/** What upstream holds for the selection, in a line. */
export interface UpstreamShadowSelected {
  readonly threadId: string | null;
  readonly threadStatus: NonNullable<UpstreamSelectedState["thread"]>["status"] | null;
  readonly threadMessages: number | null;
  /** Older turns upstream has not loaded yet; the thread is not shown until it has. */
  readonly threadHasOlderTurns: boolean;
  readonly threadError: string | null;
  /** How many terminals the server lists for the thread, or null before it has said. */
  readonly terminals: number | null;
  readonly vcsCwd: string | null;
}

export function summarizeUpstreamSelected(state: UpstreamSelectedState): UpstreamShadowSelected {
  const thread = state.thread;
  const data = thread === null ? null : Option.getOrNull(thread.data);
  return {
    threadId: state.threadId,
    threadStatus: thread?.status ?? null,
    threadMessages: data === null ? null : data.messages.length,
    threadHasOlderTurns: thread !== null && threadHasOlderTurns(thread),
    threadError: thread === null ? null : Option.getOrNull(thread.error),
    terminals: state.terminals?.length ?? null,
    vcsCwd: state.vcsCwd,
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
 * `clientStateAtom` is the Lynx client's own state, which says what is
 * selected.
 */
export function startUpstreamShadow(clientStateAtom: Atom.Atom<T3ClientState>): void {
  if (started) return;
  if (readUpstreamRuntimeFlags().upstreamShadow !== true) return;
  started = true;

  const target = globalThis as {
    __T3_UPSTREAM_SHADOW__?: UpstreamShadowSummary & {
      readonly selected: UpstreamShadowSelected | null;
    };
  };
  let selected: UpstreamSelectedState | null = null;
  watchUpstreamPrimary((state) => {
    target.__T3_UPSTREAM_SHADOW__ = {
      ...summarizeUpstreamShadow(state, new Date()),
      get selected() {
        return selected === null ? null : summarizeUpstreamSelected(selected);
      },
    };
  });
  watchUpstreamSelected(clientStateAtom, (state) => {
    selected = state;
  });
}

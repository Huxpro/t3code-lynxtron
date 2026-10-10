// Shadow mode: runs upstream's connection runtime next to the Lynx client's own
// state and publishes what it sees on `globalThis.__T3_UPSTREAM_SHADOW__`, so
// the two can be compared from DevTool. Nothing in the UI reads it. It runs
// only when the host launches with `T3_LYNXTRON_UPSTREAM_SHADOW=1`.
import type { SupervisorConnectionState } from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentShellState } from "@t3tools/client-runtime/state/shell";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import { appAtomRegistry } from "./atomRegistry.ts";
import {
  upstreamEnvironmentCatalog,
  upstreamEnvironmentShell,
} from "./upstreamConnectionRuntime.ts";

declare const NativeModules:
  | {
      readonly nodejs?: {
        readonly exposed?: {
          readonly getRuntimeFlags?: () => { readonly upstreamShadow?: boolean } | undefined;
        };
      };
    }
  | undefined;

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

export interface UpstreamShadowInput {
  readonly catalog: AsyncResult.AsyncResult<EnvironmentCatalogState, unknown>;
  readonly connection: AsyncResult.AsyncResult<SupervisorConnectionState, unknown> | null;
  readonly shell: EnvironmentShellState | null;
}

/** The primary local environment in a catalog, if the host has registered it. */
export function primaryEnvironmentId(
  catalog: AsyncResult.AsyncResult<EnvironmentCatalogState, unknown>,
) {
  const state = Option.getOrNull(AsyncResult.value(catalog));
  if (state === null) return null;
  for (const [environmentId, entry] of state.entries) {
    if (entry.target._tag === "PrimaryConnectionTarget") return environmentId;
  }
  return null;
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

/** Starts the shadow once. Does nothing unless the host turned it on. */
export function startUpstreamShadow(): void {
  if (started) return;
  const flags =
    typeof NativeModules === "undefined"
      ? undefined
      : NativeModules.nodejs?.exposed?.getRuntimeFlags?.();
  if (flags?.upstreamShadow !== true) return;
  started = true;

  const target = globalThis as { __T3_UPSTREAM_SHADOW__?: UpstreamShadowSummary };
  let input: UpstreamShadowInput = {
    catalog: appAtomRegistry.get(upstreamEnvironmentCatalog.catalogAtom),
    connection: null,
    shell: null,
  };
  let followed: string | null = null;
  let stopFollowing = () => {};
  const publish = (patch: Partial<UpstreamShadowInput>) => {
    input = { ...input, ...patch };
    target.__T3_UPSTREAM_SHADOW__ = summarizeUpstreamShadow(input, new Date());
  };

  appAtomRegistry.subscribe(
    upstreamEnvironmentCatalog.catalogAtom,
    (catalog) => {
      const environmentId = primaryEnvironmentId(catalog);
      if (environmentId === followed) {
        publish({ catalog });
        return;
      }
      stopFollowing();
      followed = environmentId;
      publish({ catalog, connection: null, shell: null });
      if (environmentId === null) {
        stopFollowing = () => {};
        return;
      }
      const stopConnection = appAtomRegistry.subscribe(
        upstreamEnvironmentCatalog.stateAtom(environmentId),
        (connection) => publish({ connection }),
        { immediate: true },
      );
      const stopShell = appAtomRegistry.subscribe(
        upstreamEnvironmentShell.stateValueAtom(environmentId),
        (shell) => publish({ shell }),
        { immediate: true },
      );
      stopFollowing = () => {
        stopConnection();
        stopShell();
      };
    },
    { immediate: true },
  );
}

// What upstream's atoms hold for the primary environment, followed once and
// handed to whoever watches: the shadow that reports it and the state source
// that feeds it to the Lynx client. Nothing is read until the first watcher.
import type { SupervisorConnectionState } from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import type { EnvironmentShellState } from "@t3tools/client-runtime/state/shell";
import type {
  AuthAccessSnapshot,
  AuthAccessStreamEvent,
  OrchestrationShellSnapshot,
  ServerConfig,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";

import { appAtomRegistry } from "./atomRegistry.ts";
import {
  upstreamAuthEnvironment,
  upstreamEnvironmentCatalog,
  upstreamEnvironmentShell,
  upstreamOrchestrationEnvironment,
  upstreamServerEnvironment,
} from "./upstreamConnectionRuntime.ts";

export interface UpstreamRuntimeFlags {
  /** Publish what upstream's atoms hold, and how it compares, for DevTool. */
  readonly upstreamShadow?: boolean;
  /**
   * Feed server config, shell, the selected thread, its terminals and its VCS
   * status to the Lynx client from upstream's atoms.
   */
  readonly upstreamState?: boolean;
}

declare const NativeModules:
  | {
      readonly nodejs?: {
        readonly exposed?: {
          readonly getRuntimeFlags?: () => UpstreamRuntimeFlags | undefined;
        };
      };
    }
  | undefined;

/** The launch switches the host set, or none outside the Lynx background thread. */
export function readUpstreamRuntimeFlags(): UpstreamRuntimeFlags {
  const flags =
    typeof NativeModules === "undefined"
      ? undefined
      : NativeModules.nodejs?.exposed?.getRuntimeFlags?.();
  return flags ?? {};
}

export interface UpstreamPrimaryState {
  readonly catalog: AsyncResult.AsyncResult<EnvironmentCatalogState, unknown>;
  readonly connection: AsyncResult.AsyncResult<SupervisorConnectionState, unknown> | null;
  readonly shell: EnvironmentShellState | null;
  /** The current server config: the session's first one until the stream is live. */
  readonly config: ServerConfig | null;
  /** The archived threads, which the shell stream does not carry. */
  readonly archived: OrchestrationShellSnapshot | null;
  /** The pairing links and client sessions, or null before the server has said. */
  readonly access: AuthAccessSnapshot | null;
}

/** The snapshot upstream's access stream holds, which it delivers whole each time. */
export function authAccessSnapshot(
  result: AsyncResult.AsyncResult<AuthAccessStreamEvent, unknown>,
): AuthAccessSnapshot | null {
  const event = Option.getOrNull(AsyncResult.value(result));
  return event?.type === "snapshot" ? event.payload : null;
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

type Watcher = (state: UpstreamPrimaryState) => void;

const watchers = new Set<Watcher>();
let current: UpstreamPrimaryState | null = null;
let following = false;

function follow(): void {
  let followed: string | null = null;
  let stopFollowing = () => {};
  const publish = (patch: Partial<UpstreamPrimaryState>) => {
    const base = current ?? {
      catalog: AsyncResult.initial(),
      connection: null,
      shell: null,
      config: null,
      archived: null,
      access: null,
    };
    const next = { ...base, ...patch };
    current = next;
    for (const watcher of watchers) watcher(next);
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
      publish({
        catalog,
        connection: null,
        shell: null,
        config: null,
        archived: null,
        access: null,
      });
      if (environmentId === null) {
        stopFollowing = () => {};
        return;
      }
      const archivedAtom = upstreamOrchestrationEnvironment.archivedShellSnapshot({
        environmentId,
        input: {},
      });
      let shellSnapshot: OrchestrationShellSnapshot | null = null;
      const stops = [
        appAtomRegistry.subscribe(
          upstreamEnvironmentCatalog.stateAtom(environmentId),
          (connection) => publish({ connection }),
          { immediate: true },
        ),
        appAtomRegistry.subscribe(
          upstreamServerEnvironment.configValueAtom(environmentId),
          (config) => publish({ config }),
          { immediate: true },
        ),
        appAtomRegistry.subscribe(
          archivedAtom,
          (archived) => publish({ archived: Option.getOrNull(AsyncResult.value(archived)) }),
          { immediate: true },
        ),
        appAtomRegistry.subscribe(
          upstreamAuthEnvironment.accessChanges({ environmentId, input: null }),
          (access) => publish({ access: authAccessSnapshot(access) }),
          { immediate: true },
        ),
        appAtomRegistry.subscribe(
          upstreamEnvironmentShell.stateValueAtom(environmentId),
          (shell) => {
            // Archiving, unarchiving and deleting reach the shell stream as
            // plain upserts and removes, so any shell change may have changed
            // the archived set.
            const nextSnapshot = Option.getOrNull(shell.snapshot);
            if (shellSnapshot !== null && nextSnapshot !== shellSnapshot) {
              appAtomRegistry.refresh(archivedAtom);
            }
            shellSnapshot = nextSnapshot;
            publish({ shell });
          },
          { immediate: true },
        ),
      ];
      stopFollowing = () => {
        for (const stop of stops) stop();
      };
    },
    { immediate: true },
  );
}

/**
 * Calls `watcher` with the primary environment's upstream state now, if it is
 * known, and on every change. The first call starts upstream's connection.
 */
export function watchUpstreamPrimary(watcher: Watcher): void {
  watchers.add(watcher);
  if (following) {
    if (current !== null) watcher(current);
    return;
  }
  following = true;
  follow();
}

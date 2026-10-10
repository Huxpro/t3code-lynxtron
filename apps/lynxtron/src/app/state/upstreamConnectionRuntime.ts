// Upstream's connection runtime on the Lynx thread, built the way the mobile
// client builds its own: upstream's `Connection` layer and snapshot loaders
// over this client's platform ports. Atoms made from it start the layer the
// first time `appAtomRegistry` reads one; importing this module starts nothing.
import { Connection, EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import { createAuthEnvironmentAtoms } from "@t3tools/client-runtime/state/auth";
import { createEnvironmentCatalogAtoms } from "@t3tools/client-runtime/state/connections";
import { createOrchestrationEnvironmentAtoms } from "@t3tools/client-runtime/state/orchestration";
import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
} from "@t3tools/client-runtime/state/runtime";
import { createServerEnvironmentAtoms } from "@t3tools/client-runtime/state/server";
import { createEnvironmentSessionAtoms } from "@t3tools/client-runtime/state/session";
import {
  createEnvironmentShellAtoms,
  ShellSnapshotLoader,
} from "@t3tools/client-runtime/state/shell";
import { createTerminalEnvironmentAtoms } from "@t3tools/client-runtime/state/terminal";
import {
  boundedThreadSnapshotLoaderLayer,
  createEnvironmentThreadStateAtoms,
  ThreadHistoryController,
} from "@t3tools/client-runtime/state/threads";
import { createVcsEnvironmentAtoms } from "@t3tools/client-runtime/state/vcs";
import type { ThreadId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { Atom } from "effect/unstable/reactivity";

import { connectionPlatformLayer } from "../platform/connectionPlatform.ts";

const snapshotLoaderLayer = Layer.mergeAll(
  boundedThreadSnapshotLoaderLayer,
  ShellSnapshotLoader.layer,
  ThreadHistoryController.layer,
);

const connectionLayer = snapshotLoaderLayer.pipe(
  Layer.provideMerge(Connection.layerWithOptions({})),
  Layer.provideMerge(connectionPlatformLayer),
);

export const upstreamConnectionRuntime = Atom.runtime(connectionLayer);

export const upstreamEnvironmentCatalog = createEnvironmentCatalogAtoms(upstreamConnectionRuntime);
export const upstreamEnvironmentShell = createEnvironmentShellAtoms(upstreamConnectionRuntime);
export const upstreamEnvironmentSession = createEnvironmentSessionAtoms(upstreamConnectionRuntime);
// No environment themes or usage-limit sources: the Lynx client renders
// neither.
export const upstreamServerEnvironment = createServerEnvironmentAtoms(upstreamConnectionRuntime, {
  initialConfigValueAtom: upstreamEnvironmentSession.initialConfigValueAtom,
});
export const upstreamOrchestrationEnvironment =
  createOrchestrationEnvironmentAtoms(upstreamConnectionRuntime);
export const upstreamEnvironmentThreads =
  createEnvironmentThreadStateAtoms(upstreamConnectionRuntime);
export const upstreamTerminalEnvironment =
  createTerminalEnvironmentAtoms(upstreamConnectionRuntime);
export const upstreamVcsEnvironment = createVcsEnvironmentAtoms(upstreamConnectionRuntime);
export const upstreamAuthEnvironment = createAuthEnvironmentAtoms(upstreamConnectionRuntime);

/**
 * Asks upstream for the page of a thread's history before the oldest one it
 * holds, as Web's "load earlier" control does. One page at a time per thread.
 */
export const upstreamLoadEarlierHistory = createEnvironmentCommand(upstreamConnectionRuntime, {
  label: "lynx:thread:load-earlier-history",
  execute: (input: { readonly threadId: ThreadId }) =>
    Effect.gen(function* () {
      const supervisor = yield* EnvironmentSupervisor.EnvironmentSupervisor;
      const controller = yield* ThreadHistoryController.ThreadHistoryController;
      return yield* controller.loadEarlier(supervisor.target.environmentId, input.threadId);
    }),
  scheduler: createAtomCommandScheduler(),
  concurrency: {
    mode: "serial",
    key: ({ environmentId, input }) => JSON.stringify([environmentId, input.threadId]),
  },
});

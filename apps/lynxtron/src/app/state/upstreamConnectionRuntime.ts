// Upstream's connection runtime on the Lynx thread, built the way the mobile
// client builds its own: upstream's `Connection` layer and snapshot loaders
// over this client's platform ports. Atoms made from it start the layer the
// first time `appAtomRegistry` reads one; importing this module starts nothing.
import { Connection } from "@t3tools/client-runtime/connection";
import { createEnvironmentCatalogAtoms } from "@t3tools/client-runtime/state/connections";
import {
  createEnvironmentShellAtoms,
  shellSnapshotLoaderLayer,
} from "@t3tools/client-runtime/state/shell";
import { threadSnapshotLoaderLayer } from "@t3tools/client-runtime/state/threads";
import * as Layer from "effect/Layer";
import { Atom } from "effect/unstable/reactivity";

import { connectionPlatformLayer } from "../platform/connectionPlatform.ts";

const snapshotLoaderLayer = Layer.merge(threadSnapshotLoaderLayer, shellSnapshotLoaderLayer);

const connectionLayer = snapshotLoaderLayer.pipe(
  Layer.provideMerge(Connection.layerWithOptions({})),
  Layer.provideMerge(connectionPlatformLayer),
);

export const upstreamConnectionRuntime = Atom.runtime(connectionLayer);

export const upstreamEnvironmentCatalog = createEnvironmentCatalogAtoms(upstreamConnectionRuntime);
export const upstreamEnvironmentShell = createEnvironmentShellAtoms(upstreamConnectionRuntime);

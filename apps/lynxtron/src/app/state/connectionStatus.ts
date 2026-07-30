/**
 * Standalone connection-status atom. Kept out of `t3Client.ts` so capability
 * leaves (e.g. connectivity) can read backend health without importing the
 * client-state module and creating an import cycle.
 */
import { Atom } from "effect/unstable/reactivity";

import type { ConnectionStatus } from "../bridge";
import { appAtomRegistry } from "./atomRegistry";

export const connectionStatusAtom = Atom.make<ConnectionStatus>("idle").pipe(
  Atom.withLabel("lynx-connection-status"),
);

export function reportConnectionStatus(status: ConnectionStatus): void {
  appAtomRegistry.set(connectionStatusAtom, status);
}

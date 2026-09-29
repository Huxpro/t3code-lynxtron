/**
 * P3-S1 runtime capability probe (R3/R5).
 *
 * Registers an inert listener for the main-process `sendGlobalEvent` probe:
 * it produces no work and no output unless the host actually delivers the
 * probe event (main only sends it when launched with
 * `T3_LYNXTRON_CAPABILITY_PROBE=1`). A DevTool console line proves the
 * main -> renderer push channel end to end.
 *
 * Remove when: the canonical push channel (R3) or the shared keyboard
 * capability (R5) supersedes probing.
 */

interface GlobalEventEmitterLike {
  addListener?: (eventName: string, listener: (...args: unknown[]) => void) => void;
}

declare const lynx: {
  getJSModule?: (name: string) => GlobalEventEmitterLike | undefined;
};

export const CAPABILITY_PROBE_EVENT = "t3-capability-probe";

export function registerCapabilityProbe(): void {
  "background only";
  try {
    const emitter = lynx.getJSModule?.("GlobalEventEmitter");
    emitter?.addListener?.(CAPABILITY_PROBE_EVENT, (...args: unknown[]) => {
      console.log(
        `[capability-probe] renderer received ${CAPABILITY_PROBE_EVENT}: ${JSON.stringify(args)}`,
      );
    });
  } catch (error) {
    console.log(`[capability-probe] listener registration failed: ${String(error)}`);
  }
}

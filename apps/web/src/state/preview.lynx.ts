import { AsyncResult } from "effect/unstable/reactivity";

/**
 * Structural command placeholder for the shared Sidebar. Port discovery is
 * empty on Lynx, so this command is not reachable until the connector grows
 * the preview-session protocol.
 */
export const previewEnvironment = {
  open: {
    label: "lynx:preview:unsupported",
    run: async () => AsyncResult.success(undefined),
  },
};

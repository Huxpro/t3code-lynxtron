import { AsyncResult } from "effect/unstable/reactivity";

const unsupportedMutation = {
  label: "lynx:projects:unsupported",
  run: async () => AsyncResult.success(undefined),
};

/**
 * Project mutation commands are not exposed by the current Lynx connector.
 * The canonical project list itself is supplied by state/entities.lynx.
 */
export const projectEnvironment = {
  delete: unsupportedMutation,
  update: unsupportedMutation,
};

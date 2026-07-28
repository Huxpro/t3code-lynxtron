import { AsyncResult, Atom } from "effect/unstable/reactivity";

const EMPTY_VCS_STATUS_ATOM = Atom.make(AsyncResult.success(null)).pipe(
  Atom.withLabel("lynx:vcs-status:unsupported"),
);

/**
 * VCS status streaming is not part of the current Lynx connector snapshot.
 */
export const vcsEnvironment = {
  status: () => EMPTY_VCS_STATUS_ATOM,
};

import type { ScopedProjectRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { t3ClientActions } from "../../../lynxtron/src/app/state/t3Client";

export type DraftThreadEnvMode = "local" | "worktree";

/**
 * Lynx does not create a Web-only draft route. It dispatches the canonical
 * project-scoped thread command and lets the host select the resulting thread.
 */
export function useNewThreadHandler() {
  return useCallback(
    async (
      projectRef: ScopedProjectRef,
      _options?: {
        branch?: string | null;
        worktreePath?: string | null;
        envMode?: DraftThreadEnvMode;
        startFromOrigin?: boolean;
        replace?: boolean;
      },
    ): Promise<void> => {
      await t3ClientActions.createThread(projectRef.projectId);
    },
    [],
  );
}

export function useHandleNewThread() {
  return {
    activeDraftThread: null,
    activeThread: null,
    defaultProjectRef: null,
    handleNewThread: useNewThreadHandler(),
  };
}

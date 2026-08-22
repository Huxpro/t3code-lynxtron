import type { ScopedProjectRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { t3ClientActions, useT3ClientState } from "../../../lynxtron/src/app/state/t3Client";
import { LYNX_PRIMARY_ENVIRONMENT_ID } from "../../../lynxtron/src/app/state/environment";

export type DraftThreadEnvMode = "local" | "worktree";

export function useNewThreadHandler() {
  return useCallback(
    async (
      projectRef: ScopedProjectRef,
      options?: {
        branch?: string | null;
        worktreePath?: string | null;
        envMode?: DraftThreadEnvMode;
        startFromOrigin?: boolean;
        replace?: boolean;
      },
    ): Promise<void> => {
      await t3ClientActions.createThread(projectRef.projectId, options);
    },
    [],
  );
}

export function useHandleNewThread() {
  const { activeThreadId, draftThread, projects, threads } = useT3ClientState();
  const activeThread = threads.find((thread) => thread.id === activeThreadId);
  return {
    activeDraftThread: draftThread ?? null,
    activeThread,
    defaultProjectRef: projects[0]
      ? {
          environmentId: LYNX_PRIMARY_ENVIRONMENT_ID,
          projectId: projects[0].id,
        }
      : null,
    handleNewThread: useNewThreadHandler(),
  };
}

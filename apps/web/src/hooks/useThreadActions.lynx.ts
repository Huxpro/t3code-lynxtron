import type { ScopedThreadRef } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useMemo } from "react";

import { t3ClientActions } from "../../../lynxtron/src/app/state/t3Client";
import { readThreadShell } from "../state/entities";

async function settleHostCommand(execute: () => Promise<void>) {
  try {
    await execute();
    return AsyncResult.success(undefined);
  } catch (error) {
    return AsyncResult.failure(Cause.fail(error));
  }
}

export function useThreadActions() {
  const archiveThread = useCallback(
    async (target: ScopedThreadRef, options: { onArchived?: () => void } = {}) => {
      const thread = readThreadShell(target);
      if (thread?.session?.status === "running" && thread.session.activeTurnId != null) {
        return AsyncResult.failure(Cause.fail(new Error("Cannot archive a running thread.")));
      }
      const result = await settleHostCommand(() =>
        t3ClientActions.archiveThread(target.threadId, false),
      );
      if (result._tag === "Success") {
        options.onArchived?.();
      }
      return result;
    },
    [],
  );
  const unarchiveThread = useCallback(
    (target: ScopedThreadRef) =>
      settleHostCommand(() => t3ClientActions.archiveThread(target.threadId, true)),
    [],
  );
  const deleteThread = useCallback(
    (target: ScopedThreadRef) =>
      settleHostCommand(() => t3ClientActions.deleteThread(target.threadId)),
    [],
  );
  const unsupported = useCallback(
    async () =>
      AsyncResult.failure(
        Cause.fail(new Error("This thread action is not available in Lynxtron yet.")),
      ),
    [],
  );

  return useMemo(
    () => ({
      archiveThread,
      unarchiveThread,
      deleteThread,
      confirmAndDeleteThread: deleteThread,
      settleThread: unsupported,
      unsettleThread: unsupported,
      snoozeThread: unsupported,
      unsnoozeThread: unsupported,
    }),
    [archiveThread, deleteThread, unarchiveThread, unsupported],
  );
}

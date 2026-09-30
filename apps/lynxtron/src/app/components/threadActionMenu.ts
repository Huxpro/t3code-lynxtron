import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { markThreadUnreadInTimestampRecord } from "@t3tools/client-runtime/presentation/sidebar";
import {
  canSnooze,
  effectiveSnoozed,
  resolveSnoozePresets,
} from "@t3tools/client-runtime/state/thread-settled";
import type { ServerConfig } from "@t3tools/contracts";

import { buildThreadActionMenuItems } from "../../../../web/src/components/threadActionMenu.logic";
import { toastManager } from "../../../../web/src/components/ui/toast";
import type { useThreadShells } from "../../../../web/src/state/entities";
import {
  clientCapabilities,
  showNativeConfirm,
  showNativeContextMenu,
} from "../platform/clientCapabilities.lynx";
import { getClientSettingsState, updateThreadVisitedTimestamps } from "../state/prefsStore";
import { t3ClientActions } from "../state/t3Client";

type ThreadShell = ReturnType<typeof useThreadShells>[number];

/**
 * The per-thread action menu shared by the sidebar row and the chat header
 * title, as on Web. Rename and delete need host UI (an inline field or an
 * in-row confirmation), so the host supplies them.
 */
export async function openThreadActionMenu(input: {
  readonly thread: ThreadShell;
  readonly projectPath: string | null;
  readonly settled: boolean;
  readonly serverConfig: ServerConfig | null | undefined;
  readonly onRename: () => void;
  readonly onDelete: () => void;
  readonly position?: { readonly x: number; readonly y: number };
}): Promise<void> {
  const { thread, serverConfig } = input;
  const capabilities = serverConfig?.environment.capabilities;
  const now = new Date();
  const snoozePresets = resolveSnoozePresets(now);
  const selection = await showNativeContextMenu(
    buildThreadActionMenuItems({
      branch: thread.branch,
      isPinned: thread.pinnedAt != null,
      isSettled: input.settled,
      isSnoozed: effectiveSnoozed(thread, { now: now.toISOString() }),
      canSnoozeNow: canSnooze(thread, { now: now.toISOString() }),
      isRegeneratingTitle: thread.titleRegeneration != null,
      isRunning: thread.session?.status === "running" && thread.session.activeTurnId != null,
      supports: {
        settlement: capabilities?.threadSettlement === true,
        snooze: capabilities?.threadSnooze === true,
        pinning: capabilities?.threadPinning === true,
        titleRegeneration: capabilities?.threadTitleRegeneration === true,
      },
      snoozePresets,
    }),
    input.position,
  );
  if (selection?.startsWith("snooze:")) {
    const preset = snoozePresets.find((candidate) => `snooze:${candidate.id}` === selection);
    if (preset) await t3ClientActions.snoozeThread(thread.id, preset.snoozedUntil);
    return;
  }
  const workspacePath = thread.worktreePath ?? input.projectPath;
  switch (selection) {
    case "new-thread-on-branch":
      if (!thread.branch) return;
      await t3ClientActions.createThread(thread.projectId, {
        branch: thread.branch,
        worktreePath: thread.worktreePath,
        envMode: thread.worktreePath ? "worktree" : "local",
        startFromOrigin: false,
      });
      return;
    case "pin":
      await t3ClientActions.pinThread(thread.id);
      return;
    case "unpin":
      await t3ClientActions.unpinThread(thread.id);
      return;
    case "settle":
      await t3ClientActions.settleThread(thread.id);
      return;
    case "unsettle":
      await t3ClientActions.unsettleThread(thread.id);
      return;
    case "unsnooze":
      await t3ClientActions.unsnoozeThread(thread.id);
      return;
    case "copy-path":
      if (!workspacePath) {
        toastManager.add({
          type: "error",
          title: "Path unavailable",
          description: "This thread does not have a workspace path to copy.",
        });
        return;
      }
      await clientCapabilities.clipboard.writeText(workspacePath);
      return;
    case "copy-branch":
      if (thread.branch) await clientCapabilities.clipboard.writeText(thread.branch);
      return;
    case "copy-thread-id":
      await clientCapabilities.clipboard.writeText(thread.id);
      return;
    case "archive":
      if (
        getClientSettingsState().confirmThreadArchive &&
        !(await showNativeConfirm({ message: `Archive thread "${thread.title}"?` }))
      ) {
        return;
      }
      await t3ClientActions.archiveThread(thread.id);
      return;
    case "mark-unread": {
      const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
      updateThreadVisitedTimestamps((current) =>
        markThreadUnreadInTimestampRecord(current, threadKey, thread.latestTurn?.completedAt),
      );
      return;
    }
    case "regenerate-title":
      await t3ClientActions.regenerateThreadTitle(thread.id);
      return;
    case "rename":
      input.onRename();
      return;
    case "delete":
      if (getClientSettingsState().confirmThreadDelete) input.onDelete();
      else await t3ClientActions.deleteThread(thread.id);
      return;
    default:
      return;
  }
}

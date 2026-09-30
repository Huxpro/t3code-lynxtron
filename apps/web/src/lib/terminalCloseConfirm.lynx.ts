import { terminalCloseConfirmation } from "@t3tools/client-runtime/presentation/terminal-context";

import { showNativeConfirm } from "../../../lynxtron/src/app/platform/clientCapabilities.lynx";

let pendingConfirmations = 0;

/** Whether a terminal-close confirmation is currently waiting on the user. */
export function isTerminalCloseConfirmPending(): boolean {
  return pendingConfirmations > 0;
}

/** Lynx twin of the Web confirmation, shown as a native dialog. */
export async function confirmTerminalClose(
  labels: readonly [string, ...string[]],
): Promise<boolean> {
  "background only";
  const { title, detail } = terminalCloseConfirmation(labels);
  pendingConfirmations += 1;
  try {
    return await showNativeConfirm({ message: title, detail, confirmLabel: "Close" });
  } catch {
    return false;
  } finally {
    pendingConfirmations -= 1;
  }
}

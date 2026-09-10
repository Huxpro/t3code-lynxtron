export type MessageRevertStatus = "pending" | "reverted" | "failed";

export async function runMessageRevert(
  confirm: () => Promise<boolean>,
  revert: () => Promise<void>,
  setStatus: (status: MessageRevertStatus | null) => void,
): Promise<MessageRevertStatus | null> {
  setStatus("pending");
  try {
    if (!(await confirm())) {
      setStatus(null);
      return null;
    }
    await revert();
    setStatus("reverted");
    return "reverted";
  } catch {
    setStatus("failed");
    return "failed";
  }
}

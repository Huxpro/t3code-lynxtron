export type MessageCopyStatus = "pending" | "copied" | "failed";

export async function runMessageCopy(
  writeText: (text: string) => Promise<void>,
  text: string,
  setStatus: (status: MessageCopyStatus) => void,
): Promise<MessageCopyStatus> {
  setStatus("pending");
  try {
    await writeText(text);
    setStatus("copied");
    return "copied";
  } catch {
    setStatus("failed");
    return "failed";
  }
}

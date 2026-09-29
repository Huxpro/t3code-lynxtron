import type { UploadChatAttachment } from "@t3tools/contracts";

export interface SendPromptThreadBridge {
  createThread?(input: { projectId?: string }): Promise<{ threadId: string }>;
  sendPrompt?(input: {
    threadId: string;
    text: string;
    attachments?: ReadonlyArray<UploadChatAttachment>;
  }): Promise<void>;
}

export async function sendPromptWithThreadCreation(input: {
  readonly text: string;
  readonly activeThreadId?: string;
  readonly projectId?: string;
  readonly attachments?: ReadonlyArray<UploadChatAttachment>;
  readonly bridge: SendPromptThreadBridge;
  readonly onThreadCreated: (threadId: string) => void;
}): Promise<void> {
  const trimmed = input.text.trim();
  if (!trimmed && !input.attachments?.length) return;
  let threadId = input.activeThreadId;
  if (!threadId) {
    if (!input.bridge.createThread) throw new Error("Creating a thread is unavailable.");
    const created = await input.bridge.createThread(
      input.projectId ? { projectId: input.projectId } : {},
    );
    threadId = created?.threadId;
    if (!threadId) throw new Error("Creating a thread did not return a thread ID.");
    input.onThreadCreated(threadId);
  }
  if (!input.bridge.sendPrompt) throw new Error("Sending a message is unavailable.");
  await input.bridge.sendPrompt({
    threadId,
    text: trimmed,
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
  });
}

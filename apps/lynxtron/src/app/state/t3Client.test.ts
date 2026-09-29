import { describe, expect, it, vi } from "vite-plus/test";

import { sendPromptWithThreadCreation } from "./sendPromptWithThreadCreation.ts";

describe("sendPromptWithThreadCreation", () => {
  it("sends directly to an existing canonical thread", async () => {
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const createThread = vi.fn();
    await sendPromptWithThreadCreation({
      text: "  hello  ",
      activeThreadId: "thread-1",
      bridge: { createThread, sendPrompt },
      onThreadCreated: vi.fn(),
    });
    expect(createThread).not.toHaveBeenCalled();
    expect(sendPrompt).toHaveBeenCalledWith({ threadId: "thread-1", text: "hello" });
  });

  it("creates, selects, and sends to a thread for the hero composer", async () => {
    const events: string[] = [];
    const createThread = vi.fn(async () => {
      events.push("create");
      return { threadId: "thread-new" };
    });
    const onThreadCreated = vi.fn((threadId: string) => {
      events.push(`select:${threadId}`);
    });
    const sendPrompt = vi.fn(async ({ threadId }: { threadId: string }) => {
      events.push(`send:${threadId}`);
    });
    await sendPromptWithThreadCreation({
      text: "first turn",
      projectId: "project-1",
      bridge: { createThread, sendPrompt },
      onThreadCreated,
    });
    expect(createThread).toHaveBeenCalledWith({ projectId: "project-1" });
    expect(events).toEqual(["create", "select:thread-new", "send:thread-new"]);
  });

  it("forwards upload attachments without renderer-specific rewriting", async () => {
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const attachment = {
      type: "image" as const,
      name: "proof.png",
      mimeType: "image/png",
      sizeBytes: 4,
      dataUrl: "data:image/png;base64,dGVzdA==",
    };
    await sendPromptWithThreadCreation({
      text: "inspect this",
      activeThreadId: "thread-1",
      attachments: [attachment],
      bridge: { createThread: vi.fn(), sendPrompt },
      onThreadCreated: vi.fn(),
    });
    expect(sendPrompt).toHaveBeenCalledWith({
      threadId: "thread-1",
      text: "inspect this",
      attachments: [attachment],
    });
  });

  it("allows an attachment-only turn", async () => {
    const sendPrompt = vi.fn().mockResolvedValue(undefined);
    const attachment = {
      type: "image" as const,
      name: "proof.png",
      mimeType: "image/png",
      sizeBytes: 4,
      dataUrl: "data:image/png;base64,dGVzdA==",
    };
    await sendPromptWithThreadCreation({
      text: "",
      activeThreadId: "thread-1",
      attachments: [attachment],
      bridge: { createThread: vi.fn(), sendPrompt },
      onThreadCreated: vi.fn(),
    });
    expect(sendPrompt).toHaveBeenCalledWith({
      threadId: "thread-1",
      text: "",
      attachments: [attachment],
    });
  });
});

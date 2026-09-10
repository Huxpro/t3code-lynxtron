import { describe, expect, it } from "vite-plus/test";

import { CommandId, MessageId, ProjectId, ProviderInstanceId, ThreadId } from "@t3tools/contracts";

import {
  buildThreadTurnStartCommand,
  projectThreadTurnDispatchState,
  resolveThreadTurnDispatchState,
} from "./threadDispatch.ts";

describe("projectThreadTurnDispatchState", () => {
  const shell = {
    modelSelection: {
      instanceId: ProviderInstanceId.make("codex"),
      model: "gpt-5.6",
      options: [{ id: "effort", value: "low" }],
    },
    runtimeMode: "approval-required" as const,
    interactionMode: "plan" as const,
  };

  it("uses every canonical mode from the thread shell", () => {
    expect(projectThreadTurnDispatchState(shell)).toEqual(shell);
  });

  it("uses only an explicitly thread-scoped pending model selection", () => {
    const pending = {
      instanceId: ProviderInstanceId.make("claudeAgent"),
      model: "claude-fable-5",
      options: [{ id: "effort", value: "high" }],
    };

    expect(projectThreadTurnDispatchState(shell, pending)).toEqual({
      modelSelection: pending,
      runtimeMode: "approval-required",
      interactionMode: "plan",
    });
  });

  it("uses atomic create-thread bootstrap state before the thread exists", () => {
    expect(
      resolveThreadTurnDispatchState({
        thread: undefined,
        bootstrapCreateThread: {
          projectId: "project-1" as never,
          title: "New draft",
          modelSelection: shell.modelSelection,
          runtimeMode: "auto",
          interactionMode: "default",
          branch: null,
          worktreePath: null,
          createdAt: "2026-08-22T00:00:00.000Z",
        },
      }),
    ).toEqual({
      modelSelection: shell.modelSelection,
      runtimeMode: "auto",
      interactionMode: "default",
    });
    expect(
      resolveThreadTurnDispatchState({
        thread: undefined,
      }),
    ).toBeNull();
  });

  it("builds one atomic create-and-start command for a local draft", () => {
    const bootstrap = {
      createThread: {
        projectId: ProjectId.make("project-1"),
        title: "Implement it",
        modelSelection: shell.modelSelection,
        runtimeMode: "auto" as const,
        interactionMode: "default" as const,
        branch: null,
        worktreePath: null,
        createdAt: "2026-08-22T00:00:00.000Z",
      },
    };

    expect(
      buildThreadTurnStartCommand({
        threadId: ThreadId.make("draft-thread"),
        text: "Implement it",
        thread: undefined,
        bootstrap,
        commandId: CommandId.make("command-1"),
        messageId: MessageId.make("message-1"),
        createdAt: "2026-08-22T00:00:01.000Z",
      }),
    ).toEqual({
      type: "thread.turn.start",
      commandId: "command-1",
      threadId: "draft-thread",
      message: {
        messageId: "message-1",
        role: "user",
        text: "Implement it",
        attachments: [],
      },
      modelSelection: shell.modelSelection,
      titleSeed: "Implement it",
      runtimeMode: "auto",
      interactionMode: "default",
      bootstrap,
      createdAt: "2026-08-22T00:00:01.000Z",
    });
  });

  it("refuses to start an unknown thread without an atomic create bootstrap", () => {
    expect(
      buildThreadTurnStartCommand({
        threadId: ThreadId.make("missing-thread"),
        text: "No implicit persistence",
        thread: undefined,
        commandId: CommandId.make("command-2"),
        messageId: MessageId.make("message-2"),
        createdAt: "2026-08-22T00:00:01.000Z",
      }),
    ).toBeNull();
  });

  it("forwards upload attachments into the client turn command", () => {
    const attachments = [
      {
        type: "image" as const,
        name: "diagram.png",
        mimeType: "image/png",
        sizeBytes: 3,
        dataUrl: "data:image/png;base64,AQID",
      },
    ];
    const command = buildThreadTurnStartCommand({
      threadId: ThreadId.make("thread-attachments"),
      text: "Review this",
      thread: shell,
      attachments,
      commandId: CommandId.make("command-attachments"),
      messageId: MessageId.make("message-attachments"),
      createdAt: "2026-09-10T00:00:00.000Z",
    });

    expect(command?.message.attachments).toEqual(attachments);
  });
});

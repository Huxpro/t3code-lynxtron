import type {
  CommandId,
  ClientOrchestrationCommand,
  MessageId,
  ModelSelection,
  OrchestrationThreadShell,
  ProviderInteractionMode,
  RuntimeMode,
  ThreadId,
  ThreadTurnStartBootstrap,
  UploadChatAttachment,
} from "@t3tools/contracts";

export interface ThreadTurnDispatchState {
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
}

/**
 * Resolve the canonical settings attached to the next turn.
 *
 * A just-dispatched model metadata update may not have reached the shell
 * stream yet, so only a pending selection scoped to this exact thread may
 * override its snapshot. Runtime and interaction modes always come from the
 * thread shell.
 */
export function projectThreadTurnDispatchState(
  thread: Pick<OrchestrationThreadShell, "modelSelection" | "runtimeMode" | "interactionMode">,
  pendingModelSelection?: ModelSelection,
): ThreadTurnDispatchState {
  return {
    modelSelection: pendingModelSelection ?? thread.modelSelection,
    runtimeMode: thread.runtimeMode,
    interactionMode: thread.interactionMode,
  };
}

export function resolveThreadTurnDispatchState(input: {
  readonly thread:
    | Pick<OrchestrationThreadShell, "modelSelection" | "runtimeMode" | "interactionMode">
    | undefined;
  readonly pendingModelSelection?: ModelSelection;
  readonly bootstrapCreateThread?: ThreadTurnStartBootstrap["createThread"];
}): ThreadTurnDispatchState | null {
  if (input.thread) {
    return projectThreadTurnDispatchState(input.thread, input.pendingModelSelection);
  }
  if (!input.bootstrapCreateThread) return null;
  return {
    modelSelection: input.bootstrapCreateThread.modelSelection,
    runtimeMode: input.bootstrapCreateThread.runtimeMode,
    interactionMode: input.bootstrapCreateThread.interactionMode,
  };
}

export function buildThreadTurnStartCommand(input: {
  readonly threadId: ThreadId;
  readonly text: string;
  readonly attachments?: ReadonlyArray<UploadChatAttachment>;
  readonly thread:
    | Pick<OrchestrationThreadShell, "modelSelection" | "runtimeMode" | "interactionMode">
    | undefined;
  readonly pendingModelSelection?: ModelSelection;
  readonly bootstrap?: ThreadTurnStartBootstrap;
  readonly commandId: CommandId;
  readonly messageId: MessageId;
  readonly createdAt: string;
}): Extract<ClientOrchestrationCommand, { type: "thread.turn.start" }> | null {
  const dispatchState = resolveThreadTurnDispatchState({
    thread: input.thread,
    ...(input.pendingModelSelection ? { pendingModelSelection: input.pendingModelSelection } : {}),
    ...(input.bootstrap?.createThread
      ? { bootstrapCreateThread: input.bootstrap.createThread }
      : {}),
  });
  if (!dispatchState) return null;
  return {
    type: "thread.turn.start",
    commandId: input.commandId,
    threadId: input.threadId,
    message: {
      messageId: input.messageId,
      role: "user",
      text: input.text,
      attachments: [...(input.attachments ?? [])],
    },
    ...dispatchState,
    ...(input.bootstrap?.createThread ? { titleSeed: input.bootstrap.createThread.title } : {}),
    ...(input.bootstrap ? { bootstrap: input.bootstrap } : {}),
    createdAt: input.createdAt,
  };
}

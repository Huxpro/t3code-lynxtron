import type {
  ModelSelection,
  OrchestrationThreadShell,
  ProviderInteractionMode,
  RuntimeMode,
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

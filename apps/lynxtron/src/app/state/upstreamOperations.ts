// Upstream's orchestration operations the Lynx client's commands are sent
// with. Each one builds its command the way Web and mobile do: upstream
// supplies the command id (from `Crypto`) and the timestamp, and sends it on
// the environment's session.
import {
  type ArchiveThreadInput,
  archiveThread,
  type CreateProjectInput,
  createProject,
  type CreateThreadInput,
  createThread,
  type DeleteProjectInput,
  deleteProject,
  type DeleteThreadInput,
  deleteThread,
  type InterruptThreadTurnInput,
  interruptThreadTurn,
  type PinThreadInput,
  pinThread,
  type RespondToThreadApprovalInput,
  respondToThreadApproval,
  type RespondToThreadUserInputInput,
  respondToThreadUserInput,
  type RevertThreadCheckpointInput,
  revertThreadCheckpoint,
  type SetThreadInteractionModeInput,
  setThreadInteractionMode,
  type SetThreadRuntimeModeInput,
  setThreadRuntimeMode,
  type SettleThreadInput,
  settleThread,
  type SnoozeThreadInput,
  snoozeThread,
  type StartThreadTurnInput,
  startThreadTurn,
  type UnarchiveThreadInput,
  unarchiveThread,
  type UnpinThreadInput,
  unpinThread,
  type UnsettleThreadInput,
  unsettleThread,
  type UnsnoozeThreadInput,
  unsnoozeThread,
  type UpdateProjectInput,
  updateProject,
  type UpdateThreadMetadataInput,
  updateThreadMetadata,
} from "@t3tools/client-runtime/operations";
import type * as Effect from "effect/Effect";

/** The input each operation takes, by the name upstream exports it under. */
export interface UpstreamOperationInputs {
  readonly createProject: CreateProjectInput;
  readonly updateProject: UpdateProjectInput;
  readonly deleteProject: DeleteProjectInput;
  readonly createThread: CreateThreadInput;
  readonly deleteThread: DeleteThreadInput;
  readonly archiveThread: ArchiveThreadInput;
  readonly unarchiveThread: UnarchiveThreadInput;
  readonly settleThread: SettleThreadInput;
  readonly unsettleThread: UnsettleThreadInput;
  readonly snoozeThread: SnoozeThreadInput;
  readonly unsnoozeThread: UnsnoozeThreadInput;
  readonly pinThread: PinThreadInput;
  readonly unpinThread: UnpinThreadInput;
  readonly updateThreadMetadata: UpdateThreadMetadataInput;
  readonly setThreadRuntimeMode: SetThreadRuntimeModeInput;
  readonly setThreadInteractionMode: SetThreadInteractionModeInput;
  readonly startThreadTurn: StartThreadTurnInput;
  readonly interruptThreadTurn: InterruptThreadTurnInput;
  readonly respondToThreadApproval: RespondToThreadApprovalInput;
  readonly respondToThreadUserInput: RespondToThreadUserInputInput;
  readonly revertThreadCheckpoint: RevertThreadCheckpointInput;
}

export type UpstreamOperationName = keyof UpstreamOperationInputs;

// What an operation answers with differs: a dispatch names the event sequence,
// a first turn names the thread it launched. No command reads either.
type AnyOperationEffect = ReturnType<
  | typeof createProject
  | typeof createThread
  | typeof updateThreadMetadata
  | typeof startThreadTurn
  | typeof interruptThreadTurn
  | typeof revertThreadCheckpoint
>;
type OperationEffect = Effect.Effect<
  unknown,
  Effect.Error<AnyOperationEffect>,
  Effect.Services<AnyOperationEffect>
>;

const OPERATIONS: {
  readonly [Name in UpstreamOperationName]: (
    input: UpstreamOperationInputs[Name],
  ) => OperationEffect;
} = {
  createProject,
  updateProject,
  deleteProject,
  createThread,
  deleteThread,
  archiveThread,
  unarchiveThread,
  settleThread,
  unsettleThread,
  snoozeThread,
  unsnoozeThread,
  pinThread,
  unpinThread,
  updateThreadMetadata,
  setThreadRuntimeMode,
  setThreadInteractionMode,
  startThreadTurn,
  interruptThreadTurn,
  respondToThreadApproval,
  respondToThreadUserInput,
  revertThreadCheckpoint,
};

/** Upstream's operation `name` for `input`, to run in an environment. */
export function upstreamOperation<Name extends UpstreamOperationName>(
  name: Name,
  input: UpstreamOperationInputs[Name],
): OperationEffect {
  return OPERATIONS[name](input);
}

/** The thread whose commands `input` has to stay in order with, if it names one. */
export function operationThreadId(input: object): string | undefined {
  return "threadId" in input && typeof input.threadId === "string" ? input.threadId : undefined;
}

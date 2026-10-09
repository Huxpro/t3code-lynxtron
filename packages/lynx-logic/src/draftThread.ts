import {
  DEFAULT_PROVIDER_INTERACTION_MODE,
  DEFAULT_RUNTIME_MODE,
  PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
  isProviderSendTurnSupportedImageMimeType,
  type ModelSelection,
  type OrchestrationThreadShell,
  type ProjectId,
  type ProviderInteractionMode,
  type RuntimeMode,
  type ThreadId,
  type ThreadTurnStartBootstrap,
  type UploadChatAttachment,
} from "@t3tools/contracts";

export type LocalDraftThreadEnvMode = "local" | "worktree";

export interface LocalDraftThread extends OrchestrationThreadShell {
  readonly envMode: LocalDraftThreadEnvMode;
  readonly startFromOrigin: boolean;
}

export type LocalDraftThreadsByProjectId = Readonly<Record<string, LocalDraftThread>>;

export type ComposerDraftTextByScopeKey = Readonly<Record<string, string>>;
export type ComposerDraftAttachmentsByScopeKey = Readonly<
  Record<string, ReadonlyArray<UploadChatAttachment>>
>;

export function composerDraftScopeKey(input: {
  readonly threadId?: string;
  readonly projectId?: string;
  readonly localDraft: boolean;
}): string | null {
  if (input.localDraft && input.projectId) return `project:${input.projectId}`;
  if (input.threadId) return `thread:${input.threadId}`;
  if (input.projectId) return `project:${input.projectId}`;
  return null;
}

export function normalizeComposerDraftTextByScopeKey(value: unknown): ComposerDraftTextByScopeKey {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      ([key, text]) =>
        (key.startsWith("thread:") || key.startsWith("project:")) &&
        key.length > key.indexOf(":") + 1 &&
        typeof text === "string" &&
        text.length > 0,
    ),
  );
}

export function normalizeComposerDraftAttachmentsByScopeKey(
  value: unknown,
): ComposerDraftAttachmentsByScopeKey {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, attachments]) => {
      const validKey =
        (key.startsWith("thread:") || key.startsWith("project:")) &&
        key.length > key.indexOf(":") + 1;
      if (!validKey || !Array.isArray(attachments)) return [];
      const valid = attachments.filter(
        (attachment): attachment is UploadChatAttachment =>
          typeof attachment === "object" &&
          attachment !== null &&
          (attachment as UploadChatAttachment).type === "image" &&
          typeof (attachment as UploadChatAttachment).name === "string" &&
          typeof (attachment as UploadChatAttachment).mimeType === "string" &&
          (attachment as UploadChatAttachment).mimeType.startsWith("image/") &&
          typeof (attachment as UploadChatAttachment).sizeBytes === "number" &&
          typeof (attachment as UploadChatAttachment).dataUrl === "string" &&
          (attachment as UploadChatAttachment).dataUrl.startsWith("data:image/"),
      );
      return valid.length > 0 ? [[key, valid]] : [];
    }),
  );
}

export function addComposerDraftAttachments(
  draftsByScopeKey: ComposerDraftAttachmentsByScopeKey,
  scopeKey: string,
  attachments: ReadonlyArray<UploadChatAttachment>,
  limit = PROVIDER_SEND_TURN_MAX_ATTACHMENTS,
): ComposerDraftAttachmentsByScopeKey {
  const current = draftsByScopeKey[scopeKey] ?? [];
  const next = [...current, ...attachments].slice(0, limit);
  return next.length === current.length && next.every((item, index) => item === current[index])
    ? draftsByScopeKey
    : { ...draftsByScopeKey, [scopeKey]: next };
}

/** Thread error shown when a pasted or dropped image cannot be prepared for sending. */
export function composerImagePreparationErrorMessage(
  name: string,
  reason: "too-large" | "unreadable",
): string {
  return reason === "unreadable"
    ? `'${name}' could not be read as an image.`
    : `'${name}' is too large to attach, even after compression.`;
}

export const COMPOSER_IMAGES_BLOCKED_BY_PENDING_INPUT =
  "Attach images after answering plan questions.";

export type ComposerImageAdditionPlan<Candidate> =
  | { readonly kind: "blocked-by-pending-user-input"; readonly message: string }
  | {
      readonly kind: "planned";
      readonly accepted: ReadonlyArray<Candidate>;
      readonly error: string | null;
    };

/**
 * Decides which pasted or dropped images a Composer accepts. `reservedCount`
 * includes attachments already in the draft plus any still being prepared, so
 * concurrent additions cannot exceed the per-message limit. Renderers show a
 * `planned` error in the thread error surface.
 */
export function planComposerImageAdditions<
  Candidate extends { readonly name: string; readonly mimeType: string },
>(options: {
  readonly candidates: ReadonlyArray<Candidate>;
  readonly reservedCount: number;
  readonly hasPendingUserInput: boolean;
}): ComposerImageAdditionPlan<Candidate> {
  if (options.hasPendingUserInput) {
    return {
      kind: "blocked-by-pending-user-input",
      message: COMPOSER_IMAGES_BLOCKED_BY_PENDING_INPUT,
    };
  }
  let reservedCount = options.reservedCount;
  const accepted: Candidate[] = [];
  let error: string | null = null;
  for (const candidate of options.candidates) {
    if (!candidate.mimeType.startsWith("image/")) {
      error = `Unsupported file type for '${candidate.name}'. Please attach image files only.`;
      continue;
    }
    if (!isProviderSendTurnSupportedImageMimeType(candidate.mimeType)) {
      error = `'${candidate.name}' is not a supported image type. Attach GIF, JPEG, PNG, or WebP images.`;
      continue;
    }
    if (reservedCount >= PROVIDER_SEND_TURN_MAX_ATTACHMENTS) {
      error = `You can attach up to ${PROVIDER_SEND_TURN_MAX_ATTACHMENTS} images per message.`;
      break;
    }
    accepted.push(candidate);
    reservedCount += 1;
  }
  return { kind: "planned", accepted, error };
}

export function removeComposerDraftAttachment(
  draftsByScopeKey: ComposerDraftAttachmentsByScopeKey,
  scopeKey: string,
  index: number,
): ComposerDraftAttachmentsByScopeKey {
  const current = draftsByScopeKey[scopeKey] ?? [];
  const next = current.filter((_, currentIndex) => currentIndex !== index);
  if (next.length === current.length) return draftsByScopeKey;
  if (next.length === 0) {
    const { [scopeKey]: _cleared, ...remaining } = draftsByScopeKey;
    return remaining;
  }
  return { ...draftsByScopeKey, [scopeKey]: next };
}

export function projectComposerDraftText(
  draftsByScopeKey: ComposerDraftTextByScopeKey,
  scopeKey: string,
  text: string,
): ComposerDraftTextByScopeKey {
  if (text.length === 0) {
    if (!(scopeKey in draftsByScopeKey)) return draftsByScopeKey;
    const { [scopeKey]: _cleared, ...remaining } = draftsByScopeKey;
    return remaining;
  }
  if (draftsByScopeKey[scopeKey] === text) return draftsByScopeKey;
  return { ...draftsByScopeKey, [scopeKey]: text };
}

export function readLocalDraftThreadForProject(
  draftsByProjectId: LocalDraftThreadsByProjectId,
  projectId: ProjectId,
): LocalDraftThread | undefined {
  return draftsByProjectId[projectId];
}

export function rememberLocalDraftThread(
  draftsByProjectId: LocalDraftThreadsByProjectId,
  draft: LocalDraftThread,
): LocalDraftThreadsByProjectId {
  return {
    ...draftsByProjectId,
    [draft.projectId]: draft,
  };
}

export function forgetLocalDraftThread(
  draftsByProjectId: LocalDraftThreadsByProjectId,
  draft: LocalDraftThread,
): LocalDraftThreadsByProjectId {
  if (draftsByProjectId[draft.projectId]?.id !== draft.id) {
    return draftsByProjectId;
  }
  const { [draft.projectId]: _forgotten, ...remaining } = draftsByProjectId;
  return remaining;
}

/** Compact, restart-safe form of a local draft thread; rebuilt with `createLocalDraftThread`. */
export interface PersistedLocalDraftThread {
  readonly id: string;
  readonly projectId: string;
  readonly modelSelection: ModelSelection;
  readonly runtimeMode: RuntimeMode;
  readonly interactionMode: ProviderInteractionMode;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly envMode: LocalDraftThreadEnvMode;
  readonly startFromOrigin: boolean;
  readonly createdAt: string;
}

export function serializeLocalDraftThreadsByProjectId(
  draftsByProjectId: LocalDraftThreadsByProjectId,
): Readonly<Record<string, PersistedLocalDraftThread>> {
  return Object.fromEntries(
    Object.entries(draftsByProjectId).map(([projectId, draft]) => [
      projectId,
      {
        id: draft.id,
        projectId: draft.projectId,
        modelSelection: draft.modelSelection,
        runtimeMode: draft.runtimeMode,
        interactionMode: draft.interactionMode,
        branch: draft.branch,
        worktreePath: draft.worktreePath,
        envMode: draft.envMode,
        startFromOrigin: draft.startFromOrigin,
        createdAt: draft.createdAt,
      },
    ]),
  );
}

const nullableString = (value: unknown): string | null | undefined =>
  value === null ? null : typeof value === "string" ? value : undefined;

/**
 * Restores persisted local drafts so a draft keeps its identity across a cold
 * restart, as Web's persisted draft store does. Invalid entries are dropped.
 */
export function normalizeLocalDraftThreadsByProjectId(
  value: unknown,
): LocalDraftThreadsByProjectId {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([projectId, entry]) => {
      if (typeof entry !== "object" || entry === null) return [];
      const draft = entry as Partial<Record<keyof PersistedLocalDraftThread, unknown>>;
      const selection = draft.modelSelection as Partial<ModelSelection> | undefined;
      const branch = nullableString(draft.branch);
      const worktreePath = nullableString(draft.worktreePath);
      if (
        typeof draft.id !== "string" ||
        draft.id.length === 0 ||
        draft.projectId !== projectId ||
        typeof selection?.instanceId !== "string" ||
        typeof selection.model !== "string" ||
        typeof draft.createdAt !== "string" ||
        branch === undefined ||
        worktreePath === undefined
      ) {
        return [];
      }
      return [
        [
          projectId,
          createLocalDraftThread({
            threadId: draft.id as ThreadId,
            projectId: projectId as ProjectId,
            modelSelection: selection as ModelSelection,
            createdAt: draft.createdAt,
            ...(typeof draft.runtimeMode === "string"
              ? { runtimeMode: draft.runtimeMode as RuntimeMode }
              : {}),
            ...(typeof draft.interactionMode === "string"
              ? { interactionMode: draft.interactionMode as ProviderInteractionMode }
              : {}),
            branch,
            worktreePath,
            ...(draft.envMode === "local" || draft.envMode === "worktree"
              ? { envMode: draft.envMode }
              : {}),
            startFromOrigin: draft.startFromOrigin === true,
          }),
        ],
      ];
    }),
  );
}

export function createLocalDraftThread(input: {
  readonly threadId: ThreadId;
  readonly projectId: ProjectId;
  readonly modelSelection: ModelSelection;
  readonly createdAt: string;
  readonly runtimeMode?: RuntimeMode;
  readonly interactionMode?: ProviderInteractionMode;
  readonly branch?: string | null;
  readonly worktreePath?: string | null;
  readonly envMode?: LocalDraftThreadEnvMode;
  readonly startFromOrigin?: boolean;
}): LocalDraftThread {
  return {
    id: input.threadId,
    projectId: input.projectId,
    title: "New thread",
    modelSelection: input.modelSelection,
    runtimeMode: input.runtimeMode ?? DEFAULT_RUNTIME_MODE,
    interactionMode: input.interactionMode ?? DEFAULT_PROVIDER_INTERACTION_MODE,
    branch: input.branch ?? null,
    worktreePath: input.worktreePath ?? null,
    latestTurn: null,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    session: null,
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
    envMode: input.envMode ?? (input.worktreePath ? "worktree" : "local"),
    startFromOrigin: input.startFromOrigin ?? false,
  };
}

export function buildDraftThreadTurnBootstrap(
  draft: LocalDraftThread,
  title: string,
  existing?: ThreadTurnStartBootstrap,
): ThreadTurnStartBootstrap {
  return {
    ...existing,
    createThread: {
      projectId: draft.projectId,
      title,
      modelSelection: draft.modelSelection,
      runtimeMode: draft.runtimeMode,
      interactionMode: draft.interactionMode,
      branch: draft.branch,
      worktreePath: draft.worktreePath,
      createdAt: draft.createdAt,
    },
  };
}

export function shouldFinalizePromotedDraftThread(input: {
  readonly draftThreadId: ThreadId | undefined;
  readonly payloadThreadId: ThreadId;
  readonly messageCount: number;
  readonly sessionStatus: string;
}): boolean {
  return (
    input.draftThreadId === input.payloadThreadId &&
    (input.messageCount > 0 || input.sessionStatus !== "idle")
  );
}

export function projectDraftThreadModelSelection(
  draft: LocalDraftThread | undefined,
  selection: ModelSelection,
): LocalDraftThread | undefined {
  return draft ? { ...draft, modelSelection: selection } : undefined;
}

export function projectDraftThreadRuntimeMode(
  draft: LocalDraftThread | undefined,
  runtimeMode: RuntimeMode,
): LocalDraftThread | undefined {
  return draft ? { ...draft, runtimeMode } : undefined;
}

export function projectDraftThreadInteractionMode(
  draft: LocalDraftThread | undefined,
  interactionMode: ProviderInteractionMode,
): LocalDraftThread | undefined {
  return draft ? { ...draft, interactionMode } : undefined;
}

export function projectDraftThreadWorkspace(
  draft: LocalDraftThread | undefined,
  input: {
    readonly branch?: string | null;
    readonly worktreePath?: string | null;
    readonly envMode?: LocalDraftThreadEnvMode;
    readonly startFromOrigin?: boolean;
  },
): LocalDraftThread | undefined {
  if (!draft) return undefined;
  const envMode = input.envMode ?? draft.envMode;
  return {
    ...draft,
    envMode,
    startFromOrigin:
      envMode === "worktree" ? (input.startFromOrigin ?? draft.startFromOrigin) : false,
    branch: envMode === "local" ? null : (input.branch ?? draft.branch),
    worktreePath: envMode === "local" ? null : (input.worktreePath ?? draft.worktreePath),
  };
}

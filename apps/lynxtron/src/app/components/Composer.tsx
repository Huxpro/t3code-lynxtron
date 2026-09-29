import { useState, useCallback, useEffect, useRef } from "@lynx-js/react";
import {
  deriveComposerSendState,
  appendFileContextsToPrompt,
  getComposerInteractionModePresentation,
  getComposerRuntimeModePresentation,
  projectComposerContext,
  getComposerUnavailablePlaceholder,
} from "@t3tools/client-runtime/presentation/composer";
import type { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import type { ConnectionStatus } from "../bridge";
import type { UploadChatAttachment } from "@t3tools/contracts";
import type { ProviderApprovalDecision } from "@t3tools/contracts";
import type { PendingApproval } from "@t3tools/client-runtime/presentation/pending-requests";
import type { PendingUserInput } from "@t3tools/client-runtime/presentation/pending-requests";
import type { PendingUserInputProgress } from "@t3tools/client-runtime/presentation/pending-user-input";
import {
  COMPOSER_SHELL_CLASS,
  ComposerContextStrip,
  ComposerHeroHeadline,
  ComposerSurface,
  ComposerToolbarRow,
} from "../../../../web/src/components/chat/ComposerSurface";
import {
  ComposerPendingApprovalActionsSurface,
  ComposerPendingApprovalPanelSurface,
} from "../../../../web/src/components/chat/ComposerPendingApprovalSurface";
import { ComposerPendingUserInputSurface } from "../../../../web/src/components/chat/ComposerPendingUserInputSurface";
import { ComposerPlanFollowUpSurface } from "../../../../web/src/components/chat/ComposerPlanFollowUpSurface";
import { ComposerImageAttachmentSurface } from "../../../../web/src/components/chat/ComposerImageAttachmentSurface";
import { Icon, type IconName } from "./Icon";
import {
  clearComposerDraft,
  addComposerAttachments,
  hydrateComposerDrafts,
  persistComposerDrafts,
  readComposerDraft,
  readComposerAttachments,
  readComposerFileContexts,
  removeComposerAttachment,
  removeComposerFileContext,
  subscribeComposerDrafts,
  writeComposerDraft,
} from "../state/composerDraftRegistry";
import { getPref, isPrefStorageAvailable, refreshPref, setPref } from "../state/prefsStore";

const draftStorage = { isAvailable: isPrefStorageAvailable, get: getPref, set: setPref };
const refreshingDraftStorage = {
  isAvailable: isPrefStorageAvailable,
  get: refreshPref,
  set: setPref,
};
const DRAFT_HYDRATION_MAX_ATTEMPTS = 20;
const DRAFT_HYDRATION_RETRY_MS = 50;

interface ComposerProps {
  disabled: boolean;
  connectionStatus: ConnectionStatus;
  busy: boolean;
  hero: boolean;
  draftKey: string;
  projectName?: string;
  modelLabel?: string;
  modelInstanceId?: string;
  modelOptionLabel?: string;
  branch?: string;
  worktreePath?: string;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  pendingApproval?: PendingApproval;
  pendingApprovalCount?: number;
  approvalResponding?: boolean;
  approvalError?: string;
  pendingUserInput?: PendingUserInput;
  pendingUserInputProgress?: PendingUserInputProgress;
  userInputResponding?: boolean;
  userInputError?: string;
  planTitle?: string;
  planSubmitting?: boolean;
  planError?: string;
  onSend: (text: string, attachments?: ReadonlyArray<UploadChatAttachment>) => Promise<void>;
  onPickImageAttachments: () => Promise<UploadChatAttachment[]>;
  onStop: () => void;
  onModelTap?: () => void;
  onModelOptionTap?: () => void;
  onRuntimeModeTap: () => void;
  onInteractionModeTap: () => void;
  onRespondToApproval?: (decision: ProviderApprovalDecision) => void;
  onToggleUserInputOption?: (questionId: string, optionLabel: string) => void;
  onPreviousUserInputQuestion?: () => void;
  onAdvanceUserInputQuestion?: () => void;
  onUserInputCustomAnswerChange?: (questionId: string, value: string) => void;
  onImplementPlan?: () => void;
  onImplementPlanInNewThread?: () => void;
}

// Provider brand icons for the model pill (fill icons; fallback to a stroke
// glyph for providers without a rasterized brand mark).
const PROVIDER_ICONS: Record<string, IconName> = {
  claudeAgent: "claude",
};

function getProviderIcon(instanceId: string): IconName | undefined {
  return PROVIDER_ICONS[instanceId];
}

const RUNTIME_MODE_ICONS: Record<RuntimeMode, IconName> = {
  "approval-required": "lock",
  "auto-accept-edits": "pencil-line",
  auto: "bot",
  "full-access": "lock-open",
};

// A pill button inside the shared composer toolbar row (control island).
function Pill({
  icon,
  iconColor,
  label,
  muted,
  chevron,
  onTap,
}: {
  icon?: IconName;
  iconColor?: string;
  label: string;
  muted?: boolean;
  chevron?: boolean;
  onTap?: () => void;
}) {
  return (
    <view className={muted ? "pill pill--muted" : "pill"} bindtap={onTap}>
      {icon ? (
        <Icon name={icon} size={14} color={iconColor ?? "#a1a1aa"} className="pill__icon-img" />
      ) : null}
      <text className="pill__label" text-maxline="1">
        {label}
      </text>
      {chevron ? (
        <Icon name="chevron-down" size={14} color="#71717a" className="pill__chevron-img" />
      ) : null}
    </view>
  );
}

export function Composer({
  disabled,
  connectionStatus,
  busy,
  hero,
  draftKey,
  projectName,
  modelLabel,
  modelInstanceId,
  modelOptionLabel,
  branch,
  worktreePath,
  runtimeMode,
  interactionMode,
  pendingApproval,
  pendingApprovalCount = 0,
  approvalResponding = false,
  approvalError,
  pendingUserInput,
  pendingUserInputProgress,
  userInputResponding = false,
  userInputError,
  planTitle,
  planSubmitting = false,
  planError,
  onSend,
  onPickImageAttachments,
  onStop,
  onModelTap,
  onModelOptionTap,
  onRuntimeModeTap,
  onInteractionModeTap,
  onRespondToApproval,
  onToggleUserInputOption,
  onPreviousUserInputQuestion,
  onAdvanceUserInputQuestion,
  onUserInputCustomAnswerChange,
  onImplementPlan,
  onImplementPlanInNewThread,
}: ComposerProps) {
  hydrateComposerDrafts(draftStorage);
  const [value, setValue] = useState(() => readComposerDraft(draftKey));
  const [attachments, setAttachments] = useState(() => readComposerAttachments(draftKey));
  const [fileContexts, setFileContexts] = useState(() => readComposerFileContexts(draftKey));
  const [attachmentError, setAttachmentError] = useState<string | undefined>();
  const [sendPending, setSendPending] = useState(false);
  const [sendError, setSendError] = useState<string | undefined>(undefined);
  const sendPendingRef = useRef(false);
  const draftKeyRef = useRef(draftKey);
  useEffect(() => {
    (
      globalThis as typeof globalThis & {
        __T3_LYNXTRON_COMPOSER_DRAFT__?: {
          key: string;
          imageCount: number;
          fileContextCount: number;
          sendPending: boolean;
        };
      }
    ).__T3_LYNXTRON_COMPOSER_DRAFT__ = {
      key: draftKey,
      imageCount: attachments.length,
      fileContextCount: fileContexts.length,
      sendPending,
    };
  }, [attachments.length, draftKey, fileContexts.length, sendPending]);
  useEffect(() => {
    draftKeyRef.current = draftKey;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const hydrate = () => {
      if (cancelled) return;
      attempt += 1;
      if (!hydrateComposerDrafts(refreshingDraftStorage)) {
        if (attempt < DRAFT_HYDRATION_MAX_ATTEMPTS) {
          timer = setTimeout(hydrate, DRAFT_HYDRATION_RETRY_MS);
        }
        return;
      }
      setValue(readComposerDraft(draftKey));
      setAttachments(readComposerAttachments(draftKey));
      setFileContexts(readComposerFileContexts(draftKey));
      persistComposerDrafts(draftStorage);
    };
    hydrate();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [disabled, draftKey]);
  useEffect(
    () =>
      subscribeComposerDrafts(() => {
        setValue(readComposerDraft(draftKeyRef.current));
        setAttachments(readComposerAttachments(draftKeyRef.current));
        setFileContexts(readComposerFileContexts(draftKeyRef.current));
      }),
    [],
  );
  const sendState = deriveComposerSendState({
    prompt: value,
    imageCount: attachments.length,
    terminalContexts: [],
    elementContextCount: fileContexts.length,
  });

  const handleInput = useCallback(
    (e: { detail: { value: string } }) => {
      const questionId = pendingUserInputProgress?.activeQuestion?.id;
      if (questionId && onUserInputCustomAnswerChange) {
        onUserInputCustomAnswerChange(questionId, e.detail.value);
        return;
      }
      writeComposerDraft(draftKeyRef.current, e.detail.value);
      persistComposerDrafts(draftStorage);
      setValue(e.detail.value);
    },
    [onUserInputCustomAnswerChange, pendingUserInputProgress?.activeQuestion?.id],
  );

  const handleSend = useCallback(() => {
    if (pendingApproval) return;
    if (pendingUserInputProgress) {
      if (pendingUserInputProgress.canAdvance && onAdvanceUserInputQuestion) {
        onAdvanceUserInputQuestion();
      }
      return;
    }
    if (busy) {
      onStop();
      return;
    }
    const text = appendFileContextsToPrompt(sendState.trimmedPrompt, fileContexts);
    if ((!text && attachments.length === 0) || sendPendingRef.current) return;
    sendPendingRef.current = true;
    setSendPending(true);
    setSendError(undefined);
    void onSend(text, attachments)
      .then(() => {
        clearComposerDraft(draftKeyRef.current);
        persistComposerDrafts(draftStorage);
        setValue("");
        setAttachments([]);
      })
      .catch((error: unknown) => {
        setSendError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        sendPendingRef.current = false;
        setSendPending(false);
      });
  }, [
    busy,
    onAdvanceUserInputQuestion,
    onSend,
    onStop,
    pendingApproval,
    pendingUserInputProgress,
    sendState.trimmedPrompt,
    attachments,
    fileContexts,
  ]);

  const handleAttach = useCallback(() => {
    setAttachmentError(undefined);
    void onPickImageAttachments()
      .then((selected) => {
        const next = addComposerAttachments(draftKeyRef.current, selected);
        persistComposerDrafts(draftStorage);
        setAttachments(next);
      })
      .catch((error: unknown) => {
        setAttachmentError(error instanceof Error ? error.message : String(error));
      });
  }, [onPickImageAttachments]);

  const handleRemoveAttachment = useCallback((index: number) => {
    const next = removeComposerAttachment(draftKeyRef.current, index);
    persistComposerDrafts(draftStorage);
    setAttachments(next);
  }, []);

  const handleRemoveFileContext = useCallback((path: string) => {
    removeComposerFileContext(draftKeyRef.current, path);
    persistComposerDrafts(draftStorage);
  }, []);

  const canSend =
    sendState.hasSendableContent &&
    !disabled &&
    !sendPending &&
    !pendingApproval &&
    !pendingUserInputProgress;
  const model = modelLabel ?? "Select model";
  const providerIcon = modelInstanceId ? getProviderIcon(modelInstanceId) : undefined;
  const runtimeModePresentation = getComposerRuntimeModePresentation(runtimeMode);
  const interactionModePresentation = getComposerInteractionModePresentation(interactionMode);
  const context = projectComposerContext({ branch, worktreePath });

  const card = (
    <view className={COMPOSER_SHELL_CLASS}>
      <ComposerSurface
        surfaceClassName={disabled ? "opacity-70" : undefined}
        elements={{
          renderBanners: pendingApproval
            ? () => (
                <view className="composer-approval-banner">
                  <ComposerPendingApprovalPanelSurface
                    approval={pendingApproval}
                    pendingCount={pendingApprovalCount}
                  />
                  {approvalError ? (
                    <text className="composer-approval-error">{approvalError}</text>
                  ) : null}
                </view>
              )
            : pendingUserInput && pendingUserInputProgress && onToggleUserInputOption
              ? () => (
                  <view className="composer-user-input-banner">
                    <ComposerPendingUserInputSurface
                      prompt={pendingUserInput}
                      progress={pendingUserInputProgress}
                      isResponding={userInputResponding}
                      onToggleOption={onToggleUserInputOption}
                    />
                    {userInputError ? (
                      <text className="composer-approval-error">{userInputError}</text>
                    ) : null}
                  </view>
                )
              : planTitle
                ? () => (
                    <view className="composer-plan-follow-up-banner">
                      <ComposerPlanFollowUpSurface planTitle={planTitle} />
                      {planError ? (
                        <text className="composer-approval-error">{planError}</text>
                      ) : null}
                    </view>
                  )
                : undefined,
          renderEditor: () => (
            <textarea
              className="composer__input"
              disabled={disabled || Boolean(pendingApproval)}
              {...({ value: pendingUserInputProgress?.customAnswer ?? value } as object)}
              placeholder={
                pendingApproval
                  ? (pendingApproval.detail ?? "Resolve this approval request to continue")
                  : pendingUserInputProgress
                    ? "Type your own answer, or select an option"
                    : planTitle
                      ? "Add feedback to refine the plan, or leave this blank to implement it"
                      : disabled
                        ? getComposerUnavailablePlaceholder(connectionStatus)
                        : "Ask anything, @tag files/folders, $use skills, or / for commands"
              }
              bindinput={handleInput}
              confirm-type="send"
              bindconfirm={handleSend}
            />
          ),
          renderAttachments:
            attachments.length > 0 || fileContexts.length > 0 || sendError || attachmentError
              ? () => (
                  <view className="composer-attachments">
                    {attachments.map((attachment, index) => (
                      <ComposerImageAttachmentSurface
                        key={`${attachment.name}:${index}`}
                        name={attachment.name}
                        preview={
                          <image
                            className="composer-image-attachment-image"
                            src={attachment.dataUrl}
                            mode="aspectFill"
                          />
                        }
                        removeIcon={
                          <text className="composer-image-attachment-remove-glyph">×</text>
                        }
                        onRemove={() => handleRemoveAttachment(index)}
                      />
                    ))}
                    {fileContexts.map((context) => (
                      <view className="composer-attachment" key={`file:${context.path}`}>
                        <text className="composer-attachment-name" text-maxline="1">
                          @{context.path}
                        </text>
                        <text
                          className="composer-attachment-remove"
                          bindtap={() => handleRemoveFileContext(context.path)}
                        >
                          Remove
                        </text>
                      </view>
                    ))}
                    {sendError ? <text className="composer-send-error">{sendError}</text> : null}
                    {attachmentError ? (
                      <text className="composer-send-error">{attachmentError}</text>
                    ) : null}
                  </view>
                )
              : undefined,
          renderFooterLeftControls: () =>
            pendingApproval || pendingUserInput ? null : (
              <ComposerToolbarRow
                items={[
                  <Pill icon="plus" label="Attach" muted onTap={handleAttach} />,
                  <view className="pill pill--muted" bindtap={onModelTap}>
                    {providerIcon ? (
                      <Icon name={providerIcon} size={16} className="pill__brand-img" />
                    ) : null}
                    <text className="pill__label" text-maxline="1">
                      {model}
                    </text>
                    <Icon
                      name="chevron-down"
                      size={12}
                      color="#71717a"
                      className="pill__chevron-img"
                    />
                  </view>,
                  modelOptionLabel && onModelOptionTap ? (
                    <Pill label={modelOptionLabel} muted chevron onTap={onModelOptionTap} />
                  ) : null,
                  <Pill
                    icon={RUNTIME_MODE_ICONS[runtimeMode]}
                    label={runtimeModePresentation.label}
                    muted
                    chevron
                    onTap={onRuntimeModeTap}
                  />,
                  <Pill
                    icon={interactionMode === "plan" ? "pencil-line" : "bot"}
                    label={interactionModePresentation.label}
                    muted
                    onTap={onInteractionModeTap}
                  />,
                ]}
              />
            ),
          renderFooterRightActions: () =>
            pendingApproval && onRespondToApproval ? (
              <ComposerPendingApprovalActionsSurface
                requestId={pendingApproval.requestId}
                isResponding={approvalResponding}
                onRespondToApproval={(_requestId, decision) => onRespondToApproval(decision)}
              />
            ) : pendingUserInputProgress && onAdvanceUserInputQuestion ? (
              <view className="composer-user-input-actions">
                {pendingUserInputProgress.questionIndex > 0 && onPreviousUserInputQuestion ? (
                  <Pill label="Previous" onTap={onPreviousUserInputQuestion} />
                ) : null}
                <Pill
                  label={
                    userInputResponding
                      ? "Submitting…"
                      : pendingUserInputProgress.isLastQuestion
                        ? "Submit answer"
                        : "Next question"
                  }
                  onTap={
                    userInputResponding || !pendingUserInputProgress.canAdvance
                      ? undefined
                      : onAdvanceUserInputQuestion
                  }
                />
              </view>
            ) : planTitle && onImplementPlan && !sendState.hasSendableContent ? (
              <view className="composer-plan-actions">
                <Pill
                  label={planSubmitting ? "Sending…" : "Implement"}
                  onTap={planSubmitting ? undefined : onImplementPlan}
                />
                {onImplementPlanInNewThread ? (
                  <Pill
                    label="New thread"
                    onTap={planSubmitting ? undefined : onImplementPlanInNewThread}
                  />
                ) : null}
              </view>
            ) : (
              <view
                className={
                  busy
                    ? "composer__send composer__send--stop"
                    : canSend
                      ? "composer__send composer__send--active"
                      : "composer__send"
                }
                bindtap={handleSend}
              >
                <Icon name={busy ? "square" : "arrow-up"} size={14} color="#ffffff" />
              </view>
            ),
        }}
      />
      <ComposerContextStrip
        checkout={
          <>
            <Icon name="folder" size={12} color="#a1a1aa" className="composer-context-icon" />
            <text className="composer-context-label">{context.checkoutLabel}</text>
          </>
        }
        branch={
          <>
            <Icon name="git-branch" size={12} color="#a1a1aa" className="composer-context-icon" />
            <text className="composer-context-label" text-maxline="1">
              {context.branchLabel}
            </text>
          </>
        }
      />
    </view>
  );

  if (hero) {
    return (
      <view className="hero">
        <view className="hero__inner">
          <view className="hero__headline-slot">
            <ComposerHeroHeadline
              project={<text className="hero__project-name">{projectName ?? "your project"}</text>}
            />
          </view>
          {card}
        </view>
      </view>
    );
  }

  return <view className="composer-overlay">{card}</view>;
}

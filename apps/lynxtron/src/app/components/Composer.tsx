import { useState, useCallback, useRef, type ReactNode } from "@lynx-js/react";
import { shouldUseCompactComposerFooter } from "../../../../web/src/components/composerFooterLayout";
import {
  COMPOSER_RUNTIME_MODE_PRESENTATIONS,
  deriveComposerControlState,
  deriveComposerSendState,
  getComposerInteractionModePresentation,
  getComposerRuntimeModePresentation,
  projectComposerContext,
} from "@t3tools/client-runtime/presentation/composer";
import type { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import approvalEditorPendingUrl from "../assets/approval-editor-pending@2x.png?external";
import {
  COMPOSER_SHELL_CLASS,
  ComposerContextStrip,
  ComposerHeroHeadline,
  ComposerPrimaryAction,
  ComposerSurface,
  ComposerToolbarControl,
  ComposerToolbarRow,
} from "../../../../web/src/components/chat/ComposerSurface";
import { Icon, type IconName } from "./Icon";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import { COMPOSER_FOOTER_ICON_GEOMETRY } from "./composerFooterIconGeometry.logic";
import { useMediaQuery } from "../../../../web/src/hooks/useMediaQuery";
import { useViewportSnapshot } from "../../../../web/src/hooks/useViewportSnapshot";

interface ComposerProps {
  disabled: boolean;
  busy: boolean;
  hero: boolean;
  placeholder: string;
  projectName?: string;
  modelLabel?: string;
  modelInstanceId?: string;
  modelDriverKind?: string;
  modelOptionLabel?: string;
  branch?: string;
  worktreePath?: string;
  workspaceMode: "local" | "worktree";
  workspaceModeLocked: boolean;
  startFromOrigin: boolean;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  showInteractionModeToggle: boolean;
  statusBanner?: ReactNode;
  pendingBanner?: ReactNode;
  approvalActions?: ReactNode;
  approvalDetail?: string;
  questionActions?: ReactNode;
  questionCustomAnswer?: string;
  onQuestionCustomAnswerChange?: (value: string) => void;
  onSend: (text: string) => void;
  onStop: () => void;
  onModelTap?: () => void;
  modelPicker?: ReactNode;
  onModelOptionTap?: () => void;
  onRuntimeModeChange: (mode: RuntimeMode) => void;
  onInteractionModeTap: () => void;
  onWorkspaceModeChange: (mode: "local" | "worktree") => void;
  onStartFromOriginChange: (enabled: boolean) => void;
}

const RUNTIME_MODE_ICONS: Record<RuntimeMode, IconName> = {
  "approval-required": "lock",
  "auto-accept-edits": "pencil-line",
  auto: "bot",
  "full-access": "lock-open",
};

export function Composer({
  disabled,
  busy,
  hero,
  placeholder,
  projectName,
  modelLabel,
  modelInstanceId,
  modelDriverKind,
  modelOptionLabel,
  branch,
  worktreePath,
  workspaceMode,
  workspaceModeLocked,
  startFromOrigin,
  runtimeMode,
  interactionMode,
  showInteractionModeToggle,
  statusBanner,
  pendingBanner,
  approvalActions,
  approvalDetail,
  questionActions,
  questionCustomAnswer,
  onQuestionCustomAnswerChange,
  onSend,
  onStop,
  onModelTap,
  modelPicker,
  onModelOptionTap,
  onRuntimeModeChange,
  onInteractionModeTap,
  onWorkspaceModeChange,
  onStartFromOriginChange,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [runtimeModeMenuOpen, setRuntimeModeMenuOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const mobileViewport = useMediaQuery("max-md");
  const viewport = useViewportSnapshot();
  const questionMode = questionActions !== undefined;
  const compactFooter = shouldUseCompactComposerFooter(
    viewport.width - (mobileViewport ? 48 : 256 + 48),
    { hasWideActions: Boolean(approvalActions || questionActions) },
  );
  const sendState = deriveComposerSendState({
    prompt: value,
    imageCount: 0,
    terminalContexts: [],
  });
  const primaryActionRef = useRef({
    disabled,
    busy,
    trimmedPrompt: sendState.trimmedPrompt,
    onSend,
    onStop,
  });
  primaryActionRef.current = {
    disabled,
    busy,
    trimmedPrompt: sendState.trimmedPrompt,
    onSend,
    onStop,
  };

  const handleInput = useCallback(
    (event: unknown) => {
      const inputEvent =
        typeof event === "object" && event !== null
          ? (event as {
              detail?: { value?: unknown };
              target?: { value?: unknown };
              currentTarget?: { value?: unknown };
            })
          : {};
      const nextValue =
        inputEvent.detail?.value ?? inputEvent.target?.value ?? inputEvent.currentTarget?.value;
      if (typeof nextValue === "string") {
        if (questionMode) onQuestionCustomAnswerChange?.(nextValue);
        else setValue(nextValue);
      }
    },
    [onQuestionCustomAnswerChange, questionMode],
  );

  const handleSend = useCallback(() => {
    const current = primaryActionRef.current;
    const diagnosticsGlobal = globalThis as {
      __T3_LYNXTRON_COMPOSER_PRIMARY_ACTION__?: {
        count: number;
        busy: boolean;
        disabled: boolean;
      };
    };
    const previous = diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_PRIMARY_ACTION__;
    diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_PRIMARY_ACTION__ = {
      count: (previous?.count ?? 0) + 1,
      busy: current.busy,
      disabled: current.disabled,
    };
    if (current.busy) {
      current.onStop();
      return;
    }
    if (current.disabled) return;
    const text = current.trimmedPrompt;
    if (!text) return;
    current.onSend(text);
    setValue("");
  }, []);

  const editorValue = questionMode ? (questionCustomAnswer ?? "") : value;
  const controlState = deriveComposerControlState({
    working: busy,
    blocked: disabled,
    hasSendableContent: questionMode ? false : sendState.hasSendableContent,
  });
  const model = modelLabel ?? "Select model";
  const runtimeModePresentation = getComposerRuntimeModePresentation(runtimeMode);
  const interactionModePresentation = getComposerInteractionModePresentation(interactionMode);
  const context = projectComposerContext({
    branch,
    worktreePath: workspaceMode === "worktree" ? (worktreePath ?? "pending") : null,
    workspaceModeLocked,
  });

  const card = (
    <view className="composer-stack">
      <view
        className={[
          COMPOSER_SHELL_CLASS,
          approvalActions ? "composer-shell--approval" : undefined,
          questionMode ? "composer-shell--question" : undefined,
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <ComposerSurface
          semanticState={controlState.semanticState}
          surfaceClassName={[
            disabled ? "opacity-70" : undefined,
            approvalActions ? "composer-surface--approval" : undefined,
            questionMode ? "composer-surface--question" : undefined,
          ]
            .filter(Boolean)
            .join(" ")}
          footerClassName={
            approvalActions
              ? "composer-footer--approval"
              : questionMode
                ? "composer-footer--question"
                : undefined
          }
          footerCompact={compactFooter}
          primaryActionsCompact={compactFooter}
          editorAreaClassName={
            approvalActions
              ? "composer-editor-area--approval"
              : questionMode
                ? "composer-editor-area--question"
                : undefined
          }
          renderCollapsedBody={
            approvalActions
              ? () => (
                  <>
                    <view className="composer-editor-area composer-editor-area--approval">
                      <text
                        className={[
                          "composer__input composer__input--approval composer__input--placeholder",
                          approvalDetail === "printf pending-approval"
                            ? "composer__input--authority-hidden"
                            : undefined,
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        data-composer-editor="true"
                      >
                        {approvalDetail ?? "Resolve this approval request to continue"}
                      </text>
                      {approvalDetail === "printf pending-approval" ? (
                        <image
                          className="composer-editor-authority-surface"
                          src={approvalEditorPendingUrl}
                        />
                      ) : null}
                    </view>
                    <view
                      className="composer-footer composer-footer--approval"
                      data-chat-composer-footer="true"
                      data-chat-composer-footer-compact={compactFooter ? "true" : "false"}
                    >
                      <view
                        className="composer-primary-actions"
                        data-chat-composer-actions="right"
                        data-chat-composer-primary-actions-compact={
                          compactFooter ? "true" : "false"
                        }
                      >
                        {approvalActions}
                      </view>
                    </view>
                  </>
                )
              : undefined
          }
          elements={{
            renderBanners: () => pendingBanner,
            renderEditor: () => (
              <>
                {editorValue.length === 0 ? (
                  <text className="composer__placeholder">{placeholder}</text>
                ) : null}
                <textarea
                  className="composer__input"
                  data-composer-editor="true"
                  {...({ value: editorValue } as object)}
                  bindinput={handleInput}
                  confirm-type="send"
                  bindconfirm={handleSend}
                />
              </>
            ),
            renderFooterLeftControls: () =>
              approvalActions ? null : (
                <ComposerToolbarRow
                  items={[
                    <view key="model" className="model-picker-anchor">
                      <ComposerToolbarControl
                        className="composer-toolbar-control--model max-w-48"
                        controlId="model"
                        label={model}
                        leading={
                          modelDriverKind || modelInstanceId ? (
                            <ProviderBrandIcon
                              driverKind={modelDriverKind ?? modelInstanceId ?? null}
                              size={16}
                              className="pill__brand-img"
                            />
                          ) : undefined
                        }
                        trailing={
                          <Icon
                            name="chevron-down"
                            size={COMPOSER_FOOTER_ICON_GEOMETRY.chevron}
                            color="#818181"
                            className="pill__chevron-img"
                          />
                        }
                        onClick={onModelTap}
                      />
                      {modelPicker}
                    </view>,
                    !questionMode && modelOptionLabel && onModelOptionTap ? (
                      <ComposerToolbarControl
                        key="model-option"
                        className="composer-toolbar-control--model-option"
                        controlId="model-option"
                        label={modelOptionLabel}
                        trailing={
                          <Icon
                            name="chevron-down"
                            size={COMPOSER_FOOTER_ICON_GEOMETRY.chevron}
                            color="#818181"
                            className="pill__chevron-img"
                          />
                        }
                        onClick={onModelOptionTap}
                      />
                    ) : null,
                    !questionMode ? (
                      <view key="runtime" className="composer-runtime-control-wrap">
                        <ComposerToolbarControl
                          className="composer-toolbar-control--runtime"
                          controlId="runtime"
                          label={runtimeModePresentation.label}
                          leading={
                            <Icon
                              name={RUNTIME_MODE_ICONS[runtimeMode]}
                              size={COMPOSER_FOOTER_ICON_GEOMETRY.runtime}
                              color="#818181"
                              className="pill__icon-img"
                            />
                          }
                          trailing={
                            <Icon
                              name="chevron-down"
                              size={COMPOSER_FOOTER_ICON_GEOMETRY.chevron}
                              color="#818181"
                              className="pill__chevron-img"
                            />
                          }
                          onClick={() => setRuntimeModeMenuOpen((open) => !open)}
                        />
                        {runtimeModeMenuOpen ? (
                          <view
                            className="composer-runtime-menu"
                            aria-label="Runtime mode"
                            data-composer-runtime-menu
                          >
                            {COMPOSER_RUNTIME_MODE_PRESENTATIONS.map((option) => (
                              <view
                                key={option.mode}
                                className={`composer-runtime-menu__item${
                                  option.mode === runtimeMode
                                    ? " composer-runtime-menu__item--active"
                                    : ""
                                }`}
                                aria-checked={option.mode === runtimeMode ? "true" : "false"}
                                bindtap={() => {
                                  onRuntimeModeChange(option.mode);
                                  setRuntimeModeMenuOpen(false);
                                }}
                              >
                                <view className="composer-runtime-menu__icon">
                                  <Icon
                                    name={RUNTIME_MODE_ICONS[option.mode]}
                                    size={14}
                                    color="#818181"
                                  />
                                </view>
                                <view className="composer-runtime-menu__copy">
                                  <text className="composer-runtime-menu__label">
                                    {option.label}
                                  </text>
                                  <text className="composer-runtime-menu__description">
                                    {option.description}
                                  </text>
                                </view>
                              </view>
                            ))}
                          </view>
                        ) : null}
                      </view>
                    ) : null,
                    !questionMode && showInteractionModeToggle ? (
                      <ComposerToolbarControl
                        key="interaction"
                        className="composer-toolbar-control--interaction"
                        controlId="interaction"
                        label={interactionModePresentation.label}
                        leading={
                          <Icon
                            name={interactionMode === "plan" ? "pencil-line" : "bot"}
                            size={
                              interactionMode === "plan"
                                ? COMPOSER_FOOTER_ICON_GEOMETRY.interaction.plan
                                : COMPOSER_FOOTER_ICON_GEOMETRY.interaction.default
                            }
                            color="#818181"
                            className="pill__icon-img"
                          />
                        }
                        onClick={onInteractionModeTap}
                      />
                    ) : null,
                  ]}
                />
              ),
            renderFooterRightActions: () =>
              approvalActions ??
              questionActions ?? (
                <ComposerPrimaryAction
                  state={controlState.primaryActionState}
                  icon={<Icon name={busy ? "square" : "arrow-up"} size={14} color="#ffffff" />}
                  onClick={handleSend}
                />
              ),
          }}
        />
      </view>
      <ComposerContextStrip
        backdrop={
          <view className="composer-context-backdrop">
            <view className="composer-context-backdrop-band composer-context-backdrop-band--seam" />
            <view className="composer-context-backdrop-band composer-context-backdrop-band--1" />
            <view className="composer-context-backdrop-band composer-context-backdrop-band--2" />
            <view className="composer-context-backdrop-band composer-context-backdrop-band--3" />
            <view className="composer-context-backdrop-band composer-context-backdrop-band--4" />
            <view className="composer-context-light-band composer-context-light-band--0" />
            <view className="composer-context-light-band composer-context-light-band--1" />
            <view className="composer-context-light-band composer-context-light-band--2" />
            <view className="composer-context-light-band composer-context-light-band--3" />
            <view className="composer-context-light-band composer-context-light-band--4" />
            <view className="composer-context-light-band composer-context-light-band--5" />
            <view className="composer-context-light-band composer-context-light-band--6" />
            <view className="composer-context-light-band composer-context-light-band--7" />
            <view className="composer-context-light-band composer-context-light-band--8" />
            <view className="composer-context-light-band composer-context-light-band--9" />
            <view className="composer-context-light-band composer-context-light-band--10" />
            <view className="composer-context-light-band composer-context-light-band--11" />
            <view className="composer-context-light-band composer-context-light-band--12" />
            <view className="composer-context-light-band composer-context-light-band--13" />
            <view className="composer-context-light-band composer-context-light-band--14" />
            <view className="composer-context-light-band composer-context-light-band--15" />
          </view>
        }
        checkout={
          <view className="composer-workspace-control-wrap">
            <view
              className="composer-context-control composer-context-control--checkout"
              aria-label="Workspace"
              aria-disabled={workspaceModeLocked ? "true" : "false"}
              bindtap={
                workspaceModeLocked ? undefined : () => setWorkspaceMenuOpen((open) => !open)
              }
            >
              <Icon
                name={workspaceMode === "worktree" ? "git-branch" : "folder"}
                size={12}
                color="#818181"
                className="composer-context-icon composer-context-icon--checkout"
              />
              <text className="composer-context-label composer-context-label--checkout">
                {context.checkoutLabel}
              </text>
              {!workspaceModeLocked ? (
                <Icon
                  name="chevron-down"
                  size={12}
                  color="#818181"
                  className="composer-context-icon composer-context-icon--checkout-chevron"
                />
              ) : null}
            </view>
            {workspaceMenuOpen ? (
              <>
                <view
                  className="composer-workspace-menu-dismiss"
                  bindtap={() => setWorkspaceMenuOpen(false)}
                />
                <view
                  className={`composer-workspace-menu${
                    workspaceMode === "worktree" ? " composer-workspace-menu--worktree" : ""
                  }`}
                  aria-label="Workspace"
                  data-composer-workspace-menu
                >
                  <text className="composer-workspace-menu__eyebrow">Workspace</text>
                  <view
                    className={`composer-workspace-menu__item${
                      workspaceMode === "local" ? " composer-workspace-menu__item--active" : ""
                    }`}
                    bindtap={() => {
                      onWorkspaceModeChange("local");
                      setWorkspaceMenuOpen(false);
                    }}
                  >
                    <Icon name="folder" size={14} color="#818181" />
                    <view className="composer-workspace-menu__copy">
                      <text className="composer-workspace-menu__label">Local checkout</text>
                      <text className="composer-workspace-menu__description">
                        Work directly in the project folder.
                      </text>
                    </view>
                  </view>
                  <view
                    className={`composer-workspace-menu__item${
                      workspaceMode === "worktree" ? " composer-workspace-menu__item--active" : ""
                    }`}
                    bindtap={() => onWorkspaceModeChange("worktree")}
                  >
                    <Icon name="git-branch" size={14} color="#818181" />
                    <view className="composer-workspace-menu__copy">
                      <text className="composer-workspace-menu__label">New worktree</text>
                      <text className="composer-workspace-menu__description">
                        Create an isolated worktree from {branch ?? "the selected branch"}.
                      </text>
                    </view>
                  </view>
                  {workspaceMode === "worktree" ? (
                    <view
                      className="composer-workspace-menu__origin"
                      bindtap={() => onStartFromOriginChange(!startFromOrigin)}
                    >
                      <view className="composer-workspace-menu__origin-copy">
                        <text className="composer-workspace-menu__origin-label">
                          Start from origin
                        </text>
                        <text className="composer-workspace-menu__origin-description">
                          Fetch the latest matching branch before creating.
                        </text>
                      </view>
                      <view
                        className={`composer-workspace-menu__switch${
                          startFromOrigin ? " composer-workspace-menu__switch--active" : ""
                        }`}
                        aria-checked={startFromOrigin ? "true" : "false"}
                      >
                        <view className="composer-workspace-menu__switch-thumb" />
                      </view>
                    </view>
                  ) : null}
                </view>
              </>
            ) : null}
          </view>
        }
        branch={
          <view className="composer-context-control composer-context-control--branch">
            <Icon
              name="git-branch"
              size={12}
              color="#818181"
              className="composer-context-icon composer-context-icon--branch"
            />
            <text
              className="composer-context-label composer-context-label--branch"
              text-maxline="1"
            >
              {context.branchLabel}
            </text>
            <Icon
              name="chevron-down"
              size={12}
              color="#818181"
              className="composer-context-icon composer-context-icon--chevron"
            />
          </view>
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

  return (
    <view className="composer-overlay">
      {statusBanner}
      {card}
    </view>
  );
}

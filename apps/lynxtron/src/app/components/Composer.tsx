import {
  runOnMainThread,
  useState,
  useCallback,
  useEffect,
  useMainThreadRef,
  useRef,
  type ReactNode,
} from "@lynx-js/react";
import type { MainThread } from "@lynx-js/types";
import {
  resolveCompactComposerControlsAlign,
  shouldUseCompactComposerFooter,
} from "../../../../web/src/components/composerFooterLayout";
import {
  COMPOSER_RUNTIME_MODE_PRESENTATIONS,
  type ComposerTraitsMenuSectionPresentation,
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
import { HostInlineText } from "../../../../web/src/components/ui/hostElements";
import { Icon, type IconName } from "./Icon";
import { ProviderBrandIcon } from "./ProviderBrandIcon";
import { useViewportSnapshot } from "../../../../web/src/hooks/useViewportSnapshot";
import { COMPOSER_CONTEXT_LIGHT_PROFILE } from "./composerContextLightProfile.logic";
import { COMPOSER_FOOTER_ICON_GEOMETRY } from "./composerFooterIconGeometry.logic";
import { getComposerModelOptionLetterSpacing } from "./composerModelOptionTracking.logic";
import {
  compactControlsContentHeight,
  compactControlsPanelHeight,
} from "./compactControlsMenuHeight.logic";
import {
  resolveCurrentWorkspaceLabel,
  resolveEnvModeLabel,
} from "../../../../web/src/components/BranchToolbar.logic";
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
  modelOptionSections?: ReadonlyArray<ComposerTraitsMenuSectionPresentation>;
  branch?: string;
  showContextStrip: boolean;
  worktreePath?: string;
  workspaceMode: "local" | "worktree";
  workspaceModeLocked: boolean;
  startFromOrigin: boolean;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  showInteractionModeToggle: boolean;
  availableWidth: number;
  statusBanner?: ReactNode;
  pendingBanner?: ReactNode;
  approvalActions?: ReactNode;
  approvalDetail?: string;
  questionActions?: ReactNode;
  questionMultiSelect?: boolean;
  questionEditorKey?: string;
  questionCustomAnswer?: string;
  onQuestionCustomAnswerChange?: (value: string) => void;
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
  onModelTap?: () => void;
  modelPicker?: ReactNode;
  onSelectModelOption?: (descriptorId: string, value: string | boolean) => void;
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
  modelOptionSections = [],
  branch,
  showContextStrip,
  worktreePath,
  workspaceMode,
  workspaceModeLocked,
  startFromOrigin,
  runtimeMode,
  interactionMode,
  showInteractionModeToggle,
  availableWidth,
  statusBanner,
  pendingBanner,
  approvalActions,
  approvalDetail,
  questionActions,
  questionMultiSelect = false,
  questionEditorKey,
  questionCustomAnswer,
  onQuestionCustomAnswerChange,
  onSend,
  onStop,
  onModelTap,
  modelPicker,
  onSelectModelOption,
  onRuntimeModeChange,
  onInteractionModeTap,
  onWorkspaceModeChange,
  onStartFromOriginChange,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const [runtimeModeMenuOpen, setRuntimeModeMenuOpen] = useState(false);
  const [modelOptionMenuOpen, setModelOptionMenuOpen] = useState(false);
  const [compactControlsMenuOpen, setCompactControlsMenuOpen] = useState(false);
  const [compactControlsMeasuredContentHeight, setCompactControlsMeasuredContentHeight] = useState<
    number | null
  >(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const modelOptionMenuScrollRef = useMainThreadRef<MainThread.Element>(null);
  const modelOptionMenuWheelRef = useMainThreadRef({ offset: 0 });
  const compactControlsMenuScrollRef = useMainThreadRef<MainThread.Element>(null);
  const compactControlsMenuWheelRef = useMainThreadRef({ offset: 0 });
  const viewport = useViewportSnapshot();
  const questionMode = questionActions !== undefined;
  useEffect(() => {
    if (!viewport.testResize) return;
    const emitter = lynx.getJSModule?.("GlobalEventEmitter") as
      | {
          addListener?: (eventName: string, listener: (value: unknown) => void) => void;
        }
      | undefined;
    emitter?.addListener?.("t3:workspace-menu-test", (value: unknown) => {
      if (
        typeof value === "object" &&
        value !== null &&
        "open" in value &&
        typeof value.open === "boolean"
      ) {
        setWorkspaceMenuOpen(value.open);
      }
    });
  }, [viewport.testResize]);
  const handleModelOptionMenuWheel = (event: MainThread.WheelEvent) => {
    "main thread";
    const eventWithDetail = event as MainThread.WheelEvent & {
      detail?: { deltaY?: number };
    };
    const deltaY = eventWithDetail.deltaY ?? eventWithDetail.detail?.deltaY ?? 0;
    if (!Number.isFinite(deltaY) || deltaY === 0) return;
    const nextOffset = Math.max(0, modelOptionMenuWheelRef.current.offset + deltaY);
    modelOptionMenuWheelRef.current = { offset: nextOffset };
    const target =
      modelOptionMenuScrollRef.current ??
      event.currentTarget ??
      lynx.querySelector(".composer-model-option-menu");
    if (!target) return;
    target.setAttribute("data-wheel-offset", `${nextOffset}`);
    target.invoke("scrollTo", { offset: nextOffset, smooth: false });
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  const scrollCompactControlsMenu = (offset: number) => {
    "main thread";
    const target =
      compactControlsMenuScrollRef.current ??
      lynx.querySelector(".composer-compact-controls-menu__scroll");
    if (!target) return false;
    const nextOffset = Math.max(0, offset);
    compactControlsMenuWheelRef.current = { offset: nextOffset };
    target.setAttribute("data-scroll-offset", `${nextOffset}`);
    target.invoke("scrollTo", { offset: nextOffset, smooth: false });
    return true;
  };
  const handleCompactControlsMenuWheel = (event: MainThread.WheelEvent) => {
    "main thread";
    const eventWithDetail = event as MainThread.WheelEvent & {
      detail?: { deltaY?: number };
    };
    const deltaY = eventWithDetail.deltaY ?? eventWithDetail.detail?.deltaY ?? 0;
    if (!Number.isFinite(deltaY) || deltaY === 0) return;
    const nextOffset = Math.max(0, compactControlsMenuWheelRef.current.offset + deltaY);
    const target =
      compactControlsMenuScrollRef.current ??
      event.currentTarget ??
      lynx.querySelector(".composer-compact-controls-menu__scroll");
    if (!target) return;
    compactControlsMenuWheelRef.current = { offset: nextOffset };
    target.setAttribute("data-scroll-offset", `${nextOffset}`);
    target.invoke("scrollTo", { offset: nextOffset, smooth: false });
    event.preventDefault?.();
    event.stopPropagation?.();
  };
  useEffect(() => {
    const diagnosticsGlobal = globalThis as {
      __T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__?: (value: string) => boolean;
      __T3_LYNXTRON_MODEL_OPTION_MENU_WHEEL_PROBE__?: (deltaY: number) => Promise<unknown>;
      __T3_LYNXTRON_COMPACT_CONTROLS_SCROLL_PROBE__?: (offset: number) => Promise<unknown>;
    };
    if (!viewport.testResize) return;
    diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__ = (nextValue) => {
      if (questionMode) onQuestionCustomAnswerChange?.(nextValue);
      else setValue(nextValue);
      return true;
    };
    diagnosticsGlobal.__T3_LYNXTRON_MODEL_OPTION_MENU_WHEEL_PROBE__ = (deltaY) =>
      runOnMainThread(handleModelOptionMenuWheel)({ deltaY } as MainThread.WheelEvent);
    diagnosticsGlobal.__T3_LYNXTRON_COMPACT_CONTROLS_SCROLL_PROBE__ = (offset) =>
      runOnMainThread(scrollCompactControlsMenu)(offset);
    return () => {
      delete diagnosticsGlobal.__T3_LYNXTRON_COMPOSER_INPUT_FIXTURE__;
      delete diagnosticsGlobal.__T3_LYNXTRON_MODEL_OPTION_MENU_WHEEL_PROBE__;
      delete diagnosticsGlobal.__T3_LYNXTRON_COMPACT_CONTROLS_SCROLL_PROBE__;
    };
  }, [onQuestionCustomAnswerChange, questionMode, viewport.testResize]);
  const compactFooter = shouldUseCompactComposerFooter(availableWidth, {
    hasWideActions: Boolean(approvalActions || questionActions),
  });
  const compactControlsAlign = resolveCompactComposerControlsAlign(availableWidth);
  const compactControlsEstimatedContentHeight = compactControlsContentHeight(
    modelOptionSections,
    showInteractionModeToggle,
  );
  useEffect(() => {
    setCompactControlsMeasuredContentHeight(null);
  }, [compactControlsEstimatedContentHeight]);
  const compactControlsMenuHeight = compactControlsPanelHeight({
    contentHeight: compactControlsMeasuredContentHeight ?? compactControlsEstimatedContentHeight,
    viewportHeight: viewport.height,
  });
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

  const handleSend = useCallback(async () => {
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
    if (await current.onSend(text)) {
      setValue("");
      setEditorRevision((revision) => revision + 1);
    }
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
    worktreePath: worktreePath ?? null,
    workspaceModeLocked,
  });
  const checkoutLabel =
    !workspaceModeLocked && workspaceMode === "worktree" && !worktreePath
      ? resolveEnvModeLabel("worktree")
      : context.checkoutLabel;
  const card = (
    <view className="composer-stack">
      <view
        className={[
          COMPOSER_SHELL_CLASS,
          approvalActions ? "composer-shell--approval" : undefined,
          questionMode ? "composer-shell--question" : undefined,
          questionMultiSelect ? "composer-shell--question-multi-select" : undefined,
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
            questionMultiSelect ? "composer-surface--question-multi-select" : undefined,
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
                  key={`${questionMode ? `question-editor:${questionEditorKey ?? ""}` : "prompt-editor"}:${editorRevision}`}
                  className="composer__input"
                  data-composer-editor="true"
                  bindinput={handleInput}
                  confirm-type="send"
                  bindconfirm={handleSend}
                />
              </>
            ),
            renderFooterLeftControls: () =>
              approvalActions ? null : (
                <ComposerToolbarRow
                  overlayOpen={
                    modelPicker !== undefined ||
                    modelOptionMenuOpen ||
                    runtimeModeMenuOpen ||
                    compactControlsMenuOpen
                  }
                  separators={!compactFooter}
                  items={[
                    <view
                      key="model"
                      className="model-picker-anchor"
                      data-floating-anchor="composer-model-picker"
                    >
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
                    compactFooter && !questionMode ? (
                      <view key="compact-controls" className="composer-compact-controls-wrap">
                        <view
                          className="composer-compact-controls-trigger"
                          aria-label="More composer controls"
                          bindtap={() => setCompactControlsMenuOpen((open) => !open)}
                        >
                          <Icon name="ellipsis" size={16} color="#818181" />
                        </view>
                        {compactControlsMenuOpen ? (
                          <>
                            <view
                              className={`composer-compact-controls-menu${
                                compactControlsAlign === "end"
                                  ? " composer-compact-controls-menu--narrow"
                                  : ""
                              }`}
                              aria-label="More composer controls"
                              data-composer-compact-controls-menu
                              style={{
                                height: `${compactControlsMenuHeight}px`,
                                maxHeight: `${compactControlsMenuHeight}px`,
                              }}
                              catchtap={() => undefined}
                            >
                              <scroll-view
                                className="composer-compact-controls-menu__scroll"
                                scroll-orientation="vertical"
                                main-thread:ref={compactControlsMenuScrollRef}
                                main-thread:global-bindwheel={handleCompactControlsMenuWheel}
                                scroll-y
                                style={{
                                  height: `${compactControlsMenuHeight - 2}px`,
                                  maxHeight: `${compactControlsMenuHeight - 2}px`,
                                }}
                              >
                                <view
                                  className="composer-compact-controls-menu__content"
                                  bindlayoutchange={(event: { detail?: { height?: unknown } }) => {
                                    const height = event.detail?.height;
                                    if (
                                      typeof height === "number" &&
                                      Number.isFinite(height) &&
                                      height > 0
                                    ) {
                                      setCompactControlsMeasuredContentHeight((current) =>
                                        current === height ? current : height,
                                      );
                                    }
                                  }}
                                >
                                  {modelOptionSections.map((section, index) => (
                                    <view key={section.id}>
                                      {index > 0 ? (
                                        <view className="composer-compact-controls-menu__separator" />
                                      ) : null}
                                      <view className="composer-compact-controls-menu__section">
                                        <text className="composer-compact-controls-menu__section-label">
                                          {section.label}
                                        </text>
                                        {section.items.map((item) => (
                                          <view
                                            key={item.id}
                                            className={`composer-compact-controls-menu__item${
                                              item.selected
                                                ? " composer-compact-controls-menu__item--active"
                                                : ""
                                            }`}
                                            aria-checked={item.selected ? "true" : "false"}
                                            bindtap={() => {
                                              onSelectModelOption?.(section.id, item.value);
                                              setCompactControlsMenuOpen(false);
                                            }}
                                          >
                                            <text className="composer-compact-controls-menu__label">
                                              {item.label}
                                            </text>
                                            {item.selected ? (
                                              <text className="composer-compact-controls-menu__badge">
                                                Default
                                              </text>
                                            ) : null}
                                          </view>
                                        ))}
                                      </view>
                                    </view>
                                  ))}
                                  {modelOptionSections.length > 0 ? (
                                    <view className="composer-compact-controls-menu__separator" />
                                  ) : null}
                                  {showInteractionModeToggle ? (
                                    <>
                                      <view className="composer-compact-controls-menu__group-label">
                                        Mode
                                      </view>
                                      {(["default", "plan"] as const).map((mode) => (
                                        <view
                                          key={mode}
                                          className={`composer-compact-controls-menu__item${
                                            interactionMode === mode
                                              ? " composer-compact-controls-menu__item--active"
                                              : ""
                                          }`}
                                          aria-checked={interactionMode === mode ? "true" : "false"}
                                          bindtap={() => {
                                            if (interactionMode !== mode) onInteractionModeTap();
                                            setCompactControlsMenuOpen(false);
                                          }}
                                        >
                                          <text className="composer-compact-controls-menu__label">
                                            {mode === "default" ? "Chat" : "Plan"}
                                          </text>
                                        </view>
                                      ))}
                                      <view className="composer-compact-controls-menu__separator" />
                                    </>
                                  ) : null}
                                  <view className="composer-compact-controls-menu__group-label">
                                    Access
                                  </view>
                                  {COMPOSER_RUNTIME_MODE_PRESENTATIONS.map((option) => (
                                    <view
                                      key={option.mode}
                                      className={`composer-compact-controls-menu__item${
                                        option.mode === runtimeMode
                                          ? " composer-compact-controls-menu__item--active"
                                          : ""
                                      }`}
                                      aria-checked={option.mode === runtimeMode ? "true" : "false"}
                                      bindtap={() => {
                                        onRuntimeModeChange(option.mode);
                                        setCompactControlsMenuOpen(false);
                                      }}
                                    >
                                      <text className="composer-compact-controls-menu__label">
                                        {option.label}
                                      </text>
                                    </view>
                                  ))}
                                </view>
                              </scroll-view>
                            </view>
                            <view
                              className="composer-compact-controls-dismiss"
                              bindtap={() => setCompactControlsMenuOpen(false)}
                            />
                          </>
                        ) : null}
                      </view>
                    ) : !questionMode &&
                      modelOptionLabel &&
                      modelOptionSections.length > 0 &&
                      onSelectModelOption ? (
                      <view key="model-option" className="composer-model-option-control-wrap">
                        <ComposerToolbarControl
                          className="composer-toolbar-control--model-option"
                          controlId="model-option"
                          label={modelOptionLabel}
                          labelStyle={{
                            letterSpacing: getComposerModelOptionLetterSpacing(modelOptionLabel),
                          }}
                          trailing={
                            <Icon
                              name="chevron-down"
                              size={COMPOSER_FOOTER_ICON_GEOMETRY.chevron}
                              color="#818181"
                              className="pill__chevron-img"
                            />
                          }
                          onClick={() => {
                            setRuntimeModeMenuOpen(false);
                            setCompactControlsMenuOpen(false);
                            setModelOptionMenuOpen((open) => !open);
                          }}
                        />
                        {modelOptionMenuOpen ? (
                          <>
                            <scroll-view
                              className="composer-model-option-menu"
                              aria-label="Model options"
                              data-composer-model-option-menu
                              main-thread:ref={modelOptionMenuScrollRef}
                              main-thread:global-bindwheel={handleModelOptionMenuWheel}
                              scroll-y
                              scroll-orientation="vertical"
                            >
                              <view className="composer-model-option-menu__content">
                                {modelOptionSections.map((section) => (
                                  <view
                                    key={section.id}
                                    className="composer-model-option-menu__section"
                                    data-composer-model-option-section={section.id}
                                  >
                                    <text className="composer-model-option-menu__section-label">
                                      {section.label}
                                    </text>
                                    {section.items.map((item) => (
                                      <view
                                        key={item.id}
                                        className={`composer-model-option-menu__item${
                                          item.selected
                                            ? " composer-model-option-menu__item--selected"
                                            : " composer-model-option-menu__item--unselected"
                                        }`}
                                        aria-checked={item.selected ? "true" : "false"}
                                        data-composer-model-option-descriptor={section.id}
                                        data-composer-model-option-value={String(item.value)}
                                        data-composer-model-option-value-type={typeof item.value}
                                        bindtap={() => {
                                          onSelectModelOption?.(section.id, item.value);
                                          setModelOptionMenuOpen(false);
                                        }}
                                      >
                                        <view className="composer-model-option-menu__copy">
                                          <text className="composer-model-option-menu__label">
                                            {item.label}
                                          </text>
                                          {item.description ? (
                                            <text className="composer-model-option-menu__description">
                                              {item.description}
                                            </text>
                                          ) : null}
                                        </view>
                                        {item.selected ? (
                                          <Icon name="check" size={14} color="#818181" />
                                        ) : null}
                                      </view>
                                    ))}
                                  </view>
                                ))}
                              </view>
                            </scroll-view>
                            <view
                              className="composer-model-option-menu-dismiss-layer"
                              aria-label="Dismiss model options"
                              bindtap={() => setModelOptionMenuOpen(false)}
                            />
                          </>
                        ) : null}
                      </view>
                    ) : null,
                    !compactFooter && !questionMode ? (
                      <view
                        key="runtime"
                        className="composer-runtime-control-wrap"
                        data-floating-anchor="composer-runtime-menu"
                      >
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
                          onClick={() => {
                            setModelOptionMenuOpen(false);
                            setCompactControlsMenuOpen(false);
                            setRuntimeModeMenuOpen((open) => !open);
                          }}
                        />
                        {runtimeModeMenuOpen ? (
                          <>
                            <view
                              className="composer-runtime-menu"
                              aria-label="Runtime mode"
                              data-composer-runtime-menu
                              data-floating-popup="composer-runtime-menu"
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
                            <view
                              className="composer-runtime-menu-dismiss-layer"
                              aria-label="Dismiss runtime mode"
                              bindtap={() => setRuntimeModeMenuOpen(false)}
                            />
                          </>
                        ) : null}
                      </view>
                    ) : null,
                    !compactFooter && !questionMode && showInteractionModeToggle ? (
                      <view
                        key="interaction-separator"
                        className="composer-interaction-mode-separator"
                      />
                    ) : null,
                    !compactFooter && !questionMode && showInteractionModeToggle ? (
                      <ComposerToolbarControl
                        key="interaction"
                        className={`composer-toolbar-control--interaction${
                          interactionMode === "plan"
                            ? " composer-toolbar-control--interaction-plan"
                            : ""
                        }`}
                        controlId="interaction"
                        label={interactionModePresentation.label}
                        leading={
                          <Icon
                            name={interactionMode === "plan" ? "pencil-ruler" : "bot"}
                            size={
                              interactionMode === "plan"
                                ? COMPOSER_FOOTER_ICON_GEOMETRY.interaction.plan
                                : COMPOSER_FOOTER_ICON_GEOMETRY.interaction.default
                            }
                            color={interactionMode === "plan" ? "#60a5fa" : "#818181"}
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
                  icon={<Icon name={busy ? "square" : "send-arrow"} size={14} color="#ffffff" />}
                  onClick={handleSend}
                />
              ),
          }}
        />
      </view>
      {showContextStrip ? (
        <ComposerContextStrip
          backdrop={
            <view className="composer-context-backdrop">
              <view className="composer-context-backdrop-band composer-context-backdrop-band--seam" />
              <view className="composer-context-backdrop-band composer-context-backdrop-band--1" />
              <view className="composer-context-backdrop-band composer-context-backdrop-band--2" />
              <view className="composer-context-backdrop-band composer-context-backdrop-band--3" />
              <view className="composer-context-backdrop-band composer-context-backdrop-band--4" />
              {COMPOSER_CONTEXT_LIGHT_PROFILE.map((value, index) => (
                <view
                  key={`${index}:${value}`}
                  className="composer-context-light-band"
                  data-composer-context-light-band={String(index)}
                  style={{
                    top: `${index}px`,
                    backgroundColor: `rgb(${value}, ${value}, ${value})`,
                  }}
                />
              ))}
            </view>
          }
          checkout={
            <view
              className={`composer-workspace-control-wrap${
                workspaceMenuOpen ? " composer-workspace-control-wrap--open" : ""
              }`}
              data-floating-anchor="composer-workspace-menu"
            >
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
                  {checkoutLabel}
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
                    className={`composer-workspace-menu${
                      workspaceMode === "worktree" ? " composer-workspace-menu--worktree" : ""
                    }`}
                    aria-label="Workspace"
                    data-composer-workspace-menu
                    data-floating-popup="composer-workspace-menu"
                    data-floating-side="top"
                    data-floating-align="start"
                    data-floating-side-offset="4"
                    style={{
                      width: "158px",
                    }}
                    catchtap={() => undefined}
                  >
                    <text className="composer-workspace-menu__eyebrow">Workspace</text>
                    <view className="composer-workspace-menu__list">
                      <view
                        className={`composer-workspace-menu__item${
                          workspaceMode === "local" ? " composer-workspace-menu__item--active" : ""
                        } composer-workspace-menu__item--local`}
                        bindtap={() => {
                          onWorkspaceModeChange("local");
                          setWorkspaceMenuOpen(false);
                        }}
                      >
                        <Icon name="folder" size={14} color="#818181" />
                        <text className="composer-workspace-menu__label">
                          {resolveCurrentWorkspaceLabel(worktreePath ?? null)}
                        </text>
                      </view>
                      <view
                        className={`composer-workspace-menu__item${
                          workspaceMode === "worktree"
                            ? " composer-workspace-menu__item--active"
                            : ""
                        } composer-workspace-menu__item--worktree`}
                        bindtap={() => {
                          onWorkspaceModeChange("worktree");
                          setWorkspaceMenuOpen(false);
                        }}
                      >
                        <Icon name="git-branch" size={14} color="#818181" />
                        <text className="composer-workspace-menu__label">
                          {resolveEnvModeLabel("worktree")}
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
                  <view
                    className="composer-workspace-menu-dismiss"
                    bindtap={() => setWorkspaceMenuOpen(false)}
                  />
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
      ) : null}
    </view>
  );

  if (hero) {
    return (
      <view className="hero">
        <view className="hero__inner">
          <view className="hero__headline-slot">
            <ComposerHeroHeadline
              project={
                <HostInlineText className="hero__project-name">
                  {projectName ?? "your project"}
                </HostInlineText>
              }
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

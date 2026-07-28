import { useState, useCallback } from "@lynx-js/react";
import {
  deriveComposerSendState,
  getComposerInteractionModePresentation,
  getComposerRuntimeModePresentation,
  projectComposerContext,
} from "@t3tools/client-runtime/presentation/composer";
import type { ProviderInteractionMode, RuntimeMode } from "@t3tools/contracts";
import { Icon, type IconName } from "./Icon";

interface ComposerProps {
  disabled: boolean;
  busy: boolean;
  hero: boolean;
  projectName?: string;
  modelLabel?: string;
  modelInstanceId?: string;
  modelOptionLabel?: string;
  branch?: string;
  worktreePath?: string;
  runtimeMode: RuntimeMode;
  interactionMode: ProviderInteractionMode;
  onSend: (text: string) => void;
  onStop: () => void;
  onModelTap?: () => void;
  onModelOptionTap?: () => void;
  onRuntimeModeTap: () => void;
  onInteractionModeTap: () => void;
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

// A pill button inside the composer toolbar row.
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
  busy,
  hero,
  projectName,
  modelLabel,
  modelInstanceId,
  modelOptionLabel,
  branch,
  worktreePath,
  runtimeMode,
  interactionMode,
  onSend,
  onStop,
  onModelTap,
  onModelOptionTap,
  onRuntimeModeTap,
  onInteractionModeTap,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const sendState = deriveComposerSendState({
    prompt: value,
    imageCount: 0,
    terminalContexts: [],
  });

  const handleInput = useCallback((e: { detail: { value: string } }) => {
    setValue(e.detail.value);
  }, []);

  const handleSend = useCallback(() => {
    if (busy) {
      onStop();
      return;
    }
    const text = sendState.trimmedPrompt;
    if (!text) return;
    onSend(text);
    setValue("");
  }, [sendState.trimmedPrompt, busy, onSend, onStop]);

  const canSend = sendState.hasSendableContent && !disabled;
  const model = modelLabel ?? "Select model";
  const providerIcon = modelInstanceId ? getProviderIcon(modelInstanceId) : undefined;
  const runtimeModePresentation = getComposerRuntimeModePresentation(runtimeMode);
  const interactionModePresentation = getComposerInteractionModePresentation(interactionMode);
  const context = projectComposerContext({ branch, worktreePath });

  const card = (
    <view className="composer-card">
      <view className={disabled ? "composer composer--disabled" : "composer"}>
        <textarea
          className="composer__input"
          {...({ value } as object)}
          placeholder={
            disabled ? "Connecting to T3 Code…" : "Ask for follow-up changes or attach images"
          }
          bindinput={handleInput}
          confirm-type="send"
          bindconfirm={handleSend}
        />
        <view className="composer__toolbar">
          <view className="composer__toolbar-left">
            <view className="pill pill--muted" bindtap={onModelTap}>
              {providerIcon ? (
                <Icon name={providerIcon} size={16} className="pill__brand-img" />
              ) : null}
              <text className="pill__label" text-maxline="1">
                {model}
              </text>
              <Icon name="chevron-down" size={12} color="#71717a" className="pill__chevron-img" />
            </view>
            {modelOptionLabel && onModelOptionTap ? (
              <>
                <view className="composer__sep" />
                <Pill label={modelOptionLabel} muted chevron onTap={onModelOptionTap} />
              </>
            ) : null}
            <view className="composer__sep" />
            <Pill
              icon={RUNTIME_MODE_ICONS[runtimeMode]}
              label={runtimeModePresentation.label}
              muted
              chevron
              onTap={onRuntimeModeTap}
            />
            <view className="composer__sep" />
            <Pill
              icon={interactionMode === "plan" ? "pencil-line" : "bot"}
              label={interactionModePresentation.label}
              muted
              onTap={onInteractionModeTap}
            />
          </view>
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
        </view>
      </view>
      {/* Context strip: current checkout + branch */}
      <view className="context-strip">
        <view className="context-strip__item">
          <Icon name="folder" size={12} color="#a1a1aa" className="context-strip__icon-img" />
          <text className="context-strip__label">{context.checkoutLabel}</text>
        </view>
        <view className="context-strip__item">
          <Icon name="git-branch" size={12} color="#a1a1aa" className="context-strip__icon-img" />
          <text className="context-strip__label" text-maxline="1">
            {context.branchLabel}
          </text>
        </view>
      </view>
    </view>
  );

  if (hero) {
    return (
      <view className="hero">
        <view className="hero__inner">
          <text className="hero__headline">
            What should we build in{" "}
            <text className="hero__project">{projectName ?? "your project"}</text>?
          </text>
          {card}
        </view>
      </view>
    );
  }

  return <view className="composer-overlay">{card}</view>;
}

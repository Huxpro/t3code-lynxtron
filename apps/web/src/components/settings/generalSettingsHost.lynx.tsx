import { type ReactNode, useCallback } from "@lynx-js/react";

import type {
  GeneralSettingsGlassOpacityProps,
  GeneralSettingsSelectProps,
  GeneralSettingsTextInputProps,
  GeneralSettingsValueButtonProps,
} from "./generalSettingsControlTypes";

function joinClassNames(...values: ReadonlyArray<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function SettingsSection({
  title,
  icon,
  headerAction,
  children,
  className,
  id,
}: {
  readonly title: string;
  readonly icon?: ReactNode;
  readonly headerAction?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
  readonly id?: string;
}) {
  return (
    <view
      id={id}
      className={joinClassNames(
        "settings-section flex w-full min-w-0 flex-col self-stretch",
        className,
      )}
    >
      <view
        className={
          headerAction
            ? "settings-section__header settings-section__header--row"
            : "settings-section__header"
        }
      >
        <view className="settings-section__title-wrap">
          {icon}
          <text className="settings-section__title">{title}</text>
        </view>
        {headerAction ? (
          <view className="settings-section__header-right">{headerAction}</view>
        ) : null}
      </view>
      <view className="settings-section__rows flex w-full min-w-0 flex-col self-stretch">
        {children}
      </view>
    </view>
  );
}

export function SettingsRow({
  title,
  description,
  status,
  resetAction,
  control,
  children,
  className,
  id,
}: {
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly status?: ReactNode;
  readonly resetAction?: ReactNode;
  readonly control?: ReactNode;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly id?: string;
}) {
  return (
    <view
      id={id}
      className={joinClassNames("settings-row flex w-full min-w-0 self-stretch", className)}
    >
      <view className="settings-row__text flex min-w-0 flex-1 flex-col">
        <view className="settings-row__title-line">
          <text className="settings-row__title">{title}</text>
          {resetAction ? <view className="settings-row__reset">{resetAction}</view> : null}
        </view>
        <text className="settings-row__desc">{description}</text>
        {status ? <text className="settings-row__status">{status}</text> : null}
      </view>
      {control ? <view className="settings-row__control">{control}</view> : null}
      {children}
    </view>
  );
}

export function SettingResetButton({
  label,
  onClick,
}: {
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <view
      aria-label={`Reset ${label} to default`}
      className="ui-button ui-button--icon-xs ui-button--ghost settings-reset-button"
      bindtap={onClick}
    >
      <text className="ui-button__label">↶</text>
    </view>
  );
}

export function SettingsPageContainer({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <view
      className={joinClassNames(
        "settings-panel flex w-full min-w-0 flex-col self-stretch",
        className,
      )}
    >
      {children}
    </view>
  );
}

export function GeneralSettingsSelect<Value extends string>({
  ariaLabel,
  onValueChange,
  options,
  value,
  width = "normal",
}: GeneralSettingsSelectProps<Value>) {
  const handlePress = useCallback(() => {
    const currentIndex = options.findIndex((option) => option.value === value);
    const next = options[(currentIndex + 1) % options.length];
    if (next) onValueChange(next.value);
  }, [onValueChange, options, value]);
  const label = options.find((option) => option.value === value)?.label ?? value;

  return (
    <view
      aria-label={ariaLabel}
      className={
        width === "wide"
          ? "select-box select-box--interactive select-box--wide"
          : "select-box select-box--interactive"
      }
      bindtap={handlePress}
    >
      <text className="select-box__label" text-maxline="1">
        {label}
      </text>
      <text className="select-box__chevron">⌄</text>
    </view>
  );
}

export function GeneralSettingsGlassOpacity({
  max,
  min,
  onValueChange,
  value,
}: GeneralSettingsGlassOpacityProps) {
  const fillPercent = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
  const decrease = useCallback(
    () => onValueChange(Math.max(min, value - 5)),
    [min, onValueChange, value],
  );
  const increase = useCallback(
    () => onValueChange(Math.min(max, value + 5)),
    [max, onValueChange, value],
  );

  return (
    <view className="glass-slider">
      <view className="glass-slider__badge" bindtap={decrease}>
        <text className="glass-slider__badge-text">{value}%</text>
      </view>
      <view className="glass-slider__track-wrap" bindtap={increase}>
        <view className="glass-slider__track">
          <view className="glass-slider__fill" style={{ width: `${fillPercent}%` }} />
        </view>
        <view className="glass-slider__thumb" style={{ left: `${fillPercent}%` }} />
      </view>
    </view>
  );
}

export function GeneralSettingsTextInput({
  ariaLabel,
  placeholder,
  value,
}: GeneralSettingsTextInputProps) {
  return (
    <view className="general-text-input" aria-label={ariaLabel}>
      <text className={value ? "general-text-input__text" : "general-text-input__placeholder"}>
        {value || placeholder || ""}
      </text>
    </view>
  );
}

export function GeneralSettingsValueButton({
  ariaLabel,
  disabled = false,
  label,
  onPress,
}: GeneralSettingsValueButtonProps) {
  const handleTap = useCallback(() => {
    if (!disabled) onPress?.();
  }, [disabled, onPress]);
  return (
    <view
      aria-label={ariaLabel}
      className={joinClassNames(
        "ui-button ui-button--xs ui-button--outline",
        disabled ? "ui-button--disabled" : undefined,
      )}
      bindtap={handleTap}
    >
      <text className="ui-button__label">{label}</text>
    </view>
  );
}

export function GeneralSettingsNotice({ message }: { readonly message: string }) {
  return (
    <view className="settings-error-card">
      <text className="settings-error-card__text">{message}</text>
    </view>
  );
}

export function GeneralSettingsSwitch({
  "aria-label": ariaLabel,
  checked,
  disabled = false,
  onCheckedChange,
}: {
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
  readonly "aria-label": string;
}) {
  const handleTap = useCallback(() => {
    if (!disabled) onCheckedChange(!checked);
  }, [checked, disabled, onCheckedChange]);
  return (
    <view
      aria-label={ariaLabel}
      className={joinClassNames(
        "ui-switch",
        checked ? "ui-switch--checked" : "ui-switch--unchecked",
        disabled ? "ui-switch--disabled" : undefined,
      )}
      bindtap={handleTap}
    >
      <view
        className={checked ? "ui-switch__thumb ui-switch__thumb--checked" : "ui-switch__thumb"}
      />
    </view>
  );
}

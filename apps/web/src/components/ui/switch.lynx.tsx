import { useCallback } from "@lynx-js/react";

export interface SwitchProps {
  readonly "aria-label"?: string;
  readonly checked?: boolean;
  readonly className?: string;
  readonly "data-setting-control"?: string;
  readonly disabled?: boolean;
  readonly onCheckedChange?: (checked: boolean) => void;
}

export function Switch({
  "aria-label": ariaLabel,
  checked = false,
  className,
  "data-setting-control": settingControl,
  disabled = false,
  onCheckedChange,
}: SwitchProps) {
  const handleTap = useCallback(() => {
    if (!disabled) onCheckedChange?.(!checked);
  }, [checked, disabled, onCheckedChange]);

  return (
    <view
      className={[
        "ui-switch",
        checked ? "ui-switch--checked" : "ui-switch--unchecked",
        disabled ? "ui-switch--disabled" : undefined,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={ariaLabel}
      aria-checked={checked ? "true" : "false"}
      data-setting-control={settingControl}
      bindtap={handleTap}
    >
      <view
        className={checked ? "ui-switch__thumb ui-switch__thumb--checked" : "ui-switch__thumb"}
      />
    </view>
  );
}

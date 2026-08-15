import { useCallback, type ReactNode } from "@lynx-js/react";

import {
  SettingsRow,
  SettingsSection,
} from "../../../../web/src/components/settings/settingsLayout";
import { Button } from "../../../../web/src/components/ui/button";
import { Switch } from "../../../../web/src/components/ui/switch";
import { Icon } from "./Icon";

export { SettingsRow, SettingsSection };

export function Toggle({
  value,
  onChange,
  disabled = false,
}: {
  value: boolean;
  onChange?: (v: boolean) => void;
  disabled?: boolean;
}) {
  const handleTap = useCallback(() => {
    if (!disabled) onChange?.(!value);
  }, [disabled, value, onChange]);
  return <Switch checked={value} disabled={disabled} onCheckedChange={handleTap} />;
}

export function SelectBox({
  label,
  width,
  onTap,
}: {
  label: string;
  width?: number;
  onTap?: () => void;
}) {
  return (
    <view
      className={onTap ? "select-box select-box--interactive" : "select-box"}
      style={width ? { width: `${width}px` } : undefined}
      bindtap={onTap}
    >
      <text className="select-box__label" text-maxline="1">
        {label}
      </text>
      {onTap ? (
        <Icon name="chevron-down" size={12} color="#818181" className="select-box__chevron-img" />
      ) : null}
    </view>
  );
}

export function SmallButton({
  label,
  icon,
  onTap,
}: {
  label: string;
  icon?: ReactNode;
  onTap?: () => void;
}) {
  return (
    <Button onClick={onTap} size="xs" variant="outline">
      {icon}
      {label}
    </Button>
  );
}

export function SmallIconButton({
  label,
  icon,
  disabled = false,
  onTap,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onTap?: () => void;
}) {
  return (
    <Button aria-label={label} disabled={disabled} onClick={onTap} size="icon-xs" variant="ghost">
      {icon}
    </Button>
  );
}

export function GlassSlider({ percent }: { percent: number }) {
  const fillPct = Math.max(0, Math.min(100, ((percent - 40) / 60) * 100));
  return (
    <view className="glass-slider">
      <view className="glass-slider__badge">
        <text className="glass-slider__badge-text">{percent}%</text>
      </view>
      <view className="glass-slider__track-wrap">
        <view className="glass-slider__track">
          <view className="glass-slider__fill" style={{ width: `${fillPct}%` }} />
        </view>
        <view className="glass-slider__thumb" style={{ left: `${fillPct}%` }} />
      </view>
    </view>
  );
}

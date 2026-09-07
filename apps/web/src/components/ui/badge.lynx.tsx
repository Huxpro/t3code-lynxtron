import type { ReactNode } from "@lynx-js/react";

type BadgeVariant =
  | "default"
  | "destructive"
  | "error"
  | "info"
  | "outline"
  | "secondary"
  | "success"
  | "warning";
type BadgeSize = "default" | "lg" | "sm";

export function Badge({
  children,
  className,
  size = "default",
  variant = "default",
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly size?: BadgeSize;
  readonly variant?: BadgeVariant;
}) {
  return (
    <view
      {...props}
      className={["ui-badge", `ui-badge--${size}`, `ui-badge--${variant}`, className]
        .filter(Boolean)
        .join(" ")}
      data-slot="badge"
    >
      <text className="ui-badge__label">{children}</text>
    </view>
  );
}

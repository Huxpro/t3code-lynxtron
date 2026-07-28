import { type ReactNode, useCallback } from "@lynx-js/react";

type ButtonVariant =
  | "default"
  | "destructive"
  | "destructive-outline"
  | "ghost"
  | "link"
  | "outline"
  | "secondary";
type ButtonSize =
  | "default"
  | "icon"
  | "icon-lg"
  | "icon-sm"
  | "icon-xl"
  | "icon-xs"
  | "lg"
  | "sm"
  | "xl"
  | "xs";

export interface ButtonProps {
  readonly "aria-label"?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly render?: ReactNode;
  readonly size?: ButtonSize;
  readonly variant?: ButtonVariant;
}

export function buttonVariants({
  className,
  size = "default",
  variant = "default",
}: Pick<ButtonProps, "className" | "size" | "variant"> = {}): string {
  return ["ui-button", `ui-button--${size}`, `ui-button--${variant}`, className]
    .filter(Boolean)
    .join(" ");
}

export function Button({
  children,
  className,
  disabled = false,
  onClick,
  size = "default",
  variant = "default",
}: ButtonProps) {
  const handleTap = useCallback(() => {
    if (!disabled) onClick?.();
  }, [disabled, onClick]);
  const resolvedClassName = [
    buttonVariants({ className, size, variant }),
    disabled ? "ui-button--disabled" : undefined,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <view className={resolvedClassName} bindtap={handleTap}>
      <text className="ui-button__label">{children}</text>
    </view>
  );
}

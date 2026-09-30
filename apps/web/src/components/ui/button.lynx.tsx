import { type ReactNode, useCallback } from "@lynx-js/react";

type ButtonVariant =
  | "default"
  | "destructive"
  | "destructive-outline"
  | "ghost"
  | "ghost-muted"
  | "link"
  | "outline"
  | "secondary";
type ButtonSize =
  | "default"
  | "icon"
  | "icon-lg"
  | "icon-micro"
  | "icon-sm"
  | "icon-xl"
  | "icon-xs"
  | "lg"
  | "micro"
  | "sm"
  | "xl"
  | "xs";

export interface ButtonProps {
  readonly [key: string]: unknown;
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
  "aria-label": ariaLabel,
  children,
  className,
  disabled = false,
  onClick,
  size = "default",
  variant = "default",
  ...props
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
    <view
      {...props}
      flatten={false}
      aria-label={ariaLabel}
      aria-disabled={disabled ? "true" : undefined}
      className={resolvedClassName}
      bindtap={handleTap}
    >
      <text className="ui-button__label" text-maxline="1">
        {children}
      </text>
    </view>
  );
}

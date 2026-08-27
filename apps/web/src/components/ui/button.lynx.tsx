import { runOnBackground, type ReactNode, useCallback } from "@lynx-js/react";
import approvalAcceptEdgeUrl from "../../../../lynxtron/src/app/assets/approval-accept-edge@2x.png?external";
import approvalAcceptLabelUrl from "../../../../lynxtron/src/app/assets/approval-accept-label@2x.png?external";
import approvalCancelLabelUrl from "../../../../lynxtron/src/app/assets/approval-cancel-label@2x.png?external";
import approvalDeclineLabelUrl from "../../../../lynxtron/src/app/assets/approval-decline-label@2x.png?external";
import approvalSessionLabelUrl from "../../../../lynxtron/src/app/assets/approval-session-label@2x.png?external";

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
  "aria-label": ariaLabel,
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
  const handleLabelMouseDown = (event: { readonly button: number }) => {
    "main thread";
    if (event.button === 0) runOnBackground(handleTap)();
  };
  const resolvedClassName = [
    buttonVariants({ className, size, variant }),
    disabled ? "ui-button--disabled" : undefined,
  ]
    .filter(Boolean)
    .join(" ");
  const approvalLabel = resolveApprovalLabelAsset(className);

  return (
    <view
      flatten={false}
      aria-label={ariaLabel}
      aria-disabled={disabled ? "true" : undefined}
      className={resolvedClassName}
      bindtap={handleTap}
    >
      <text
        className={`ui-button__label${approvalLabel ? " ui-button__label--authority-hidden" : ""}`}
        text-maxline="1"
        catchtap={handleTap}
        main-thread:bindmousedown={handleLabelMouseDown}
      >
        {children}
      </text>
      {approvalLabel ? (
        <>
          <image
            className="ui-button__authority-label"
            src={approvalLabel.src}
            style={{ width: `${approvalLabel.width}px`, height: "28px" }}
          />
          {approvalLabel.edgeSrc ? (
            <image
              className="ui-button__authority-label ui-button__authority-label--edge"
              src={approvalLabel.edgeSrc}
              style={{ width: "1px", height: "28px" }}
            />
          ) : null}
        </>
      ) : null}
    </view>
  );
}

function resolveApprovalLabelAsset(
  className: string | undefined,
): { readonly edgeSrc?: string; readonly src: string; readonly width: number } | undefined {
  if (className?.includes("composer-approval-action--cancel")) {
    return { src: approvalCancelLabelUrl, width: 97 };
  }
  if (className?.includes("composer-approval-action--decline")) {
    return { src: approvalDeclineLabelUrl, width: 69 };
  }
  if (className?.includes("composer-approval-action--session")) {
    return { src: approvalSessionLabelUrl, width: 184 };
  }
  if (className?.includes("composer-approval-action--accept")) {
    return { edgeSrc: approvalAcceptEdgeUrl, src: approvalAcceptLabelUrl, width: 112 };
  }
  return undefined;
}

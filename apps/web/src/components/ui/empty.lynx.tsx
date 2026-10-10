import { type ReactNode } from "@lynx-js/react";

function joinClassNames(...values: ReadonlyArray<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function Empty({
  children,
  className,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <view className={className ?? ""} data-slot="empty">
      {children}
    </view>
  );
}

export function EmptyHeader({
  children,
  className,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <view className={className ?? ""} data-slot="empty-header">
      {children}
    </view>
  );
}

export function EmptyMedia({
  children,
  className,
  variant = "default",
}: {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly variant?: "default" | "icon";
}) {
  return (
    <view
      className={joinClassNames(
        variant === "icon" ? "settings-remote-empty__media--icon" : undefined,
        className,
      )}
      data-slot="empty-media"
      data-variant={variant}
    >
      {variant === "icon" ? (
        <>
          <view
            aria-hidden="true"
            className="settings-remote-empty__media-layer settings-remote-empty__media-layer--left"
          />
          <view
            aria-hidden="true"
            className="settings-remote-empty__media-layer settings-remote-empty__media-layer--right"
          />
        </>
      ) : null}
      <view className="settings-remote-empty__media-layer settings-remote-empty__media-layer--front">
        {children}
      </view>
    </view>
  );
}

export function EmptyTitle({
  children,
  className,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <text className={className ?? ""} data-slot="empty-title">
      {children}
    </text>
  );
}

export function EmptyDescription({
  children,
  className,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <text className={className ?? ""} data-slot="empty-description">
      {children}
    </text>
  );
}

export function EmptyContent({
  children,
  className,
}: {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <view
      className={joinClassNames("settings-remote-empty__content", className)}
      data-slot="empty-content"
    >
      {children}
    </view>
  );
}

import type { ReactNode } from "@lynx-js/react";

export function HostView({
  children,
  onClick,
  onDoubleClick: _onDoubleClick,
  onContextMenu,
  onKeyDown: _onKeyDown,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly onClick?: (event: unknown) => void;
  readonly onDoubleClick?: (event: unknown) => void;
  readonly onContextMenu?: (event: unknown) => void;
  readonly onKeyDown?: (event: unknown) => void;
}) {
  return (
    <view {...props} bindtap={onClick} bindlongpress={onContextMenu}>
      {children}
    </view>
  );
}

export function HostListItem({
  children,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
}) {
  return <view {...props}>{children}</view>;
}

export function HostList({
  children,
  ref: _ref,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly ref?: unknown;
}) {
  return <view {...props}>{children}</view>;
}

export function HostScrollView({
  children,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
}) {
  return (
    <scroll-view {...props} scroll-y>
      {children}
    </scroll-view>
  );
}

export function HostHeading({
  children,
  className,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <text
      {...props}
      className={className ? `lynx-host-text ${className}` : "lynx-host-text"}
      text-maxline="1"
    >
      {children}
    </text>
  );
}

export function HostButton({
  children,
  onClick,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly onClick?: (event: unknown) => void;
}) {
  return (
    <view {...props} bindtap={onClick}>
      {children}
    </view>
  );
}

export function HostText({
  children,
  className,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
}) {
  return (
    <text {...props} className={className ? `lynx-host-text ${className}` : "lynx-host-text"}>
      {children}
    </text>
  );
}

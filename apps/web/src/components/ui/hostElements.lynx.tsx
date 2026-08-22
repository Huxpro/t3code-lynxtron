import { runOnBackground, type ReactNode } from "@lynx-js/react";

interface HostKeyEvent {
  readonly key: string;
}

interface MainThreadKeyEvent extends HostKeyEvent {}

export function HostView({
  children,
  eventThrough,
  onClick,
  onDoubleClick: _onDoubleClick,
  onContextMenu,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly eventThrough?: boolean;
  readonly onClick?: (event: unknown) => void;
  readonly onDoubleClick?: (event: unknown) => void;
  readonly onContextMenu?: (event: unknown) => void;
  readonly onKeyDown?: (event: unknown) => void;
  readonly onMouseEnter?: (event: unknown) => void;
  readonly onMouseLeave?: (event: unknown) => void;
}) {
  const handleKeyDown = (event: MainThreadKeyEvent) => {
    "main thread";
    if (!onKeyDown) return;
    runOnBackground(onKeyDown)({
      key: event.key,
    });
  };
  const handleMouseEnter = () => {
    "main thread";
    if (onMouseEnter) runOnBackground(onMouseEnter)({});
  };
  const handleMouseLeave = () => {
    "main thread";
    if (onMouseLeave) runOnBackground(onMouseLeave)({});
  };
  return (
    <view
      {...props}
      event-through={eventThrough}
      {...(onContextMenu ? ({ bindcontextmenu: onContextMenu } as object) : {})}
      {...(onKeyDown ? { "main-thread:bindkeydown": handleKeyDown } : {})}
      {...(onMouseEnter ? { "main-thread:bindmouseenter": handleMouseEnter } : {})}
      {...(onMouseEnter ? { "main-thread:bindmousemove": handleMouseEnter } : {})}
      {...(onMouseLeave ? { "main-thread:bindmouseleave": handleMouseLeave } : {})}
      bindmousemove={onMouseEnter}
      bindtap={onClick}
      bindlongpress={onContextMenu}
    >
      {children}
    </view>
  );
}

export function HostLayoutView({
  children,
  onClick,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly onClick?: () => void;
}) {
  return (
    <view {...props} flatten={false} bindtap={onClick}>
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

export function HostHeadline({
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

export function HostButton({
  "aria-expanded": ariaExpanded,
  children,
  onClick,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly onClick?: (event: unknown) => void;
  readonly onKeyDown?: (event: unknown) => void;
  readonly onMouseEnter?: (event: unknown) => void;
  readonly onMouseLeave?: (event: unknown) => void;
}) {
  const handleKeyDown = (event: MainThreadKeyEvent) => {
    "main thread";
    if (!onKeyDown) return;
    runOnBackground(onKeyDown)({
      key: event.key,
    });
  };
  const handleMouseEnter = () => {
    "main thread";
    if (onMouseEnter) runOnBackground(onMouseEnter)({});
  };
  const handleMouseLeave = () => {
    "main thread";
    if (onMouseLeave) runOnBackground(onMouseLeave)({});
  };
  return (
    <view
      {...props}
      aria-expanded={ariaExpanded}
      {...(onKeyDown ? { "main-thread:bindkeydown": handleKeyDown } : {})}
      {...(onMouseEnter ? { "main-thread:bindmouseenter": handleMouseEnter } : {})}
      {...(onMouseEnter ? { "main-thread:bindmousemove": handleMouseEnter } : {})}
      {...(onMouseLeave ? { "main-thread:bindmouseleave": handleMouseLeave } : {})}
      bindmousemove={onMouseEnter}
      bindtap={onClick}
    >
      {children}
    </view>
  );
}

export function HostText({
  children,
  className,
  onClick,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly onClick?: () => void;
}) {
  return (
    <text
      {...props}
      className={className ? `lynx-host-text ${className}` : "lynx-host-text"}
      bindtap={onClick}
    >
      {children}
    </text>
  );
}

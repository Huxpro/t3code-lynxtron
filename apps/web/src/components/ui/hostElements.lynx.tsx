import { runOnBackground, type ReactNode, useMainThreadRef } from "@lynx-js/react";

interface HostKeyEvent {
  readonly key: string;
}

interface MainThreadKeyEvent extends HostKeyEvent {}

interface MainThreadMouseEvent {
  readonly button: number;
  readonly currentTarget: {
    querySelector(selector: string): { setStyleProperty(name: string, value: string): void } | null;
    setAttribute(name: string, value: unknown): void;
  };
}

function needsHoverState(className: unknown): boolean {
  return (
    typeof className === "string" &&
    className
      .split(/\s+/u)
      .some((token) => token.startsWith("hover:") || /^(?:group|peer)(?:\/|$)/u.test(token))
  );
}

interface MainThreadElement {
  animate(keyframes: ReadonlyArray<Record<string, number | string>>, options?: unknown): never;
  getAttribute(attributeName: string): unknown;
  getAttributeNames(): string[];
  invoke(methodName: string, params?: Record<string, unknown>): Promise<unknown>;
  querySelector(selector: string): MainThreadElement | null;
  querySelectorAll(selector: string): MainThreadElement[];
  setAttribute(name: string, value: unknown): void;
  setStyleProperties(styles: Record<string, string>): void;
  setStyleProperty(name: string, value: string): void;
}

const ignoreTap = () => undefined;

export function HostView({
  children,
  className,
  eventThrough,
  hoverRevealSelector,
  stopTapPropagation,
  onClick,
  onDoubleClick: _onDoubleClick,
  onAuxClick,
  onContextMenu,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly eventThrough?: boolean;
  readonly hoverRevealSelector?: string;
  readonly stopTapPropagation?: boolean;
  readonly onClick?: (event: unknown) => void;
  readonly onDoubleClick?: (event: unknown) => void;
  readonly onAuxClick?: (event: unknown) => void;
  readonly onContextMenu?: (event: unknown) => void;
  readonly onKeyDown?: (event: unknown) => void;
  readonly onMouseEnter?: (event: unknown) => void;
  readonly onMouseLeave?: (event: unknown) => void;
}) {
  const contextMenuRef = useMainThreadRef<MainThreadElement>(null);
  const injectedMouseEnter = props["main-thread:bindmouseenter"] as
    | ((event: MainThreadMouseEvent) => void)
    | undefined;
  const injectedMouseMove = props["main-thread:bindmousemove"] as
    | ((event: MainThreadMouseEvent) => void)
    | undefined;
  const injectedMouseLeave = props["main-thread:bindmouseleave"] as
    | ((event: MainThreadMouseEvent) => void)
    | undefined;
  const trackHoverState = needsHoverState(className);
  const handleKeyDown = (event: MainThreadKeyEvent) => {
    "main thread";
    if (!onKeyDown) return;
    runOnBackground(onKeyDown)({
      key: event.key,
    });
  };
  const handleMouseEnter = (event: MainThreadMouseEvent) => {
    "main thread";
    injectedMouseEnter?.(event);
    injectedMouseMove?.(event);
    if (hoverRevealSelector) {
      event.currentTarget.querySelector(hoverRevealSelector)?.setStyleProperty("opacity", "1");
    }
    if (trackHoverState) event.currentTarget.setAttribute("data-lynx-hover", "true");
    if (onMouseEnter) runOnBackground(onMouseEnter)({});
  };
  const handleMouseLeave = (event: MainThreadMouseEvent) => {
    "main thread";
    injectedMouseLeave?.(event);
    if (hoverRevealSelector) {
      event.currentTarget.querySelector(hoverRevealSelector)?.setStyleProperty("opacity", "0");
    }
    if (trackHoverState) event.currentTarget.setAttribute("data-lynx-hover", "false");
    if (onMouseLeave) runOnBackground(onMouseLeave)({});
  };
  const handleMouseDown = async (event: MainThreadMouseEvent) => {
    "main thread";
    if (event.button === 1 && onAuxClick) {
      runOnBackground(onAuxClick)({ button: event.button });
      return;
    }
    if (event.button === 2 && onContextMenu) {
      const measured = (await contextMenuRef.current?.invoke("boundingClientRect", {
        relativeTo: null,
      })) as Partial<{ left: number; top: number; width: number; height: number }> | null;
      runOnBackground(onContextMenu)({
        button: event.button,
        ...(measured &&
        typeof measured.left === "number" &&
        typeof measured.top === "number" &&
        typeof measured.width === "number" &&
        typeof measured.height === "number"
          ? { x: measured.left, y: measured.top + measured.height }
          : {}),
      });
    }
  };
  return (
    <view
      {...props}
      className={className}
      {...(onContextMenu ? { "main-thread:ref": contextMenuRef } : {})}
      flatten={hoverRevealSelector ? false : undefined}
      event-through={eventThrough}
      {...(onContextMenu || onAuxClick ? { "main-thread:bindmousedown": handleMouseDown } : {})}
      {...(onKeyDown ? { "main-thread:bindkeydown": handleKeyDown } : {})}
      {...(onMouseEnter || hoverRevealSelector || injectedMouseEnter || trackHoverState
        ? { "main-thread:bindmouseenter": handleMouseEnter }
        : {})}
      {...(onMouseEnter || hoverRevealSelector || injectedMouseMove
        ? { "main-thread:bindmousemove": handleMouseEnter }
        : {})}
      {...(onMouseEnter || hoverRevealSelector
        ? { "main-thread:bindmouseover": handleMouseEnter }
        : {})}
      {...(onMouseLeave || hoverRevealSelector || injectedMouseLeave || trackHoverState
        ? { "main-thread:bindmouseleave": handleMouseLeave }
        : {})}
      bindmousemove={onMouseEnter}
      {...(stopTapPropagation ? { catchtap: onClick ?? ignoreTap } : { bindtap: onClick })}
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

export function HostInlineText({
  children,
  className,
  onClick,
  onAuxClick,
  onContextMenu,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly onClick?: () => void;
  readonly onAuxClick?: (event: unknown) => void;
  readonly onContextMenu?: (event: unknown) => void;
}) {
  const handleMouseDown = (event: MainThreadMouseEvent) => {
    "main thread";
    if (event.button === 1 && onAuxClick) {
      runOnBackground(onAuxClick)({ button: event.button });
      return;
    }
    if (event.button === 2 && onContextMenu) {
      runOnBackground(onContextMenu)({ button: event.button });
    }
  };
  return (
    <inline-text
      {...props}
      className={className ? `lynx-host-inline-text ${className}` : "lynx-host-inline-text"}
      {...(onContextMenu || onAuxClick ? { "main-thread:bindmousedown": handleMouseDown } : {})}
      bindtap={onClick}
    >
      {children}
    </inline-text>
  );
}

export function HostButton({
  "aria-expanded": ariaExpanded,
  children,
  className,
  onClick,
  onAuxClick,
  onContextMenu,
  onKeyDown,
  onMouseEnter,
  onMouseLeave,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly onClick?: (event: unknown) => void;
  readonly onAuxClick?: (event: unknown) => void;
  readonly onContextMenu?: (event: unknown) => void;
  readonly onKeyDown?: (event: unknown) => void;
  readonly onMouseEnter?: (event: unknown) => void;
  readonly onMouseLeave?: (event: unknown) => void;
}) {
  const trackHoverState = needsHoverState(className);
  const handleKeyDown = (event: MainThreadKeyEvent) => {
    "main thread";
    if (!onKeyDown) return;
    runOnBackground(onKeyDown)({
      key: event.key,
    });
  };
  const handleMouseEnter = (event: MainThreadMouseEvent) => {
    "main thread";
    if (trackHoverState) event.currentTarget.setAttribute("data-lynx-hover", "true");
    if (onMouseEnter) runOnBackground(onMouseEnter)({});
  };
  const handleMouseLeave = (event: MainThreadMouseEvent) => {
    "main thread";
    if (trackHoverState) event.currentTarget.setAttribute("data-lynx-hover", "false");
    if (onMouseLeave) runOnBackground(onMouseLeave)({});
  };
  const handleMouseDown = (event: MainThreadMouseEvent) => {
    "main thread";
    if (event.button === 1 && onAuxClick) {
      runOnBackground(onAuxClick)({ button: event.button });
      return;
    }
    if (event.button === 2 && onContextMenu) {
      runOnBackground(onContextMenu)({ button: event.button });
    }
  };
  return (
    <view
      {...props}
      className={className}
      aria-expanded={ariaExpanded}
      {...(onContextMenu || onAuxClick ? { "main-thread:bindmousedown": handleMouseDown } : {})}
      {...(onKeyDown ? { "main-thread:bindkeydown": handleKeyDown } : {})}
      {...(onMouseEnter || trackHoverState
        ? { "main-thread:bindmouseenter": handleMouseEnter }
        : {})}
      {...(onMouseEnter || trackHoverState
        ? { "main-thread:bindmousemove": handleMouseEnter }
        : {})}
      {...(onMouseLeave || trackHoverState
        ? { "main-thread:bindmouseleave": handleMouseLeave }
        : {})}
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
  eventThrough,
  onClick,
  onAuxClick,
  onContextMenu,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly eventThrough?: boolean;
  readonly onClick?: () => void;
  readonly onAuxClick?: (event: unknown) => void;
  readonly onContextMenu?: (event: unknown) => void;
}) {
  const handleMouseDown = (event: MainThreadMouseEvent) => {
    "main thread";
    if (event.button === 1 && onAuxClick) {
      runOnBackground(onAuxClick)({ button: event.button });
      return;
    }
    if (event.button === 2 && onContextMenu) {
      runOnBackground(onContextMenu)({ button: event.button });
    }
  };
  return (
    <text
      {...props}
      event-through={eventThrough}
      className={className ? `lynx-host-text ${className}` : "lynx-host-text"}
      {...(onContextMenu || onAuxClick ? { "main-thread:bindmousedown": handleMouseDown } : {})}
      bindtap={onClick}
    >
      {children}
    </text>
  );
}

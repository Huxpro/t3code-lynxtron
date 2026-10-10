import { runOnBackground, type ReactNode, useMainThreadRef } from "@lynx-js/react";

interface HostKeyEvent {
  readonly key: string;
}

interface MainThreadKeyEvent extends HostKeyEvent {}

interface MainThreadMouseEvent {
  readonly button?: number;
  readonly currentTarget: {
    querySelector(selector: string): { setStyleProperty(name: string, value: string): void } | null;
    setAttribute(name: string, value: unknown): void;
  };
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

/**
 * A host attribute that is written even when its value is undefined, so it still
 * overrides the same key arriving through spread props.
 */
export function hostAttribute(name: string, value: unknown): Record<string, unknown> {
  return { [name]: value };
}

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
  readonly children?: ReactNode | undefined;
  readonly eventThrough?: boolean | undefined;
  readonly hoverRevealSelector?: string | undefined;
  readonly stopTapPropagation?: boolean | undefined;
  readonly onClick?: ((event: unknown) => void) | undefined;
  readonly onDoubleClick?: ((event: unknown) => void) | undefined;
  readonly onAuxClick?: ((event: unknown) => void) | undefined;
  readonly onContextMenu?: ((event: unknown) => void) | undefined;
  readonly onKeyDown?: ((event: unknown) => void) | undefined;
  readonly onMouseEnter?: ((event: unknown) => void) | undefined;
  readonly onMouseLeave?: ((event: unknown) => void) | undefined;
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
      const revealTarget = event.currentTarget.querySelector(hoverRevealSelector);
      revealTarget?.setStyleProperty("opacity", "1");
      revealTarget?.setStyleProperty("visibility", "visible");
    }
    if (onMouseEnter) runOnBackground(onMouseEnter)({});
  };
  const handleMouseLeave = (event: MainThreadMouseEvent) => {
    "main thread";
    injectedMouseLeave?.(event);
    if (hoverRevealSelector) {
      const revealTarget = event.currentTarget.querySelector(hoverRevealSelector);
      revealTarget?.setStyleProperty("opacity", "0");
      revealTarget?.setStyleProperty("visibility", "hidden");
    }
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
      {...hostAttribute("className", typeof className === "string" ? className : undefined)}
      {...(onContextMenu ? { "main-thread:ref": contextMenuRef } : {})}
      {...hostAttribute("flatten", hoverRevealSelector ? false : undefined)}
      {...hostAttribute("event-through", eventThrough)}
      {...(onContextMenu || onAuxClick ? { "main-thread:bindmousedown": handleMouseDown } : {})}
      {...(onKeyDown ? { "main-thread:bindkeydown": handleKeyDown } : {})}
      {...(onMouseEnter || hoverRevealSelector || injectedMouseEnter
        ? { "main-thread:bindmouseenter": handleMouseEnter }
        : {})}
      {...(onMouseEnter || hoverRevealSelector || injectedMouseMove
        ? { "main-thread:bindmousemove": handleMouseEnter }
        : {})}
      {...(onMouseEnter || hoverRevealSelector
        ? { "main-thread:bindmouseover": handleMouseEnter }
        : {})}
      {...(onMouseLeave || hoverRevealSelector || injectedMouseLeave
        ? { "main-thread:bindmouseleave": handleMouseLeave }
        : {})}
      {...hostAttribute("bindmousemove", onMouseEnter)}
      {...(stopTapPropagation
        ? { catchtap: onClick ?? ignoreTap }
        : hostAttribute("bindtap", onClick))}
      {...hostAttribute("bindlongpress", onContextMenu)}
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
  readonly children?: ReactNode | undefined;
  readonly onClick?: (() => void) | undefined;
}) {
  return (
    <view {...props} flatten={false} {...hostAttribute("bindtap", onClick)}>
      {children}
    </view>
  );
}

export function HostListItem({
  children,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode | undefined;
}) {
  return <view {...props}>{children}</view>;
}

export function HostList({
  children,
  ref: _ref,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode | undefined;
  readonly ref?: unknown;
}) {
  return <view {...props}>{children}</view>;
}

export function HostScrollView({
  children,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode | undefined;
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
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
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
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
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
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
  readonly onClick?: (() => void) | undefined;
  readonly onAuxClick?: ((event: unknown) => void) | undefined;
  readonly onContextMenu?: ((event: unknown) => void) | undefined;
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
      {...hostAttribute("bindtap", onClick)}
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
  stopTapPropagation,
  ...props
}: Record<string, unknown> & {
  readonly children?: ReactNode | undefined;
  readonly onClick?: ((event: unknown) => void) | undefined;
  readonly onAuxClick?: ((event: unknown) => void) | undefined;
  readonly onContextMenu?: ((event: unknown) => void) | undefined;
  readonly onKeyDown?: ((event: unknown) => void) | undefined;
  readonly onMouseEnter?: ((event: unknown) => void) | undefined;
  readonly onMouseLeave?: ((event: unknown) => void) | undefined;
  readonly stopTapPropagation?: boolean | undefined;
}) {
  const handleKeyDown = (event: MainThreadKeyEvent) => {
    "main thread";
    if (!onKeyDown) return;
    runOnBackground(onKeyDown)({
      key: event.key,
    });
  };
  const handleMouseEnter = (event: MainThreadMouseEvent) => {
    "main thread";
    if (onMouseEnter) runOnBackground(onMouseEnter)({});
  };
  const handleMouseLeave = (event: MainThreadMouseEvent) => {
    "main thread";
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
      {...hostAttribute("className", typeof className === "string" ? className : undefined)}
      aria-expanded={ariaExpanded}
      {...(onContextMenu || onAuxClick ? { "main-thread:bindmousedown": handleMouseDown } : {})}
      {...(onKeyDown ? { "main-thread:bindkeydown": handleKeyDown } : {})}
      {...(onMouseEnter ? { "main-thread:bindmouseenter": handleMouseEnter } : {})}
      {...(onMouseEnter ? { "main-thread:bindmousemove": handleMouseEnter } : {})}
      {...(onMouseLeave ? { "main-thread:bindmouseleave": handleMouseLeave } : {})}
      {...hostAttribute("bindmousemove", onMouseEnter)}
      {...(stopTapPropagation
        ? { catchtap: onClick ?? ignoreTap }
        : hostAttribute("bindtap", onClick))}
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
  readonly children?: ReactNode | undefined;
  readonly className?: string | undefined;
  readonly eventThrough?: boolean | undefined;
  readonly onClick?: (() => void) | undefined;
  readonly onAuxClick?: ((event: unknown) => void) | undefined;
  readonly onContextMenu?: ((event: unknown) => void) | undefined;
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
      {...hostAttribute("event-through", eventThrough)}
      className={className ? `lynx-host-text ${className}` : "lynx-host-text"}
      {...(onContextMenu || onAuxClick ? { "main-thread:bindmousedown": handleMouseDown } : {})}
      {...hostAttribute("bindtap", onClick)}
    >
      {children}
    </text>
  );
}

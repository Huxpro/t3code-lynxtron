import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  runOnBackground,
  runOnMainThread,
  useCallback,
  useContext,
  useEffect,
  useMainThreadRef,
  useMemo,
  useRef,
  useState,
} from "@lynx-js/react";
import {
  resolveFloatingAnchorPoint,
  type FloatingAlign,
  type FloatingRect,
  type FloatingSide,
} from "@t3tools/client-runtime/presentation/floating-relation";

type ElementProps = Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly render?: ReactElement<Record<string, unknown>>;
};

interface TooltipProviderValue {
  readonly closeDelay: number;
  readonly delay: number;
}

interface TooltipContextValue {
  readonly anchorRect: FloatingRect | null;
  readonly open: boolean;
  readonly setHover: (inside: boolean, rect?: FloatingRect) => void;
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

interface MainThreadMouseEvent {
  readonly x: number;
  readonly y: number;
}

interface GlobalEventEmitterLike {
  addListener?: (eventName: string, listener: (value: unknown) => void) => void;
}

declare const lynx:
  | {
      getJSModule?: (name: string) => GlobalEventEmitterLike | undefined;
    }
  | undefined;

const T3_TOOLTIP_TEST_EVENT = "t3:tooltip-test";
const TooltipProviderContext = createContext<TooltipProviderValue>({
  closeDelay: 0,
  delay: 600,
});
const TooltipContext = createContext<TooltipContextValue | null>(null);
let tooltipTestBridgeInstalled = false;

function installTooltipTestBridge(): void {
  "background only";
  if (tooltipTestBridgeInstalled) return;
  let registry: GlobalEventEmitterLike | undefined;
  try {
    registry = typeof lynx !== "undefined" ? lynx.getJSModule?.("GlobalEventEmitter") : undefined;
  } catch {
    registry = undefined;
  }
  if (!registry?.addListener) return;
  tooltipTestBridgeInstalled = true;
  registry.addListener(T3_TOOLTIP_TEST_EVENT, (value: unknown) => {
    const input =
      typeof value === "object" && value !== null
        ? (value as { readonly action?: unknown; readonly relationId?: unknown })
        : null;
    if (
      typeof input?.relationId !== "string" ||
      (input.action !== "hover" && input.action !== "leave")
    ) {
      return;
    }
    const probe = (
      globalThis as {
        __T3_LYNXTRON_TOOLTIP_PROBE__?: Record<
          string,
          { readonly hover: () => Promise<void>; readonly leave: () => Promise<void> }
        >;
      }
    ).__T3_LYNXTRON_TOOLTIP_PROBE__?.[input.relationId];
    if (input.action === "hover") void probe?.hover();
    if (input.action === "leave") void probe?.leave();
  });
}

export const TooltipCreateHandle = () => ({});

export function TooltipProvider({
  children,
  closeDelay = 0,
  delay = 600,
}: ElementProps & {
  readonly closeDelay?: number;
  readonly delay?: number;
}) {
  const value = useMemo(() => ({ closeDelay, delay }), [closeDelay, delay]);
  return (
    <TooltipProviderContext.Provider value={value}>{children}</TooltipProviderContext.Provider>
  );
}

export function Tooltip({ children }: ElementProps) {
  const provider = useContext(TooltipProviderContext);
  const [open, setOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<FloatingRect | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverInsideRef = useRef(false);
  const setHover = useCallback(
    (inside: boolean, rect?: FloatingRect) => {
      if (inside && rect) setAnchorRect(rect);
      if (hoverInsideRef.current === inside) return;
      hoverInsideRef.current = inside;
      if (timerRef.current !== null) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      const delay = inside ? provider.delay : provider.closeDelay;
      if (delay <= 0) {
        setOpen(inside);
        return;
      }
      timerRef.current = setTimeout(() => {
        setOpen(inside);
        timerRef.current = null;
      }, delay);
    },
    [provider.closeDelay, provider.delay],
  );
  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );
  const value = useMemo(() => ({ anchorRect, open, setHover }), [anchorRect, open, setHover]);
  return <TooltipContext.Provider value={value}>{children}</TooltipContext.Provider>;
}

export function TooltipTrigger({ children, render, ...props }: ElementProps) {
  const context = useContext(TooltipContext);
  const tooltipOpen = context?.open === true;
  const triggerRef = useMainThreadRef<MainThreadElement>(null);
  const reportHover = useCallback(
    (inside: boolean, rect?: FloatingRect) => context?.setHover(inside, rect),
    [context],
  );
  const handleMouseMove = async () => {
    "main thread";
    if (tooltipOpen) return;
    const trigger = triggerRef.current;
    if (!trigger) return;
    trigger.setAttribute("data-tooltip-pointer-inside", "true");
    const measured = (await trigger.invoke("boundingClientRect", {
      relativeTo: null,
    })) as Partial<{
      readonly height: number;
      readonly left: number;
      readonly top: number;
      readonly width: number;
    }> | null;
    if (trigger.getAttribute("data-tooltip-pointer-inside") !== "true") return;
    if (
      !measured ||
      typeof measured.left !== "number" ||
      typeof measured.top !== "number" ||
      typeof measured.width !== "number" ||
      typeof measured.height !== "number"
    ) {
      return;
    }
    const rect = {
      x: measured.left,
      y: measured.top,
      width: measured.width,
      height: measured.height,
    };
    trigger.setAttribute("data-floating-anchor-rect", JSON.stringify(rect));
    await runOnBackground(reportHover)(true, rect);
  };
  const handleMouseLeave = () => {
    "main thread";
    triggerRef.current?.setAttribute("data-tooltip-pointer-inside", "false");
    runOnBackground(reportHover)(false);
  };
  const relationId =
    props["data-floating-anchor"] ??
    (isValidElement(render) ? render.props["data-floating-anchor"] : undefined);
  const renderedMouseEnter = isValidElement(render)
    ? (render.props.onMouseEnter as (() => void) | undefined)
    : undefined;
  const renderedMouseLeave = isValidElement(render)
    ? (render.props.onMouseLeave as (() => void) | undefined)
    : undefined;
  useEffect(() => {
    if (typeof relationId !== "string") return;
    const target = globalThis as {
      __T3_LYNXTRON_VIEWPORT_PROBE__?: unknown;
      __T3_LYNXTRON_TOOLTIP_PROBE__?: Record<
        string,
        { readonly hover: () => Promise<void>; readonly leave: () => Promise<void> }
      >;
    };
    if (!target.__T3_LYNXTRON_VIEWPORT_PROBE__) return;
    const probes = target.__T3_LYNXTRON_TOOLTIP_PROBE__ ?? {};
    const probe = {
      hover: async () => {
        renderedMouseEnter?.();
        await runOnMainThread(handleMouseMove)();
      },
      leave: async () => {
        renderedMouseLeave?.();
        await runOnMainThread(handleMouseLeave)();
      },
    };
    probes[relationId] = probe;
    target.__T3_LYNXTRON_TOOLTIP_PROBE__ = probes;
    installTooltipTestBridge();
    return () => {
      if (probes[relationId] === probe) delete probes[relationId];
      if (Object.keys(probes).length === 0) delete target.__T3_LYNXTRON_TOOLTIP_PROBE__;
    };
  }, [handleMouseMove, relationId, renderedMouseEnter, renderedMouseLeave, reportHover]);
  const hoverProps = {
    "main-thread:ref": triggerRef,
    "main-thread:bindmouseleave": handleMouseLeave,
    "main-thread:bindmousemove": handleMouseMove,
  };
  if (isValidElement(render)) {
    return cloneElement(render, { ...props, ...hoverProps, children });
  }
  return (
    <view {...props} {...hoverProps}>
      {children}
    </view>
  );
}

export function TooltipPopup({
  align = "center",
  children,
  hidden = false,
  relationId,
  side = "top",
  sideOffset = 4,
  variant = "default",
  ...props
}: ElementProps & {
  readonly align?: FloatingAlign;
  readonly hidden?: boolean;
  readonly relationId?: string;
  readonly side?: FloatingSide;
  readonly sideOffset?: number;
  readonly variant?: "default" | "glass";
}) {
  const context = useContext(TooltipContext);
  const anchorRect = context?.anchorRect ?? null;
  const content =
    typeof children === "string" || typeof children === "number" ? (
      <text className="lynx-tooltip-text">{children}</text>
    ) : (
      children
    );
  const reportHover = useCallback(
    (inside: boolean, rect?: FloatingRect) => context?.setHover(inside, rect),
    [context],
  );
  const handleGlobalMouseMove = (event: MainThreadMouseEvent) => {
    "main thread";
    const rect = anchorRect;
    if (!rect) return;
    const x = event.x;
    const y = event.y;
    const inside =
      x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
    if (!inside) runOnBackground(reportHover)(false, rect);
  };
  if (!context?.open || !context.anchorRect || hidden) return null;
  const point = resolveFloatingAnchorPoint(context.anchorRect, {
    side,
    align,
    sideOffset,
  });
  return (
    <overlay level="1" className="lynx-tooltip-overlay">
      <view
        {...props}
        event-through
        className={`lynx-tooltip-popup${props.className ? ` ${props.className}` : ""}`}
        data-floating-popup={relationId}
        data-floating-side={side}
        data-floating-align={align}
        data-floating-side-offset={String(sideOffset)}
        main-thread:global-bindmousemove={handleGlobalMouseMove}
        style={{
          left: `${point.x}px`,
          top: `${point.y}px`,
          transform: point.transform,
        }}
      >
        <view className={`lynx-tooltip-content-motion lynx-tooltip-content-motion--${variant}`}>
          {content}
        </view>
      </view>
    </overlay>
  );
}

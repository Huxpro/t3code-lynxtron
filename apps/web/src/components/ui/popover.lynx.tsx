import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  runOnBackground,
  useCallback,
  useContext,
  useMainThreadRef,
  useMemo,
  useState,
} from "@lynx-js/react";
import {
  resolveFloatingFixedPosition,
  type FloatingAlign,
  type FloatingRect,
  type FloatingSide,
} from "@t3tools/client-runtime/presentation/floating-relation";
import { useViewportSnapshot } from "../../hooks/useViewportSnapshot";

type ElementProps = Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly render?: ReactElement<Record<string, unknown>>;
};

interface PopoverContextValue {
  readonly anchorRect: FloatingRect | null;
  readonly open: boolean;
  readonly setAnchorRect: (rect: FloatingRect) => void;
  readonly setOpen: (open: boolean) => void;
}

interface MainThreadElement {
  invoke(methodName: string, params?: Record<string, unknown>): Promise<unknown>;
}

const PopoverContext = createContext<PopoverContextValue | null>(null);

export const PopoverCreateHandle = () => ({});

export function Popover({
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
}: ElementProps & {
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const [anchorRect, setAnchorRect] = useState<FloatingRect | null>(null);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );
  const value = useMemo(
    () => ({ anchorRect, open, setAnchorRect, setOpen }),
    [anchorRect, open, setOpen],
  );
  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>;
}

export function PopoverTrigger({ children, render, ...props }: ElementProps) {
  const context = useContext(PopoverContext);
  const triggerRef = useMainThreadRef<MainThreadElement>(null);
  const toggle = useCallback(
    (rect: FloatingRect) => {
      context?.setAnchorRect(rect);
      context?.setOpen(!context.open);
    },
    [context],
  );
  const handleTap = async () => {
    "main thread";
    const measured = (await triggerRef.current?.invoke("boundingClientRect", {
      relativeTo: null,
    })) as Partial<{
      readonly height: number;
      readonly left: number;
      readonly top: number;
      readonly width: number;
    }> | null;
    if (
      !measured ||
      typeof measured.left !== "number" ||
      typeof measured.top !== "number" ||
      typeof measured.width !== "number" ||
      typeof measured.height !== "number"
    )
      return;
    runOnBackground(toggle)({
      x: measured.left,
      y: measured.top,
      width: measured.width,
      height: measured.height,
    });
  };
  const triggerProps = {
    "main-thread:ref": triggerRef,
    "main-thread:bindtap": handleTap,
  };
  if (isValidElement(render)) {
    return cloneElement(render, { ...props, ...triggerProps, children } as any);
  }
  return (
    <view {...props} {...(triggerProps as any)}>
      {children}
    </view>
  );
}

export function PopoverPopup({
  align = "center",
  alignOffset = 0,
  children,
  className,
  side = "bottom",
  sideOffset = 4,
  viewportClassName: _viewportClassName,
  tooltipStyle: _tooltipStyle,
  anchor: _anchor,
  ...props
}: ElementProps & {
  readonly align?: FloatingAlign;
  readonly alignOffset?: number;
  readonly side?: FloatingSide;
  readonly sideOffset?: number;
}) {
  const context = useContext(PopoverContext);
  const viewport = useViewportSnapshot();
  if (!context?.open || !context.anchorRect) return null;
  const position = resolveFloatingFixedPosition(
    context.anchorRect,
    { align, alignOffset, side, sideOffset },
    viewport.height,
  );
  return (
    <>
      <view
        {...props}
        className={["lynx-popover-popup", className].filter(Boolean).join(" ")}
        data-slot="popover-popup"
        style={{
          position: "fixed",
          ...position,
          zIndex: 161,
        }}
        catchtap={() => {}}
      >
        {children}
      </view>
      <view
        aria-hidden="true"
        className="lynx-popover-dismiss-layer"
        style={{
          position: "fixed",
          inset: "0px",
          zIndex: 160,
        }}
        bindtap={() => context.setOpen(false)}
      />
    </>
  );
}

export function PopoverClose({ children, render, ...props }: ElementProps) {
  const context = useContext(PopoverContext);
  const handleTap = useCallback(() => context?.setOpen(false), [context]);
  if (isValidElement(render)) {
    return cloneElement(render, { ...props, children, bindtap: handleTap, onClick: handleTap });
  }
  return (
    <view {...props} bindtap={handleTap}>
      {children}
    </view>
  );
}

export function PopoverTitle({ children, ...props }: ElementProps) {
  return (
    <text {...props} data-slot="popover-title">
      {children}
    </text>
  );
}

export function PopoverDescription({ children, ...props }: ElementProps) {
  return (
    <text {...props} data-slot="popover-description">
      {children}
    </text>
  );
}

export { PopoverPopup as PopoverContent };

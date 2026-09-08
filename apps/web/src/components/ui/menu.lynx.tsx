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
  useState,
} from "@lynx-js/react";
import {
  resolveFloatingAnchorPoint,
  type FloatingAlign,
  type FloatingRect,
  type FloatingSide,
} from "@t3tools/client-runtime/presentation/floating-relation";
import { HostView } from "./hostElements";
import { useViewportSnapshot } from "../../hooks/useViewportSnapshot";

type ElementProps = Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly render?: ReactElement<Record<string, unknown>>;
};

function classes(...values: ReadonlyArray<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

interface MenuContextValue {
  readonly anchorRect: FloatingRect | null;
  readonly open: boolean;
  readonly setAnchorRect: (rect: FloatingRect) => void;
  readonly setOpen: (open: boolean) => void;
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

interface GlobalEventEmitterLike {
  addListener?: (eventName: string, listener: (value: unknown) => void) => void;
}

declare const lynx:
  | {
      getJSModule?: (name: string) => GlobalEventEmitterLike | undefined;
    }
  | undefined;

const T3_MENU_TEST_EVENT = "t3:menu-test";
let menuTestBridgeInstalled = false;

function installMenuTestBridge(): void {
  "background only";
  if (menuTestBridgeInstalled) return;
  let registry: GlobalEventEmitterLike | undefined;
  try {
    registry = typeof lynx !== "undefined" ? lynx.getJSModule?.("GlobalEventEmitter") : undefined;
  } catch {
    registry = undefined;
  }
  if (!registry?.addListener) return;
  menuTestBridgeInstalled = true;
  registry.addListener(T3_MENU_TEST_EVENT, (value: unknown) => {
    const relationId =
      typeof value === "object" && value !== null
        ? (value as { readonly relationId?: unknown }).relationId
        : null;
    if (typeof relationId !== "string") return;
    void (
      globalThis as { __T3_LYNXTRON_MENU_PROBE__?: Record<string, () => Promise<void>> }
    ).__T3_LYNXTRON_MENU_PROBE__?.[relationId]?.();
  });
}

interface RadioContextValue {
  readonly onValueChange?: (value: string) => void;
  readonly value?: string;
}

const MenuContext = createContext<MenuContextValue | null>(null);
const RadioContext = createContext<RadioContextValue>({});

export const MenuCreateHandle = () => ({});

export function Menu({
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
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function MenuTrigger({ children, render, ...props }: ElementProps) {
  const menuProbeEnabled = useViewportSnapshot().testResize === true;
  const context = useContext(MenuContext);
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
    const trigger = triggerRef.current;
    if (!trigger) return;
    const measured = (await trigger.invoke("boundingClientRect", {
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
    runOnBackground(toggle)(rect);
  };
  const triggerProps = {
    "main-thread:ref": triggerRef,
    "main-thread:bindtap": handleTap,
  };
  const relationId =
    props["data-floating-anchor"] ??
    (isValidElement(render) ? render.props["data-floating-anchor"] : undefined);
  useEffect(() => {
    if (!menuProbeEnabled || typeof relationId !== "string") return;
    const target = globalThis as {
      __T3_LYNXTRON_MENU_PROBE__?: Record<string, () => Promise<void>>;
    };
    const probes = target.__T3_LYNXTRON_MENU_PROBE__ ?? {};
    probes[relationId] = () => runOnMainThread(handleTap)();
    target.__T3_LYNXTRON_MENU_PROBE__ = probes;
    installMenuTestBridge();
    return () => {
      delete probes[relationId];
    };
  }, [handleTap, menuProbeEnabled, relationId]);
  if (isValidElement(render)) {
    return cloneElement(render, { ...props, ...triggerProps, children });
  }
  return (
    <view {...props} {...triggerProps}>
      {children}
    </view>
  );
}

export function MenuPopup({
  align = "center",
  children,
  className,
  side = "bottom",
  sideOffset = 4,
  relationId,
  ...props
}: ElementProps & {
  readonly align?: FloatingAlign;
  readonly relationId?: string;
  readonly side?: FloatingSide;
  readonly sideOffset?: number;
}) {
  const context = useContext(MenuContext);
  if (!context?.open) return null;
  const isSidebarScopePopup = className?.includes("sidebar-v2-scope-popup") ?? false;
  const isAnchoredPopup = typeof relationId === "string";
  const sideClass = side === "top" ? "bottom-full mb-1" : "top-full mt-1";
  const alignClass = align === "end" ? "right-0" : align === "start" ? "left-0" : "left-0";
  if (isSidebarScopePopup || isAnchoredPopup) {
    if (!context.anchorRect) return null;
    const point = resolveFloatingAnchorPoint(context.anchorRect, {
      side,
      align,
      sideOffset,
    });
    const callerStyle =
      typeof props.style === "object" && props.style !== null
        ? (props.style as Record<string, string>)
        : {};
    return (
      <>
        <view
          {...props}
          data-floating-popup={relationId}
          data-floating-side={side}
          data-floating-align={align}
          data-floating-side-offset={String(sideOffset)}
          className={classes(
            "lynx-menu-popup flex max-h-64 min-w-32 flex-col overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
            className,
          )}
          style={{
            ...callerStyle,
            position: "fixed",
            left: `${point.x}px`,
            top: `${point.y}px`,
            transform: point.transform,
            zIndex: 161,
          }}
          catchtap={() => {}}
        >
          {children}
        </view>
        <view
          aria-hidden="true"
          className="lynx-menu-dismiss-layer fixed bottom-0 left-0 right-0 top-0"
          style={{
            position: "fixed",
            top: "0px",
            right: "0px",
            bottom: "0px",
            left: "0px",
            zIndex: 160,
          }}
          bindtap={() => context.setOpen(false)}
        />
      </>
    );
  }
  return (
    <>
      <view
        aria-hidden="true"
        className="lynx-menu-dismiss-layer fixed bottom-0 left-[var(--sidebar-width)] right-0 top-0 z-40"
        bindtap={() => context.setOpen(false)}
      />
      <view
        {...props}
        data-floating-popup={relationId}
        data-floating-side={side}
        data-floating-align={align}
        data-floating-side-offset={String(sideOffset)}
        className={classes(
          "lynx-menu-popup absolute z-50 flex max-h-64 w-full flex-col overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
          sideClass,
          alignClass,
          className,
        )}
      >
        {children}
      </view>
    </>
  );
}

export function MenuRadioGroup({
  children,
  className,
  onValueChange,
  value,
  ...props
}: ElementProps & {
  readonly onValueChange?: (value: string) => void;
  readonly value?: string;
}) {
  return (
    <RadioContext.Provider value={{ onValueChange, value }}>
      <view {...props} className={classes("flex w-full flex-col", className)}>
        {children}
      </view>
    </RadioContext.Provider>
  );
}

export function MenuRadioItem({
  children,
  className,
  disabled = false,
  onContextMenu,
  value,
  ...props
}: ElementProps & {
  readonly disabled?: boolean;
  readonly onContextMenu?: (event: unknown) => void;
  readonly value: string;
}) {
  const menu = useContext(MenuContext);
  const radio = useContext(RadioContext);
  const handleTap = useCallback(() => {
    if (disabled) return;
    radio.onValueChange?.(value);
    menu?.setOpen(false);
  }, [disabled, menu, radio, value]);
  return (
    <HostView
      {...props}
      className={classes(
        "lynx-menu-radio-item flex h-8 min-h-8 w-full flex-row items-center gap-2 rounded-sm px-2 py-0 text-sm text-popover-foreground",
        radio.value === value ? "bg-accent" : undefined,
        disabled ? "opacity-50" : undefined,
        className,
      )}
      data-checked={radio.value === value}
      onClick={handleTap}
      onContextMenu={onContextMenu}
    >
      {children}
    </HostView>
  );
}

export const MenuPortal = ({ children }: ElementProps) => <>{children}</>;
export const MenuGroup = ({ children, className, ...props }: ElementProps) => (
  <view
    {...props}
    className={classes("lynx-menu-group flex w-full flex-col", className)}
    data-slot="menu-group"
  >
    {children}
  </view>
);
export const MenuGroupLabel = ({ children, className, ...props }: ElementProps) => (
  <text {...props} className={classes("lynx-menu-group-label", className)} data-slot="menu-label">
    {children}
  </text>
);
export function MenuItem({
  children,
  className,
  disabled = false,
  onClick,
  ...props
}: ElementProps & {
  readonly disabled?: boolean;
  readonly onClick?: () => void;
}) {
  const menu = useContext(MenuContext);
  const handleTap = useCallback(() => {
    if (disabled) return;
    onClick?.();
    menu?.setOpen(false);
  }, [disabled, menu, onClick]);
  return (
    <HostView
      {...props}
      aria-disabled={disabled ? "true" : undefined}
      className={classes(
        "lynx-menu-item flex min-h-8 w-full flex-row items-center gap-2 rounded-sm px-2 py-1 text-sm text-popover-foreground",
        disabled ? "opacity-50" : undefined,
        className,
      )}
      data-slot="menu-item"
      onClick={handleTap}
    >
      {children}
    </HostView>
  );
}
export const MenuCheckboxItem = MenuGroup;
export const MenuSeparator = ({ className, ...props }: ElementProps) => (
  <view
    {...props}
    className={classes("lynx-menu-separator", className)}
    data-slot="menu-separator"
  />
);
export const MenuShortcut = ({ children, className, ...props }: ElementProps) => (
  <text {...props} className={classes("lynx-menu-shortcut", className)} data-slot="menu-shortcut">
    {children}
  </text>
);
export const MenuSub = Menu;
export const MenuSubTrigger = MenuTrigger;
export const MenuSubPopup = MenuPopup;

export {
  Menu as DropdownMenu,
  MenuCheckboxItem as DropdownMenuCheckboxItem,
  MenuPopup as DropdownMenuContent,
  MenuCreateHandle as DropdownMenuCreateHandle,
  MenuGroup as DropdownMenuGroup,
  MenuItem as DropdownMenuItem,
  MenuGroupLabel as DropdownMenuLabel,
  MenuPortal as DropdownMenuPortal,
  MenuRadioGroup as DropdownMenuRadioGroup,
  MenuRadioItem as DropdownMenuRadioItem,
  MenuSeparator as DropdownMenuSeparator,
  MenuShortcut as DropdownMenuShortcut,
  MenuSub as DropdownMenuSub,
  MenuSubPopup as DropdownMenuSubContent,
  MenuSubTrigger as DropdownMenuSubTrigger,
  MenuTrigger as DropdownMenuTrigger,
};

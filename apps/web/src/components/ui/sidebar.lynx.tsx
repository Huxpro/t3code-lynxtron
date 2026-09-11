import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "@lynx-js/react";
import {
  THREAD_SIDEBAR_DEFAULT_WIDTH,
  THREAD_SIDEBAR_MIN_WIDTH,
  THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
  isThreadMobileSidebarViewport,
  resolveInitialThreadSidebarWidth,
  resolveResponsiveThreadSidebarWidth,
  resolveResponsiveThreadSidebarMaximumWidth,
  resolveThreadMobileSidebarWidth,
} from "@t3tools/client-runtime/presentation/sidebar-width";

import { useIsMobile } from "../../hooks/useMediaQuery";
import { useViewportSnapshot } from "../../hooks/useViewportSnapshot";
import { clientCapabilities } from "../../platform/clientCapabilities";
import { useResizableWidth } from "../../../../lynxtron/src/app/hooks/useResizableWidth";
import { cn } from "../../lib/utils";
import { onSidebarToggleRequest } from "./sidebarCommandBus.lynx";

type ElementProps = Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
};

interface SidebarContextValue {
  readonly isMobile: boolean;
  readonly open: boolean;
  readonly openMobile: boolean;
  readonly sidebarWidth: number;
  readonly setOpen: (open: boolean) => void;
  readonly setOpenMobile: (open: boolean) => void;
  readonly setSidebarWidth: (width: number) => void;
  readonly state: "expanded" | "collapsed";
  readonly toggleSidebar: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar(): SidebarContextValue {
  const value = useContext(SidebarContext);
  if (!value) throw new Error("useSidebar must be used within a SidebarProvider.");
  return value;
}

export function useSidebarVisibility(): boolean {
  const { isMobile, open, openMobile } = useSidebar();
  return isMobile ? openMobile : open;
}

export function SidebarProvider({
  children,
  className,
  defaultOpen = true,
  open: controlledOpen,
  onOpenChange,
  ...props
}: ElementProps & {
  readonly defaultOpen?: boolean;
  readonly open?: boolean;
  readonly onOpenChange?: (open: boolean) => void;
}) {
  const isMobile = useIsMobile();
  const viewport = useViewportSnapshot();
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const [openMobile, setOpenMobile] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = clientCapabilities.storage.getItem(THREAD_SIDEBAR_WIDTH_STORAGE_KEY);
    const parsed = stored === null ? null : Number(JSON.parse(stored));
    return resolveResponsiveThreadSidebarWidth(
      Number.isFinite(parsed) ? parsed : null,
      viewport.width,
    );
  });
  const open = controlledOpen ?? localOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setLocalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );
  const toggleSidebar = useCallback(() => {
    if (isMobile) {
      setOpenMobile((current) => !current);
      return;
    }
    setOpen(!open);
  }, [isMobile, open, setOpen]);
  const state = (isMobile ? openMobile : open) ? "expanded" : "collapsed";
  useEffect(() => onSidebarToggleRequest(toggleSidebar), [toggleSidebar]);
  useEffect(() => {
    if (isMobile || isThreadMobileSidebarViewport(viewport.width)) return;
    setSidebarWidth((current) => resolveInitialThreadSidebarWidth(current, viewport.width));
  }, [isMobile, viewport.width]);
  useEffect(() => {
    if (!viewport.testResize) return;
    (
      globalThis as {
        __T3_LYNXTRON_SIDEBAR_PROBE__?: (open: boolean) => void;
      }
    ).__T3_LYNXTRON_SIDEBAR_PROBE__ = setOpenMobile;
    (
      globalThis as {
        __T3_LYNXTRON_SIDEBAR_WIDTH_PROBE__?: (width: number) => void;
      }
    ).__T3_LYNXTRON_SIDEBAR_WIDTH_PROBE__ = (width) => {
      setSidebarWidth(resolveInitialThreadSidebarWidth(width, viewport.width));
    };
  }, [setOpenMobile, viewport.testResize]);
  const value = useMemo<SidebarContextValue>(
    () => ({
      isMobile,
      open,
      openMobile,
      sidebarWidth,
      setOpen,
      setOpenMobile,
      setSidebarWidth,
      state,
      toggleSidebar,
    }),
    [isMobile, open, openMobile, setOpen, sidebarWidth, state, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <view
        {...props}
        className={cn(
          "group/sidebar-wrapper flex min-h-0 w-full",
          `sidebar-wrapper--${state}`,
          sidebarWidth === THREAD_SIDEBAR_DEFAULT_WIDTH
            ? "sidebar-width-authority"
            : "sidebar-width-responsive",
          className,
        )}
        style={
          {
            ...(typeof props.style === "object" && props.style !== null ? props.style : {}),
            "--sidebar-width": `${sidebarWidth}px`,
          } as object
        }
        data-sidebar-state={value.state}
        data-sidebar-width={String(sidebarWidth)}
        data-slot="sidebar-wrapper"
      >
        {children}
      </view>
    </SidebarContext.Provider>
  );
}

export function Sidebar({
  children,
  className,
  ...props
}: ElementProps & {
  readonly side?: "left" | "right";
  readonly variant?: "sidebar" | "floating" | "inset";
  readonly collapsible?: "offcanvas" | "icon" | "none";
}) {
  const { isMobile, open, openMobile, setOpenMobile, sidebarWidth } = useSidebar();
  const viewport = useViewportSnapshot();
  const mobileWidth = resolveThreadMobileSidebarWidth(viewport.width);
  const style = {
    ...(typeof props.style === "object" && props.style !== null ? props.style : {}),
    width: isMobile ? `${mobileWidth}px` : "100%",
  };
  if (isMobile) {
    if (!openMobile) return null;
    return (
      <>
        <view className="sidebar-mobile-scrim" bindtap={() => setOpenMobile(false)} />
        <view
          {...props}
          className={cn(
            "sidebar-mobile-drawer flex h-full w-[var(--sidebar-width)] shrink-0 flex-col bg-sidebar text-sidebar-foreground",
            className,
          )}
          style={style}
          data-mobile="true"
          data-sidebar="sidebar"
          data-slot="sidebar"
        >
          {children}
        </view>
      </>
    );
  }
  return (
    <view
      className={`sidebar-shell sidebar-shell--${open ? "expanded" : "collapsed"}`}
      data-collapsible={open ? "" : "offcanvas"}
      data-side="left"
      data-slot="sidebar"
      data-state={open ? "expanded" : "collapsed"}
    >
      <view
        className={`sidebar-gap sidebar-gap--${open ? "expanded" : "collapsed"}`}
        style={{ width: open ? `${sidebarWidth}px` : "0px" }}
        data-slot="sidebar-gap"
      />
      <view
        className={`sidebar-container sidebar-container--${open ? "expanded" : "collapsed"}`}
        style={{
          left: open ? "0px" : `-${sidebarWidth}px`,
          width: `${sidebarWidth}px`,
        }}
        data-slot="sidebar-container"
      >
        <view
          {...props}
          className={cn(
            "sidebar-inner flex h-full w-full flex-col bg-sidebar text-sidebar-foreground",
            className,
          )}
          style={style}
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
        >
          {children}
        </view>
      </view>
    </view>
  );
}

export function SidebarTrigger({
  children,
  className,
  onClick,
  ...props
}: ElementProps & { readonly onClick?: (event: unknown) => void }) {
  const { toggleSidebar } = useSidebar();
  return (
    <view
      {...props}
      className={className}
      bindtap={(event: unknown) => {
        onClick?.(event);
        toggleSidebar();
      }}
      data-sidebar="trigger"
    >
      {children}
    </view>
  );
}

export function SidebarContent({
  children,
  className,
  fixedHeader,
  ...props
}: ElementProps & { readonly fixedHeader?: ReactNode }) {
  return (
    <>
      {fixedHeader ? <view className="w-full shrink-0">{fixedHeader}</view> : null}
      <scroll-view className="sidebar-content-scroll min-h-0 flex-1" scroll-y>
        <view
          {...props}
          className={cn("flex w-full min-w-0 flex-col gap-2", className)}
          data-sidebar="content"
        >
          {children}
        </view>
      </scroll-view>
    </>
  );
}

function Container({ children, className, ...props }: ElementProps) {
  return (
    <view {...props} className={className}>
      {children}
    </view>
  );
}

export function SidebarRail({ className, ...props }: ElementProps) {
  const { isMobile, open, sidebarWidth, setSidebarWidth } = useSidebar();
  const viewport = useViewportSnapshot();
  const resize = useResizableWidth({
    storageKey: THREAD_SIDEBAR_WIDTH_STORAGE_KEY,
    defaultWidth: sidebarWidth,
    minWidth: THREAD_SIDEBAR_MIN_WIDTH,
    maxWidth: resolveResponsiveThreadSidebarMaximumWidth(sidebarWidth, viewport.width),
    edge: "right",
    target: "sidebar",
    value: sidebarWidth,
    onResize: setSidebarWidth,
    testProbe: viewport.testResize,
  });
  const handleMouseEnter = () => {
    "main thread";
    resize.handleRef.current?.setAttribute("data-lynx-hover", "true");
  };
  const handleMouseLeave = () => {
    "main thread";
    resize.handleRef.current?.setAttribute("data-lynx-hover", "false");
  };

  if (isMobile || !open) return null;
  return (
    <>
      <view
        {...props}
        {...resize.handlers}
        {...resize.dragHandlers}
        main-thread:bindmouseenter={handleMouseEnter}
        main-thread:bindmousemove={handleMouseEnter}
        main-thread:bindmouseleave={handleMouseLeave}
        main-thread:ref={resize.handleRef}
        className={cn("sidebar-resize-rail", className)}
        data-sidebar="rail"
        data-slot="sidebar-rail"
      >
        <view className="sidebar-resize-rail__line" />
      </view>
    </>
  );
}

export function SidebarGroup({ children, className, ...props }: ElementProps) {
  return (
    <view
      {...props}
      className={cn("relative flex w-full min-w-0 flex-col p-2", className)}
      data-sidebar="group"
    >
      {children}
    </view>
  );
}

export function SidebarMenuButton({
  children,
  className,
  disabled = false,
  onClick,
  render: _render,
  ...props
}: ElementProps & {
  readonly disabled?: boolean;
  readonly onClick?: (event: unknown) => void;
  readonly render?: ReactElement<Record<string, unknown>>;
  readonly size?: "default" | "sm" | "lg";
}) {
  if (isValidElement(_render)) {
    return cloneElement(_render, {
      ...props,
      children,
      className: cn("flex min-w-0 items-center", disabled && "opacity-50", className),
      "data-sidebar": "menu-button",
    });
  }
  return (
    <view
      {...props}
      className={cn("flex min-w-0 items-center", disabled && "opacity-50", className)}
      bindtap={disabled ? undefined : onClick}
      data-sidebar="menu-button"
    >
      {children}
    </view>
  );
}

export const SidebarFooter = Container;
export const SidebarGroupAction = Container;
export const SidebarGroupContent = Container;
export const SidebarGroupLabel = Container;
export const SidebarHeader = Container;
export function SidebarInset({ children, className, ...props }: ElementProps) {
  return (
    <view {...props} className={cn("sidebar-inset", className)} data-slot="sidebar-inset">
      {children}
    </view>
  );
}
export const SidebarInput = Container;
export const SidebarMenu = Container;
export const SidebarMenuAction = Container;
export const SidebarMenuBadge = Container;
export const SidebarMenuItem = Container;
export const SidebarMenuSkeleton = Container;
export const SidebarMenuSub = Container;
export const SidebarMenuSubButton = Container;
export const SidebarMenuSubItem = Container;
export const SidebarSeparator = Container;

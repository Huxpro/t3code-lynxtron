import {
  cloneElement,
  createContext,
  isValidElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "@lynx-js/react";

import { cn } from "../../lib/utils";

type ElementProps = Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
};

interface SidebarContextValue {
  readonly isMobile: boolean;
  readonly open: boolean;
  readonly openMobile: boolean;
  readonly setOpen: (open: boolean) => void;
  readonly setOpenMobile: (open: boolean) => void;
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
  return useSidebar().open;
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
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? localOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setLocalOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );
  const toggleSidebar = useCallback(() => setOpen(!open), [open, setOpen]);
  const value = useMemo<SidebarContextValue>(
    () => ({
      isMobile: false,
      open,
      openMobile: false,
      setOpen,
      setOpenMobile: setOpen,
      state: open ? "expanded" : "collapsed",
      toggleSidebar,
    }),
    [open, setOpen, toggleSidebar],
  );

  return (
    <SidebarContext.Provider value={value}>
      <view
        {...props}
        className={cn("group/sidebar-wrapper flex min-h-0 w-full", className)}
        data-sidebar-state={value.state}
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
  const { open } = useSidebar();
  return (
    <view
      {...props}
      className={cn(
        "flex h-full w-[var(--sidebar-width)] shrink-0 flex-col bg-sidebar text-sidebar-foreground",
        !open && "hidden",
        className,
      )}
      data-sidebar="sidebar"
      data-slot="sidebar"
    >
      {children}
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
export const SidebarInset = Container;
export const SidebarInput = Container;
export const SidebarMenu = Container;
export const SidebarMenuAction = Container;
export const SidebarMenuBadge = Container;
export const SidebarMenuItem = Container;
export const SidebarMenuSkeleton = Container;
export const SidebarMenuSub = Container;
export const SidebarMenuSubButton = Container;
export const SidebarMenuSubItem = Container;
export const SidebarRail = Container;
export const SidebarSeparator = Container;

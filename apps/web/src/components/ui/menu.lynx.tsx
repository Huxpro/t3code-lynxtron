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

type ElementProps = Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly render?: ReactElement<Record<string, unknown>>;
};

function classes(...values: ReadonlyArray<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

interface MenuContextValue {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
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
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );
  const value = useMemo(() => ({ open, setOpen }), [open, setOpen]);
  return <MenuContext.Provider value={value}>{children}</MenuContext.Provider>;
}

export function MenuTrigger({ children, render, ...props }: ElementProps) {
  const context = useContext(MenuContext);
  const handleTap = useCallback(() => context?.setOpen(!context.open), [context]);
  if (isValidElement(render)) {
    return cloneElement(render, { ...props, children, bindtap: handleTap });
  }
  return (
    <view {...props} bindtap={handleTap}>
      {children}
    </view>
  );
}

export function MenuPopup({
  align = "center",
  children,
  className,
  side = "bottom",
  sideOffset: _sideOffset,
  ...props
}: ElementProps & {
  readonly align?: "center" | "end" | "start";
  readonly side?: "bottom" | "left" | "right" | "top";
  readonly sideOffset?: number;
}) {
  const context = useContext(MenuContext);
  if (!context?.open) return null;
  const isSidebarScopePopup = className?.includes("sidebar-v2-scope-popup") ?? false;
  const sideClass = side === "top" ? "bottom-full mb-1" : "top-full mt-1";
  const alignClass = align === "end" ? "right-0" : align === "start" ? "left-0" : "left-0";
  if (isSidebarScopePopup) {
    return (
      <overlay level="1" className="lynx-overlay-host">
        <view className="sidebar-v2-scope-overlay-root" style={{ width: "100vw", height: "100vh" }}>
          <view
            aria-hidden="true"
            className="lynx-menu-dismiss-layer"
            style={{ position: "absolute", inset: "0px", zIndex: 0 }}
            bindtap={() => context.setOpen(false)}
          />
          <view
            {...props}
            className={classes(
              "lynx-menu-popup flex max-h-64 w-full flex-col overflow-hidden rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md",
              className,
            )}
          >
            {children}
          </view>
        </view>
      </overlay>
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
  value,
  ...props
}: ElementProps & { readonly disabled?: boolean; readonly value: string }) {
  const menu = useContext(MenuContext);
  const radio = useContext(RadioContext);
  const handleTap = useCallback(() => {
    if (disabled) return;
    radio.onValueChange?.(value);
    menu?.setOpen(false);
  }, [disabled, menu, radio, value]);
  return (
    <view
      {...props}
      className={classes(
        "lynx-menu-radio-item flex h-8 min-h-8 w-full flex-row items-center gap-2 rounded-sm px-2 py-0 text-sm text-popover-foreground",
        radio.value === value ? "bg-accent" : undefined,
        disabled ? "opacity-50" : undefined,
        className,
      )}
      data-checked={radio.value === value}
      bindtap={handleTap}
    >
      {children}
    </view>
  );
}

export const MenuPortal = ({ children }: ElementProps) => <>{children}</>;
export const MenuGroup = ({ children, ...props }: ElementProps) => (
  <view {...props}>{children}</view>
);
export const MenuGroupLabel = MenuGroup;
export const MenuItem = MenuGroup;
export const MenuCheckboxItem = MenuGroup;
export const MenuSeparator = MenuGroup;
export const MenuShortcut = MenuGroup;
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

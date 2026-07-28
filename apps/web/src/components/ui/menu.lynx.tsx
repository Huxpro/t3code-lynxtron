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

export function MenuPopup({ children, ...props }: ElementProps) {
  const context = useContext(MenuContext);
  if (!context?.open) return null;
  return <view {...props}>{children}</view>;
}

export function MenuRadioGroup({
  children,
  onValueChange,
  value,
  ...props
}: ElementProps & {
  readonly onValueChange?: (value: string) => void;
  readonly value?: string;
}) {
  return (
    <RadioContext.Provider value={{ onValueChange, value }}>
      <view {...props}>{children}</view>
    </RadioContext.Provider>
  );
}

export function MenuRadioItem({
  children,
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
    <view {...props} data-checked={radio.value === value} bindtap={handleTap}>
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

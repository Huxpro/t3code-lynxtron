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

interface PopoverContextValue {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
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
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      if (controlledOpen === undefined) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [controlledOpen, onOpenChange],
  );
  const value = useMemo(() => ({ open, setOpen }), [open, setOpen]);
  return <PopoverContext.Provider value={value}>{children}</PopoverContext.Provider>;
}

export function PopoverTrigger({ children, render, ...props }: ElementProps) {
  const context = useContext(PopoverContext);
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

export function PopoverPopup({ children, ...props }: ElementProps) {
  const context = useContext(PopoverContext);
  if (!context?.open) return null;
  return <view {...props}>{children}</view>;
}

export function PopoverClose({ children, render, ...props }: ElementProps) {
  const context = useContext(PopoverContext);
  const handleTap = useCallback(() => context?.setOpen(false), [context]);
  if (isValidElement(render)) {
    return cloneElement(render, { ...props, children, bindtap: handleTap });
  }
  return (
    <view {...props} bindtap={handleTap}>
      {children}
    </view>
  );
}

export function PopoverTitle({ children, ...props }: ElementProps) {
  return <text {...props}>{children}</text>;
}

export function PopoverDescription({ children, ...props }: ElementProps) {
  return <text {...props}>{children}</text>;
}

export { PopoverPopup as PopoverContent };

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

interface SheetContextValue {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

const SheetContext = createContext<SheetContextValue | null>(null);

export function Sheet({
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
  return <SheetContext.Provider value={value}>{children}</SheetContext.Provider>;
}

export function SheetTrigger({ children, render, ...props }: ElementProps) {
  const context = useContext(SheetContext);
  const handleTap = useCallback(() => context?.setOpen(true), [context]);
  if (isValidElement(render)) {
    return cloneElement(render, { ...props, children, bindtap: handleTap, onClick: handleTap });
  }
  return (
    <view {...props} bindtap={handleTap}>
      {children}
    </view>
  );
}

export function SheetClose({ children, render, ...props }: ElementProps) {
  const context = useContext(SheetContext);
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

export function SheetBackdrop({ className, ...props }: ElementProps) {
  const context = useContext(SheetContext);
  return (
    <view
      {...props}
      className={["ui-sheet-backdrop", className].filter(Boolean).join(" ")}
      data-slot="sheet-backdrop"
      bindtap={() => context?.setOpen(false)}
    />
  );
}

export function SheetViewport({ children, className, ...props }: ElementProps) {
  return (
    <view
      {...props}
      className={["ui-sheet-viewport", className].filter(Boolean).join(" ")}
      data-slot="sheet-viewport"
    >
      {children}
    </view>
  );
}

export function SheetPopup({
  children,
  className,
  showCloseButton: _showCloseButton,
  keepMounted: _keepMounted,
  side = "right",
  variant: _variant,
  ...props
}: ElementProps & { readonly side?: "right" | "left" | "top" | "bottom" }) {
  const context = useContext(SheetContext);
  if (!context?.open) return null;
  return (
    <>
      <SheetBackdrop />
      <SheetViewport className={`ui-sheet-viewport--${side}`}>
        <view
          {...props}
          className={["ui-sheet-popup flex flex-col", `ui-sheet-popup--${side}`, className]
            .filter(Boolean)
            .join(" ")}
          data-slot="sheet-popup"
        >
          {children}
        </view>
      </SheetViewport>
    </>
  );
}

function Container({ children, ...props }: ElementProps) {
  return <view {...props}>{children}</view>;
}

export const SheetPortal = ({ children }: ElementProps) => <>{children}</>;
export const SheetOverlay = SheetBackdrop;
export const SheetContent = SheetPopup;
export const SheetHeader = Container;
export const SheetFooter = Container;
export const SheetTitle = ({ children, ...props }: ElementProps) => (
  <text {...props}>{children}</text>
);
export const SheetDescription = ({ children, ...props }: ElementProps) => (
  <text {...props}>{children}</text>
);
export const SheetPanel = Container;

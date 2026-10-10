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
  readonly children?: ReactNode | undefined;
  readonly className?: string;
  readonly render?: ReactElement<Record<string, unknown>> | undefined;
};

interface DialogContextValue {
  readonly open: boolean;
  readonly setOpen: (open: boolean) => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function Dialog({
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
  return <DialogContext.Provider value={value}>{children}</DialogContext.Provider>;
}

export function DialogTrigger({ children, render, ...props }: ElementProps) {
  const context = useContext(DialogContext);
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

export function DialogBackdrop({ className, ...props }: ElementProps) {
  const context = useContext(DialogContext);
  const handleTap = useCallback(() => context?.setOpen(false), [context]);
  return (
    <view
      {...props}
      className={["ui-dialog-backdrop", className].filter(Boolean).join(" ")}
      data-slot="dialog-backdrop"
      bindtap={handleTap}
    />
  );
}

export function DialogViewport({ children, className, ...props }: ElementProps) {
  return (
    <view
      {...props}
      className={["ui-dialog-viewport", className].filter(Boolean).join(" ")}
      data-slot="dialog-viewport"
    >
      {children}
    </view>
  );
}

export function DialogPopup({
  children,
  className,
  showCloseButton: _showCloseButton,
  bottomStickOnMobile: _bottomStickOnMobile,
  ...props
}: ElementProps) {
  const context = useContext(DialogContext);
  if (!context?.open) return null;
  return (
    <>
      <DialogBackdrop />
      <DialogViewport>
        <view
          {...props}
          className={["ui-dialog-popup flex flex-col", className].filter(Boolean).join(" ")}
          data-slot="dialog-popup"
        >
          {children}
        </view>
      </DialogViewport>
    </>
  );
}

export function DialogClose({ children, render, ...props }: ElementProps) {
  const context = useContext(DialogContext);
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

function DialogHeader({ children, ...props }: ElementProps) {
  return (
    <view {...props} data-slot="dialog-header">
      {children}
    </view>
  );
}

function DialogFooter({ children, variant: _variant, ...props }: ElementProps) {
  return (
    <view {...props} data-slot="dialog-footer">
      {children}
    </view>
  );
}

function DialogPanel({ children, scrollFade: _scrollFade, ...props }: ElementProps) {
  return (
    <view {...props} data-slot="dialog-panel">
      {children}
    </view>
  );
}

export function DialogTitle({ children, ...props }: ElementProps) {
  return (
    <text {...props} data-slot="dialog-title">
      {children}
    </text>
  );
}

export function DialogDescription({ children, ...props }: ElementProps) {
  return (
    <text {...props} data-slot="dialog-description">
      {children}
    </text>
  );
}

export const DialogContent = DialogPopup;
export { DialogFooter, DialogHeader, DialogPanel };
export const DialogPortal = ({ children }: ElementProps) => <>{children}</>;
export const DialogOverlay = DialogBackdrop;
export const DialogCreateHandle = () => ({});

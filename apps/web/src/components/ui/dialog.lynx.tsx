import type { ReactNode } from "react";

type ChildrenProps = {
  children?: ReactNode;
  className?: string;
  [key: string]: unknown;
};

export function Dialog({
  children,
  open = false,
}: ChildrenProps & { open?: boolean; defaultOpen?: boolean }) {
  return open ? <>{children}</> : null;
}

export function DialogPopup({ children, ...props }: ChildrenProps) {
  return <div {...props}>{children}</div>;
}

export const DialogContent = DialogPopup;
export const DialogViewport = DialogPopup;
export const DialogPanel = DialogPopup;
export const DialogHeader = DialogPopup;
export const DialogFooter = DialogPopup;
export const DialogTitle = DialogPopup;
export const DialogDescription = DialogPopup;
export const DialogPortal = ({ children }: ChildrenProps) => <>{children}</>;
export const DialogBackdrop = (_props: ChildrenProps) => null;
export const DialogOverlay = DialogBackdrop;
export const DialogClose = ({ children, ...props }: ChildrenProps) => (
  <button {...props}>{children}</button>
);
export const DialogTrigger = DialogClose;
export const DialogCreateHandle = () => ({});

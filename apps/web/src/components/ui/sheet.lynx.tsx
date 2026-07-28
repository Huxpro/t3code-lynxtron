import type { ReactNode } from "@lynx-js/react";

type ElementProps = Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
};

export function Sheet({ children, open = false }: ElementProps & { readonly open?: boolean }) {
  return open ? <>{children}</> : null;
}

export const SheetPortal = ({ children }: ElementProps) => <>{children}</>;
export const SheetBackdrop = (_props: ElementProps) => null;
export const SheetOverlay = SheetBackdrop;
export const SheetViewport = ({ children, ...props }: ElementProps) => (
  <view {...props}>{children}</view>
);
export const SheetPopup = SheetViewport;
export const SheetContent = SheetPopup;
export const SheetHeader = SheetViewport;
export const SheetFooter = SheetViewport;
export const SheetTitle = SheetViewport;
export const SheetDescription = SheetViewport;
export const SheetPanel = SheetViewport;
export const SheetTrigger = SheetViewport;
export const SheetClose = SheetViewport;

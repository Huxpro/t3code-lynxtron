import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "@lynx-js/react";

type ElementProps = Record<string, unknown> & {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly render?: ReactElement<Record<string, unknown>>;
};

export const CommandCreateHandle = () => ({});

export function CommandDialog({
  children,
  open = false,
}: ElementProps & { readonly open?: boolean }) {
  return open ? <>{children}</> : null;
}

export function CommandDialogTrigger({ children, render, ...props }: ElementProps) {
  if (isValidElement(render)) {
    return cloneElement(render, { ...props, children });
  }
  return <view {...props}>{children}</view>;
}

const Container = ({ children, ...props }: ElementProps) => <view {...props}>{children}</view>;

export const CommandDialogPopup = Container;
export const Command = Container;
export const CommandCollection = Container;
export const CommandEmpty = Container;
export const CommandFooter = Container;
export const CommandGroup = Container;
export const CommandGroupLabel = Container;
export const CommandInput = Container;
export const CommandItem = Container;
export const CommandList = Container;
export const CommandPanel = Container;
export const CommandSeparator = Container;
export const CommandShortcut = Container;

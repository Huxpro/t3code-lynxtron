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
export function Command({ children, className, ...props }: ElementProps) {
  return (
    <view {...props} className={["ui-command", className].filter(Boolean).join(" ")}>
      {children}
    </view>
  );
}
export const CommandCollection = Container;
export const CommandEmpty = Container;
export const CommandFooter = Container;
export function CommandGroup({ children, className, ...props }: ElementProps) {
  return (
    <scroll-view
      {...props}
      className={["ui-command-group", className].filter(Boolean).join(" ")}
      data-slot="command-group"
      enable-scroll={false}
      scroll-y
    >
      {children}
    </scroll-view>
  );
}
export function CommandGroupLabel({ children, className, ...props }: ElementProps) {
  return (
    <view
      {...props}
      className={["ui-command-group-label", className].filter(Boolean).join(" ")}
      data-slot="command-group-label"
    >
      <text>{children}</text>
    </view>
  );
}
export const CommandInput = Container;
export function CommandItem({ children, className, ...props }: ElementProps) {
  return (
    <view
      {...props}
      className={["ui-command-item", className].filter(Boolean).join(" ")}
      data-slot="command-item"
    >
      {children}
    </view>
  );
}
export function CommandList({ children, className, ...props }: ElementProps) {
  return (
    <scroll-view
      {...props}
      className={["ui-command-list", className].filter(Boolean).join(" ")}
      data-slot="command-list"
      scroll-y
    >
      {children}
    </scroll-view>
  );
}
export const CommandPanel = Container;
export const CommandSeparator = Container;
export const CommandShortcut = Container;

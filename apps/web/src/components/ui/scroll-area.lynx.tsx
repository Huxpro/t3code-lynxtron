import { type ReactNode } from "@lynx-js/react";

export interface ScrollAreaProps {
  readonly chainVerticalScroll?: boolean;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly hideScrollbars?: boolean;
  readonly scrollFade?: boolean;
  readonly scrollbarGutter?: boolean;
}

export function ScrollArea({ chainVerticalScroll = true, children, className }: ScrollAreaProps) {
  return (
    <scroll-view
      className={className ? `lynx-scroll-area ${className}` : "lynx-scroll-area"}
      scroll-orientation="vertical"
      {...({ "enable-nested-scroll": chainVerticalScroll } as object)}
    >
      {children}
    </scroll-view>
  );
}

export function ScrollBar() {
  return null;
}

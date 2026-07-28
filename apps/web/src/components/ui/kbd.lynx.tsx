import type { ReactNode } from "@lynx-js/react";

interface KbdProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

export function Kbd({ children, className }: KbdProps) {
  return <text className={className ? `lynx-kbd ${className}` : "lynx-kbd"}>{children}</text>;
}

export function KbdGroup({ children, className }: KbdProps) {
  return (
    <view className={className ? `lynx-kbd-group ${className}` : "lynx-kbd-group"}>{children}</view>
  );
}

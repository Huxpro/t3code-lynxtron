import { type ReactNode } from "@lynx-js/react";

export interface LabelProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly render?: ReactNode;
}

export function Label({ children, className }: LabelProps) {
  return <text className={["ui-label", className].filter(Boolean).join(" ")}>{children}</text>;
}

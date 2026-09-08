import { type ReactNode } from "@lynx-js/react";

export interface LabelProps {
  readonly [key: string]: unknown;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly render?: ReactNode;
}

export function Label({ children, className, ...props }: LabelProps) {
  return (
    <text {...props} className={["ui-label", className].filter(Boolean).join(" ")}>
      {children}
    </text>
  );
}

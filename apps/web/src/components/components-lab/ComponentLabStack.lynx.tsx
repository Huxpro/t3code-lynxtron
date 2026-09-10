import type { ReactNode } from "@lynx-js/react";

export function ComponentLabStack({ children }: { readonly children: ReactNode }) {
  return (
    <scroll-view className="component-lab__stack" scroll-y>
      {children}
    </scroll-view>
  );
}

export function ComponentLabColumn({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <scroll-view className={["component-lab-specimen-stack", className].filter(Boolean).join(" ")}>
      {children}
    </scroll-view>
  );
}

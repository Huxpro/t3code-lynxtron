import type { ReactNode } from "react";

export function ComponentLabStack({ children }: { readonly children: ReactNode }) {
  return <div className="component-lab__stack">{children}</div>;
}

export function ComponentLabColumn({
  children,
  className,
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={["component-lab-specimen-stack", className].filter(Boolean).join(" ")}>
      {children}
    </div>
  );
}

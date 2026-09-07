import type { ReactNode } from "react";

export function ComponentLabStack({ children }: { readonly children: ReactNode }) {
  return <div className="component-lab__stack">{children}</div>;
}

export function ComponentLabColumn({ children }: { readonly children: ReactNode }) {
  return <div className="component-lab-specimen-stack">{children}</div>;
}

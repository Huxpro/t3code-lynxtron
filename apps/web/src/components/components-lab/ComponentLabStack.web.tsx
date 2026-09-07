import type { ReactNode } from "react";

export function ComponentLabStack({ children }: { readonly children: ReactNode }) {
  return <div className="component-lab__stack">{children}</div>;
}

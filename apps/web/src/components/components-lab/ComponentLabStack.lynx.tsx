import type { ReactNode } from "@lynx-js/react";

export function ComponentLabStack({ children }: { readonly children: ReactNode }) {
  return (
    <scroll-view className="component-lab__stack" scroll-y>
      {children}
    </scroll-view>
  );
}

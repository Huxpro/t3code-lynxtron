import type { ReactNode } from "@lynx-js/react";

export function Badge({
  children,
  ...props
}: Record<string, unknown> & { readonly children?: ReactNode }) {
  return <view {...props}>{children}</view>;
}

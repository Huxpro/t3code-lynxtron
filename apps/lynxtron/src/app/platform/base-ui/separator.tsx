// Lynx implementation of `@base-ui/react/separator`, the primitive upstream's
// `components/ui/separator.tsx` styles. The build and typecheck resolve the
// package specifier to this module.
import type { ReactNode } from "@lynx-js/react";

export function Separator({ orientation = "horizontal", ...props }: Separator.Props) {
  return <view {...props} data-orientation={orientation} />;
}

export namespace Separator {
  export type Props = Record<string, unknown> & {
    readonly children?: ReactNode;
    readonly className?: string;
    readonly orientation?: "horizontal" | "vertical";
  };
}

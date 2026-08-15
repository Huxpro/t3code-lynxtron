import type {} from "@lynx-js/react";

declare module "@lynx-js/react" {
  namespace JSX {
    interface IntrinsicElements {
      overlay: {
        children?: unknown;
        className?: string;
        level?: string;
      };
    }
  }
}

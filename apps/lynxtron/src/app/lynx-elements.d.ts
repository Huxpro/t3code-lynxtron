import type {} from "@lynx-js/react";

declare module "@lynx-js/react" {
  namespace JSX {
    interface IntrinsicElements {
      "x-webview": {
        id?: string;
        className?: string;
        src?: string;
        style?: Record<string, string | number>;
        "use-osr"?: boolean;
        "enable-debug"?: boolean;
        bindload?: (event: unknown) => void;
        binderror?: (event: unknown) => void;
        bindlocationchange?: (event: unknown) => void;
        bindopenwindow?: (event: unknown) => void;
        bindmessage?: (event: unknown) => void;
        ref?: (element: unknown) => void;
      };
    }
  }
}

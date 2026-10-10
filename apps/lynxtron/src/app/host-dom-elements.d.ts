import type {} from "@lynx-js/react";

// Upstream Web components compiled for Lynx write DOM tags, which the build
// rewrites to the components `platform/hostDom` exports. This types those tags
// with the host components' props so the upstream files typecheck as they will
// run. The build rejects a DOM tag in a Lynx-owned file.
type HostDomModule = typeof import("./platform/hostDom");
type HostDomElements = {
  [Tag in keyof HostDomModule]: Parameters<HostDomModule[Tag]>[0];
};

declare module "@lynx-js/react" {
  namespace JSX {
    interface IntrinsicElements extends HostDomElements {}
  }
}

import { describe, expect, it } from "vite-plus/test";

import { selectElectronRendererTarget } from "./electron-cdp-target.mjs";

describe("selectElectronRendererTarget", () => {
  it("selects the T3 Code renderer instead of an open DevTools window", () => {
    expect(
      selectElectronRendererTarget([
        {
          id: "devtools",
          type: "page",
          title: "DevTools",
          url: "devtools://devtools/bundled/devtools_app.html",
          webSocketDebuggerUrl: "ws://example/devtools",
        },
        {
          id: "app",
          type: "page",
          title: "T3 Code (Alpha)",
          url: "t3code-dev://app/",
          webSocketDebuggerUrl: "ws://example/app",
        },
      ]).id,
    ).toBe("app");
  });

  it("rejects target lists without a product renderer", () => {
    expect(() =>
      selectElectronRendererTarget([
        {
          type: "page",
          url: "devtools://devtools/bundled/devtools_app.html",
          webSocketDebuggerUrl: "ws://example/devtools",
        },
      ]),
    ).toThrow(/product renderer/u);
  });
});

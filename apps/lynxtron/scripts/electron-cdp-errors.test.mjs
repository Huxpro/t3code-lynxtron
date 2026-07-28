import { describe, expect, it } from "vite-plus/test";

import { classifyElectronRendererErrors } from "./electron-cdp-errors.mjs";

const missingDraftThread =
  "[network] Failed to load resource: the server responded with a status of 404 (Not Found) " +
  "http://127.0.0.1:13775/api/orchestration/threads/448c85ec-cfa2-4d93-8351-3b648f0beaf6";

describe("classifyElectronRendererErrors", () => {
  it("records the unpersisted draft-thread lookup as expected on the new-thread route", () => {
    expect(
      classifyElectronRendererErrors([missingDraftThread], {
        href: "t3code-dev://app/#/draft/44ee2d0a-af48-4aa8-81fb-47760d4fb379",
        route: "new-thread",
      }),
    ).toEqual({ expected: [missingDraftThread], unexpected: [] });
  });

  it("does not hide the same 404 outside the exact draft route", () => {
    expect(
      classifyElectronRendererErrors([missingDraftThread, "Uncaught Error: broken"], {
        href: "t3code-dev://app/#/thread/448c85ec-cfa2-4d93-8351-3b648f0beaf6",
        route: "new-thread",
      }).unexpected,
    ).toEqual([missingDraftThread, "Uncaught Error: broken"]);
  });
});

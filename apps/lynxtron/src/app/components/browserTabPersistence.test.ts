import { describe, expect, it } from "vite-plus/test";

import { __testing, readBrowserTab, storeBrowserTab } from "./browserTabPersistence.lynx";

function memoryStorage(initial: string | null = null) {
  let value = initial;
  return {
    getItem: () => value,
    setItem: (_key: string, next: string) => {
      value = next;
    },
  };
}

describe("Lynxtron browser tab persistence", () => {
  it("isolates tab state by thread and rejects unsafe restored URLs", () => {
    const storage = memoryStorage();
    storeBrowserTab(storage, "thread-a", {
      tabId: "tab-1",
      url: "https://example.com/",
      title: "Example",
    });
    expect(readBrowserTab(storage, "thread-a", "tab-1")).toEqual({
      tabId: "tab-1",
      url: "https://example.com/",
      title: "Example",
    });
    expect(readBrowserTab(storage, "thread-b", "tab-1").url).toBe("");

    const unsafe = memoryStorage(
      JSON.stringify({
        "thread-a": [{ tabId: "tab-1", url: "file:///tmp/private", title: "Private" }],
      }),
    );
    expect(readBrowserTab(unsafe, "thread-a", "tab-1").url).toBe("");
  });

  it("bounds persisted tabs per thread and keeps the newest tab first", () => {
    const storage = memoryStorage();
    for (let index = 0; index <= __testing.MAX_TABS_PER_THREAD; index += 1) {
      storeBrowserTab(storage, "thread-a", {
        tabId: `tab-${index}`,
        url: `http://localhost:${5000 + index}/`,
        title: `Tab ${index}`,
      });
    }
    expect(readBrowserTab(storage, "thread-a", `tab-${__testing.MAX_TABS_PER_THREAD}`).title).toBe(
      `Tab ${__testing.MAX_TABS_PER_THREAD}`,
    );
    expect(readBrowserTab(storage, "thread-a", "tab-0").url).toBe("");
  });
});

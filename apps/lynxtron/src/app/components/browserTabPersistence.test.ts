import { describe, expect, it } from "vite-plus/test";

import {
  __testing,
  readBrowserTab,
  readBrowserTabsState,
  storeBrowserTab,
  storeBrowserTabsState,
} from "./browserTabPersistence.lynx";

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

  it("round-trips active tab, ordered tabs, and bounded recent history", () => {
    const storage = memoryStorage();
    const history = Array.from({ length: __testing.MAX_HISTORY_PER_THREAD + 2 }, (_, index) => ({
      tabId: `tab-${index}`,
      url: `https://history-${index}.example/`,
      title: `History ${index}`,
    }));
    storeBrowserTabsState(storage, "thread-a", {
      activeTabId: "tab-2",
      tabs: [
        { tabId: "tab-1", url: "https://one.example/", title: "One" },
        { tabId: "tab-2", url: "about:blank", title: "Browser" },
      ],
      recentHistory: history,
    });

    expect(readBrowserTabsState(storage, "thread-a", "fallback")).toEqual({
      activeTabId: "tab-2",
      tabs: [
        { tabId: "tab-1", url: "https://one.example/", title: "One", faviconUrl: "" },
        { tabId: "tab-2", url: "about:blank", title: "Browser", faviconUrl: "" },
      ],
      recentHistory: history.slice(0, __testing.MAX_HISTORY_PER_THREAD),
    });
  });

  it("migrates legacy arrays and drops unsafe URLs, duplicates, and invalid active ids", () => {
    const legacy = memoryStorage(
      JSON.stringify({
        "thread-a": [
          { tabId: "safe", url: "https://example.com/", title: "Example" },
          { tabId: "safe", url: "https://duplicate.example/", title: "Duplicate" },
          { tabId: "unsafe", url: "file:///tmp/private", title: "Private" },
        ],
      }),
    );
    expect(readBrowserTabsState(legacy, "thread-a", "fallback")).toEqual({
      activeTabId: "safe",
      tabs: [{ tabId: "safe", url: "https://example.com/", title: "Example", faviconUrl: "" }],
      recentHistory: [],
    });

    const invalid = memoryStorage(
      JSON.stringify({
        version: 2,
        state: {
          tabsByThreadId: {
            "thread-a": {
              activeTabId: "missing",
              tabs: [{ tabId: "safe", url: "https://example.com/", title: "Example" }],
              recentHistory: [
                { tabId: "old", url: "https://older.example/", title: "Older" },
                { tabId: "duplicate", url: "https://older.example/", title: "Duplicate" },
                { tabId: "unsafe", url: "javascript:bad", title: "Unsafe" },
              ],
            },
          },
        },
      }),
    );
    expect(readBrowserTabsState(invalid, "thread-a", "fallback")).toEqual({
      activeTabId: "safe",
      tabs: [{ tabId: "safe", url: "https://example.com/", title: "Example", faviconUrl: "" }],
      recentHistory: [{ tabId: "old", url: "https://older.example/", title: "Older" }],
    });
  });

  it("falls back safely for missing threads, malformed JSON, and empty writes", () => {
    const malformed = memoryStorage("{not-json");
    expect(readBrowserTabsState(malformed, "thread-a", "fallback")).toEqual({
      activeTabId: "fallback",
      tabs: [{ tabId: "fallback", url: "", title: "Browser", faviconUrl: "" }],
      recentHistory: [],
    });

    const empty = memoryStorage();
    storeBrowserTabsState(empty, "thread-a", {
      activeTabId: "missing",
      tabs: [],
      recentHistory: [],
    });
    expect(readBrowserTabsState(empty, "thread-a", "fallback").activeTabId).toBe("fallback");
  });

  it("records recent navigation without letting inactive panels steal active identity", () => {
    const storage = memoryStorage();
    storeBrowserTab(storage, "thread-a", {
      tabId: "tab-1",
      url: "https://one.example/",
      title: "One",
    });
    storeBrowserTab(
      storage,
      "thread-a",
      { tabId: "tab-2", url: "https://two.example/", title: "Two" },
      { active: false },
    );
    storeBrowserTab(storage, "thread-a", {
      tabId: "tab-1",
      url: "https://one.example/next",
      title: "One next",
    });

    expect(readBrowserTabsState(storage, "thread-a", "fallback")).toEqual({
      activeTabId: "tab-1",
      tabs: [
        {
          tabId: "tab-1",
          url: "https://one.example/next",
          title: "One next",
          faviconUrl: "",
        },
        { tabId: "tab-2", url: "https://two.example/", title: "Two", faviconUrl: "" },
      ],
      recentHistory: [
        { tabId: "tab-1", url: "https://one.example/next", title: "One next" },
        { tabId: "tab-2", url: "https://two.example/", title: "Two" },
        { tabId: "tab-1", url: "https://one.example/", title: "One" },
      ],
    });
  });
});

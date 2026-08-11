import { assert, describe, it } from "vite-plus/test";

import { T3_THEME_EVENT, T3_THEME_READY_METHOD } from "../../shared/themeProtocol.ts";
import { startLynxtronThemeHost } from "./themeHost.ts";

describe("Lynxtron theme host", () => {
  it("publishes native color-scheme changes and cleans up", () => {
    let shouldUseDarkColors = false;
    const sourceListeners = new Map<string, () => void>();
    const handlers = new Map<string, () => unknown>();
    const events: unknown[] = [];
    const removed: string[] = [];

    const host = startLynxtronThemeHost(
      {
        sendGlobalEvent: (event, value) => {
          events.push([event, value]);
          return true;
        },
        on: () => undefined,
      },
      {
        handle: (method, handler) => handlers.set(method, handler),
        removeHandler: (method) => removed.push(method),
      },
      {
        get shouldUseDarkColors() {
          return shouldUseDarkColors;
        },
        on: (event, listener) => sourceListeners.set(event, listener),
        removeListener: (event) => sourceListeners.delete(event),
      },
    );

    assert.deepEqual(events, [[T3_THEME_EVENT, { theme: "light", sequence: 1 }]]);
    assert.deepEqual(handlers.get(T3_THEME_READY_METHOD)?.(), {
      theme: "light",
      sequence: 1,
    });

    sourceListeners.get("updated")?.();
    assert.equal(events.length, 1);
    shouldUseDarkColors = true;
    sourceListeners.get("updated")?.();
    assert.deepEqual(events.at(-1), [T3_THEME_EVENT, { theme: "dark", sequence: 2 }]);

    host.dispose();
    assert.deepEqual(removed, [T3_THEME_READY_METHOD]);
    assert.equal(sourceListeners.has("updated"), false);
  });
});

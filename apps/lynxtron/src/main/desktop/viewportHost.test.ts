import { assert, describe, it } from "vite-plus/test";

import {
  T3_VIEWPORT_EVENT,
  T3_VIEWPORT_READY_METHOD,
  T3_VIEWPORT_SET_FOR_TEST_METHOD,
} from "../../shared/viewportProtocol.ts";
import { startLynxtronViewportHost } from "./viewportHost.ts";

describe("Lynxtron viewport host", () => {
  it("publishes de-duplicated content-size snapshots and cleans up", () => {
    let size = [1280, 820];
    const listeners = new Map<string, () => void>();
    const events: unknown[] = [];
    const removed: string[] = [];
    const handlers = new Map<string, (params?: unknown) => unknown>();
    const host = startLynxtronViewportHost(
      {
        getContentSize: () => size,
        setContentSize: (width, height) => {
          size = [width, height];
        },
        on: (event, listener) => {
          listeners.set(event, listener);
        },
        removeListener: (event) => {
          listeners.delete(event);
        },
        sendGlobalEvent: (event, value) => {
          events.push([event, value]);
          return true;
        },
      },
      {
        handle: (method, handler) => handlers.set(method, handler),
        removeHandler: (method) => removed.push(method),
      },
      { allowTestResize: true },
    );

    assert.deepEqual(events, [
      [
        T3_VIEWPORT_EVENT,
        { width: 1280, height: 820, pointer: "fine", sequence: 1, testResize: true },
      ],
    ]);
    assert.deepEqual(handlers.get(T3_VIEWPORT_READY_METHOD)?.(), {
      width: 1280,
      height: 820,
      pointer: "fine",
      sequence: 1,
      testResize: true,
    });

    listeners.get("resize")?.();
    assert.equal(events.length, 1);
    size = [900, 700];
    listeners.get("resize")?.();
    assert.deepEqual(events.at(-1), [
      T3_VIEWPORT_EVENT,
      { width: 900, height: 700, pointer: "fine", sequence: 2, testResize: true },
    ]);
    assert.equal(
      handlers.get(T3_VIEWPORT_SET_FOR_TEST_METHOD)?.({ width: 760, height: 640 }),
      true,
    );
    assert.deepEqual(size, [760, 640]);
    assert.equal(
      handlers.get(T3_VIEWPORT_SET_FOR_TEST_METHOD)?.({ width: 200, height: 640 }),
      false,
    );

    host.dispose();
    assert.deepEqual(removed, [T3_VIEWPORT_READY_METHOD, T3_VIEWPORT_SET_FOR_TEST_METHOD]);
    assert.equal(listeners.has("resize"), false);
    assert.equal(listeners.has("resized"), false);
  });
});

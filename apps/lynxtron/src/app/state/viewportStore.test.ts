import { assert, describe, it } from "vite-plus/test";

import {
  applyViewportSnapshot,
  getViewportSnapshot,
  installViewportTestProbes,
  subscribeViewport,
} from "./viewportStore.ts";

describe("renderer viewport store", () => {
  it("applies monotonic snapshots and notifies subscribers", () => {
    let notifications = 0;
    const unsubscribe = subscribeViewport(() => {
      notifications += 1;
    });

    assert.equal(
      applyViewportSnapshot({
        width: 980,
        height: 700,
        pointer: "fine",
        sequence: 10,
        testResize: false,
      }),
      true,
    );
    assert.deepEqual(getViewportSnapshot(), {
      width: 980,
      height: 700,
      pointer: "fine",
      sequence: 10,
      testResize: false,
    });
    assert.equal(notifications, 1);
    assert.equal(
      applyViewportSnapshot({ width: 1280, height: 820, pointer: "fine", sequence: 9 }),
      false,
    );
    assert.equal(
      applyViewportSnapshot({ width: 980, height: 700, pointer: "fine", sequence: 10 }),
      false,
    );
    unsubscribe();
  });

  it("installs viewport and reload probes only for explicit test resize mode", async () => {
    const calls: Array<{ method: string; params: Record<string, unknown> }> = [];
    const bridge = {
      call(
        method: string,
        params: Record<string, unknown>,
        callback: (value: unknown) => void,
      ) {
        calls.push({ method, params });
        callback(true);
      },
    };
    const target: {
      __T3_LYNXTRON_VIEWPORT_PROBE__?: (width: number, height: number) => Promise<unknown>;
      __T3_LYNXTRON_RELOAD_PROBE__?: () => Promise<unknown>;
    } = {};

    installViewportTestProbes(bridge, true, target);
    await target.__T3_LYNXTRON_VIEWPORT_PROBE__?.(760, 820);
    await target.__T3_LYNXTRON_RELOAD_PROBE__?.();

    assert.deepEqual(calls, [
      { method: "t3:viewport.set-for-test", params: { width: 760, height: 820 } },
      { method: "t3:reload-for-test", params: {} },
    ]);

    installViewportTestProbes(bridge, false, target);
    assert.isUndefined(target.__T3_LYNXTRON_VIEWPORT_PROBE__);
    assert.isUndefined(target.__T3_LYNXTRON_RELOAD_PROBE__);
  });
});

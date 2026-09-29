import { assert, describe, it } from "vite-plus/test";

import { startLynxtronWindow } from "./windowStartup.ts";

describe("Lynxtron window startup", () => {
  it("attaches connector bridge handlers before loading the renderer", () => {
    const order: string[] = [];
    const host = { kind: "connector-host" };

    const result = startLynxtronWindow({
      attachConnectorHost: () => {
        order.push("attach-bridge");
        return host;
      },
      loadRenderer: () => {
        order.push("load-renderer");
      },
    });

    assert.equal(result, host);
    assert.deepEqual(order, ["attach-bridge", "load-renderer"]);
  });

  it("does not load the renderer when bridge attachment fails", () => {
    let rendererLoaded = false;

    assert.throws(
      () =>
        startLynxtronWindow({
          attachConnectorHost: () => {
            throw new Error("bridge unavailable");
          },
          loadRenderer: () => {
            rendererLoaded = true;
          },
        }),
      /bridge unavailable/,
    );
    assert.isFalse(rendererLoaded);
  });
});

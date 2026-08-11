import { assert, describe, it } from "vite-plus/test";

import { resolveMainThreadResizeWidth } from "./resizeFrame.ts";
import { pointerClientX } from "./resizePointer.ts";

describe("Lynx resizable width pointer projection", () => {
  it("reads mouse coordinates from Lynx PC events", () => {
    assert.equal(pointerClientX({ x: 412, button: 0 }), 412);
    assert.equal(pointerClientX({ clientX: 384 }), 384);
  });

  it("reads touch coordinates from active and changed touches", () => {
    assert.equal(pointerClientX({ touches: [{ clientX: 320 }] }), 320);
    assert.equal(pointerClientX({ changedTouches: [{ pageX: 280 }] }), 280);
  });

  it("rejects events without a finite horizontal coordinate", () => {
    assert.equal(pointerClientX({ x: Number.NaN }), null);
  });

  it("resolves left-edge dragging entirely from the latest pointer position", () => {
    assert.equal(
      resolveMainThreadResizeWidth(740, 540, 700, "left", {
        minWidth: 360,
        maxWidth: 700,
      }),
      580,
    );
  });

  it("clamps right-edge dragging without accumulating intermediate events", () => {
    assert.equal(
      resolveMainThreadResizeWidth(256, 256, 1200, "right", {
        minWidth: 208,
        maxWidth: 640,
      }),
      640,
    );
  });
});

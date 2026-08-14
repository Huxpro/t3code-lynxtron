import { assert, describe, it } from "vite-plus/test";

import { COMPOSER_FOOTER_ICON_GEOMETRY } from "./composerFooterIconGeometry.logic";

describe("Composer Footer icon geometry", () => {
  it("matches the Web authority optical sizes", () => {
    assert.deepEqual(COMPOSER_FOOTER_ICON_GEOMETRY, {
      chevron: 14,
      runtime: 16,
      interaction: {
        default: 18,
        plan: 16,
      },
    });
  });
});

import { assert, describe, it } from "vite-plus/test";

import { layoutWorkingLabel, resolveWorkingLabelFullCell } from "./workingLabelAtlas";

describe("layoutWorkingLabel", () => {
  it("matches the verified long-duration Chromium layout", () => {
    assert.deepEqual(layoutWorkingLabel("63h 53m"), {
      width: 106.9609375,
      glyphs: [
        { char: "6", left: 61, phase: 18, row: 6 },
        { char: "3", left: 68, phase: 12, row: 3 },
        { char: "h", left: 74, phase: 44, row: 10 },
        { char: "5", left: 83, phase: 61, row: 5 },
        { char: "3", left: 90, phase: 42, row: 3 },
        { char: "m", left: 97, phase: 10, row: 11 },
      ],
    });
  });

  const cases: ReadonlyArray<readonly [string, number]> = [
    ["500ms", 98.359375],
    ["9.5s", 82.2734375],
    ["10s", 77.7578125],
    ["59s", 80.109375],
    ["1m", 74.515625],
    ["1m 30s", 96.984375],
  ];
  for (const [label, expectedWidth] of cases) {
    it(`lays out ${label}`, () => {
      assert.equal(layoutWorkingLabel(label)?.width, expectedWidth);
    });
  }

  it("rejects labels outside the generated atlas", () => {
    assert.equal(layoutWorkingLabel("Working..."), null);
  });

  it("resolves the verified current full-label cell", () => {
    assert.deepEqual(resolveWorkingLabelFullCell("65h 5m"), { left: 120, top: 136 });
  });

  it("falls back outside the bounded full-label atlas", () => {
    assert.equal(resolveWorkingLabelFullCell("63h 59m"), null);
    assert.equal(resolveWorkingLabelFullCell("72h 0m"), null);
    assert.equal(resolveWorkingLabelFullCell("1m 30s"), null);
  });
});

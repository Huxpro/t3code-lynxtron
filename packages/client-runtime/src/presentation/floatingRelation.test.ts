import { describe, expect, it } from "vite-plus/test";

import {
  floatingRelationResidual,
  measureFloatingRelation,
  resolveFloatingAnchorPoint,
} from "./floatingRelation";

describe("floating relation", () => {
  const anchor = { x: 8, y: 120, width: 240, height: 78 };

  it("projects the original Sidebar tooltip relation from its trigger", () => {
    expect(
      resolveFloatingAnchorPoint(anchor, {
        side: "right",
        align: "start",
        sideOffset: 4,
      }),
    ).toEqual({
      x: 252,
      y: 120,
      transform: "translate(0%, 0%)",
    });
  });

  it("measures relation identity independently of absolute viewport position", () => {
    const placement = { side: "right", align: "start", sideOffset: 4 } as const;
    const first = measureFloatingRelation(
      anchor,
      { x: 252, y: 120, width: 272, height: 116 },
      placement,
    );
    const shifted = measureFloatingRelation(
      { ...anchor, x: 72, y: 280 },
      { x: 316, y: 280, width: 272, height: 116 },
      placement,
    );

    expect(first).toEqual({ alignDelta: 0, sideGap: 4, sideMismatch: false });
    expect(shifted).toEqual(first);
    expect(floatingRelationResidual(first, placement)).toBe(0);
  });

  it("penalizes fixed-position drift and wrong-side overlap", () => {
    const placement = { side: "right", align: "start", sideOffset: 4 } as const;
    const drifted = measureFloatingRelation(
      { ...anchor, x: 72, y: 280 },
      { x: 244, y: 132, width: 272, height: 116 },
      placement,
    );

    expect(drifted.sideMismatch).toBe(true);
    expect(floatingRelationResidual(drifted, placement)).toBeGreaterThan(0.8);
  });

  it("supports centered top and end-aligned bottom placements", () => {
    expect(
      resolveFloatingAnchorPoint(anchor, {
        side: "top",
        align: "center",
        sideOffset: 8,
      }),
    ).toEqual({
      x: 128,
      y: 112,
      transform: "translate(-50%, -100%)",
    });
    expect(
      resolveFloatingAnchorPoint(anchor, {
        side: "bottom",
        align: "end",
        sideOffset: 4,
        alignOffset: -2,
      }),
    ).toEqual({
      x: 246,
      y: 202,
      transform: "translate(-100%, 0%)",
    });
  });
});

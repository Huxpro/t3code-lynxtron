import { describe, expect, it } from "vite-plus/test";

import {
  COMPOSER_COMPACT_MENU_END_ALIGN_BREAKPOINT_PX,
  COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX,
  COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX,
  resolveCompactComposerControlsAlign,
  shouldUseCompactComposerPrimaryActions,
  shouldUseCompactComposerFooter,
} from "./composerFooterLayout";

describe("resolveCompactComposerControlsAlign", () => {
  it("keeps the popup inside an extremely narrow Composer allocation", () => {
    expect(
      resolveCompactComposerControlsAlign(COMPOSER_COMPACT_MENU_END_ALIGN_BREAKPOINT_PX - 1),
    ).toBe("end");
    expect(resolveCompactComposerControlsAlign(COMPOSER_COMPACT_MENU_END_ALIGN_BREAKPOINT_PX)).toBe(
      "start",
    );
    expect(resolveCompactComposerControlsAlign(null)).toBe("start");
  });
});

describe("shouldUseCompactComposerFooter", () => {
  it("stays expanded without a measured width", () => {
    expect(shouldUseCompactComposerFooter(null)).toBe(false);
  });

  it("switches to compact mode below the breakpoint", () => {
    expect(shouldUseCompactComposerFooter(COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX - 1)).toBe(true);
  });

  it("stays expanded at and above the breakpoint", () => {
    expect(shouldUseCompactComposerFooter(COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX)).toBe(false);
    expect(shouldUseCompactComposerFooter(COMPOSER_FOOTER_COMPACT_BREAKPOINT_PX + 48)).toBe(false);
  });

  it("uses a higher breakpoint for wide action states", () => {
    expect(
      shouldUseCompactComposerFooter(COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX - 1, {
        hasWideActions: true,
      }),
    ).toBe(true);
    expect(
      shouldUseCompactComposerFooter(COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX, {
        hasWideActions: true,
      }),
    ).toBe(false);
  });
});

describe("shouldUseCompactComposerPrimaryActions", () => {
  it("matches the wide footer breakpoint", () => {
    expect(
      shouldUseCompactComposerPrimaryActions(
        COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX - 1,
        { hasWideActions: true },
      ),
    ).toBe(true);
    expect(
      shouldUseCompactComposerPrimaryActions(COMPOSER_FOOTER_WIDE_ACTIONS_COMPACT_BREAKPOINT_PX, {
        hasWideActions: true,
      }),
    ).toBe(false);
  });
});

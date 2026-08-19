import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");
const timelineSource = readFileSync(
  path.resolve(import.meta.dirname, "MessagesTimeline.tsx"),
  "utf8",
);
const composerSource = readFileSync(path.resolve(import.meta.dirname, "Composer.tsx"), "utf8");
const sharedRowSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/chat/TranscriptRowSurface.tsx"),
  "utf8",
);
const appSource = readFileSync(path.resolve(import.meta.dirname, "../index.tsx"), "utf8");

describe("transcript layout contract", () => {
  it("matches the Web timeline top inset and working-row spacing", () => {
    expect(overrides).toContain("padding: 16px 26px 20px;");
    expect(overrides).toContain(
      ".timeline-settled-header-space {\n  width: 100%;\n  height: 32px;",
    );
    expect(timelineSource).toContain('item-key="timeline-settled-header-space"');
    expect(timelineSource).toContain("estimated-main-axis-size-px={32}");
    expect(timelineSource).toContain("!isWorking && !hasTopBanner");
    expect(timelineSource).toContain(
      'isWorking || hasTopBanner ? "timeline-list timeline-list--top-banner" : "timeline-list"',
    );
    expect(appSource).toContain('__T3_LYNXTRON_WEB_PREVIEW__ ? " lynx-web-preview"');
    expect(overrides).toContain(".lynx-web-preview .timeline-list {\n  padding-top: 48px;");
    expect(overrides).toContain(
      ".lynx-web-preview .timeline-list--top-banner {\n  padding-top: 16px;",
    );
    expect(overrides).toContain(
      ".lynx-web-preview .timeline-settled-header-space {\n  display: none;",
    );
    expect(overrides).toContain(".timeline-row-root--working {\n  height: 40px;");
    expect(overrides).toContain(".transcript-working-outer {\n  padding-bottom: 16px;");
    expect(sharedRowSource).toContain('row.kind === "working" ? "transcript-working-outer" : null');
    expect(timelineSource).toContain(
      'row.kind === "working"\n                  ? "timeline-row-root timeline-row-root--working"',
    );
    expect(timelineSource).toContain('row.kind === "message" && row.message.role === "assistant"');
    expect(timelineSource).not.toContain("wrapCodeWords");
    expect(overrides).toContain(".timeline-row-root--assistant {\n  padding-bottom: 16px;");
    expect(overrides).toContain(".inline-markdown-code {\n  display: flex;\n  flex-shrink: 0;");
    expect(overrides).toContain(".turn-diff-card .lynx-changed-files-tree {\n  margin-top: 0;");
    expect(composerSource).toContain("compactFooter && !questionMode");
    expect(composerSource).toContain("shouldUseCompactComposerFooter(availableWidth");
    expect(composerSource).toContain("separators={!compactFooter}");
    expect(composerSource).toContain("const compactControlsContentHeight =");
    expect(composerSource).toContain("Math.max(160, viewport.height - 140)");
    expect(composerSource).toContain("compactControlsMenuHeight - 2");
    expect(composerSource).toContain("__T3_LYNXTRON_COMPACT_CONTROLS_SCROLL_PROBE__");
    expect(composerSource).toContain(
      'target.invoke("scrollTo", { offset: nextOffset, smooth: false })',
    );
    expect(composerSource).toContain('aria-label="More composer controls"');
    expect(composerSource).toContain("data-composer-compact-controls-menu");
    expect(composerSource).toContain('className="composer-compact-controls-dismiss"');
    expect(composerSource.indexOf('className="composer-compact-controls-menu"')).toBeLessThan(
      composerSource.indexOf('className="composer-compact-controls-dismiss"'),
    );
    expect(composerSource).toContain('className="composer-compact-controls-menu__scroll"');
    expect(composerSource).toContain('scroll-orientation="vertical"');
    expect(composerSource).toContain('mode === "default" ? "Chat" : "Plan"');
    expect(composerSource).toContain("composer-compact-controls-menu__badge");
    expect(
      composerSource.indexOf("Mode\n                                      </view>"),
    ).toBeLessThan(composerSource.indexOf("Access\n                                  </view>"));
    expect(overrides).toContain(".composer-compact-controls-menu__scroll {");
    expect(overrides).toContain("max-height: calc(100vh - 142px);");
    expect(overrides).toContain("width: 148px;");
    expect(composerSource).toMatch(
      /compactFooter && availableWidth < 300[^]*composer-compact-controls-menu--narrow/,
    );
    expect(overrides).toContain(".composer-compact-controls-menu--narrow {");
    expect(overrides).toContain("right: 0;");
    expect(overrides).toContain("left: auto;");
    expect(overrides).toContain(".composer-compact-controls-menu__section-label--divided {");
    expect(overrides).toContain(".theme-light .composer-compact-controls-menu {");
    expect(overrides).toContain("background-color: rgba(255, 255, 255, 0.836);");
    expect(overrides).toContain("box-shadow: 0 16px 40px -18px rgba(0, 0, 0, 0.55);");
    expect(overrides).toContain(".composer-context-item {\n  position: relative;\n  min-width: 0;");
    expect(overrides).toContain(".composer-context-control--checkout {\n  width: 100%;");
    expect(overrides).toContain(
      ".composer-context-label--checkout,\n.composer-context-label--branch {",
    );
    expect(overrides).toContain("text-overflow: ellipsis;");
    expect(composerSource).toContain("!compactFooter && !questionMode");
  });

  it("stretches Review checkpoint cards across the transcript column", () => {
    const start = overrides.indexOf(".turn-diff-card {");
    const block = overrides.slice(start, overrides.indexOf("}", start));
    expect(block).toContain("--align-self-column: stretch;");
    expect(block).toContain("align-self: stretch;");
    expect(block).toContain("width: 100%;");
    expect(block).toContain("max-width: 760px;");
  });

  it("keeps empty right-panel cards at the authority height", () => {
    const start = overrides.indexOf(".right-panel-empty-card {");
    const block = overrides.slice(start, overrides.indexOf("}", start));

    expect(block).toContain("height: 112px;");
    expect(block).toContain("min-height: 112px;");
    expect(block).toContain("max-height: 112px;");
    expect(block).toContain("box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);");
    expect(overrides).toContain(".right-panel-empty-card__title {");
    expect(overrides).toContain(".right-panel-empty-card__description {");
    expect(overrides).toContain("font-size: 14px;");
    expect(overrides).toContain("font-size: 12px;");
  });

  it("stretches assistant rows across the native list item before sizing review cards", () => {
    const start = overrides.indexOf(
      ".timeline-row-root--assistant > .transcript-assistant-group {",
    );
    const block = overrides.slice(start, overrides.indexOf("}", start));
    expect(block).toContain("width: 100%;");
    expect(block).toContain("min-width: 0;");
  });
});

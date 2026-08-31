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
      'hasTopBanner\n            ? "timeline-list timeline-list--top-banner"',
    );
    expect(timelineSource).toContain(
      'isWorking\n              ? "timeline-list timeline-list--working"',
    );
    expect(appSource).toContain('__T3_LYNXTRON_WEB_PREVIEW__ ? " lynx-web-preview"');
    expect(overrides).toContain(".lynx-web-preview .timeline-list {\n  padding-top: 48px;");
    expect(overrides).toContain(".timeline-list--top-banner {\n  padding-top: 20px;");
    expect(overrides).toContain(
      ".lynx-web-preview .timeline-list--top-banner {\n  padding-top: 20px;",
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
    expect(timelineSource).toContain("<MarkdownRenderer text={row.message.text} cwd={cwd} />");
    expect(overrides).toContain(".transcript-user-body .md-paragraph {");
    expect(overrides).toContain("overflow-wrap: anywhere;");
    expect(overrides).toContain(".timeline-row-root--assistant {\n  padding-bottom: 16px;");
    expect(overrides).toContain(".inline-markdown-code {\n  display: flex;\n  flex-shrink: 0;");
    expect(overrides).toContain(".turn-diff-card .lynx-changed-files-tree {\n  margin-top: 0;");
    expect(composerSource).toContain("compactFooter && !questionMode");
    expect(composerSource).toContain("shouldUseCompactComposerFooter(availableWidth");
    expect(composerSource).toContain("viewport.width < 640 && !mobileComposerExpanded");
    expect(composerSource).toContain('aria-label="Expand composer"');
    expect(composerSource).toContain('className="composer-mobile-collapsed"');
    expect(overrides).toContain(".composer-mobile-collapsed {");
    expect(overrides).toContain("height: 48px;");
    expect(composerSource).toContain("separators={!compactFooter}");
    expect(composerSource).toContain("compactControlsPanelHeight({");
    expect(composerSource).toContain("const compactControlsEstimatedContentHeight");
    expect(composerSource).toContain(
      "compactControlsMeasuredContentHeight ?? compactControlsEstimatedContentHeight",
    );
    expect(composerSource).toContain('className="composer-compact-controls-menu__content"');
    expect(composerSource).toContain("setCompactControlsMeasuredContentHeight");
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
    expect(composerSource).toContain(
      "main-thread:global-bindwheel={handleCompactControlsMenuWheel}",
    );
    expect(composerSource).toContain("responsiveMenuWheelDelta(");
    expect(composerSource).toContain("if (!Number.isFinite(deltaY) || deltaY === 0) return;");
    expect(composerSource).toContain('target.setAttribute("data-scroll-offset", `${nextOffset}`)');
    expect(composerSource).toContain('scroll-orientation="vertical"');
    expect(composerSource).toContain('mode === "default" ? "Chat" : "Plan"');
    expect(composerSource).toContain("composer-compact-controls-menu__badge");
    expect(
      composerSource.indexOf("Mode\n                                      </view>"),
    ).toBeLessThan(composerSource.indexOf("Access\n                                  </view>"));
    expect(overrides).toContain(".composer-compact-controls-menu__scroll {");
    expect(overrides).toContain("max-height: calc(100vh - 142px);");
    expect(overrides).toContain("width: 148px;");
    expect(composerSource).toContain("resolveCompactComposerControlsAlign(availableWidth)");
    expect(composerSource).toContain('compactControlsAlign === "end"');
    expect(overrides).toContain(".composer-compact-controls-menu--narrow {");
    expect(overrides).toContain("right: 0;");
    expect(overrides).toContain("left: auto;");
    expect(overrides).toContain(".composer-compact-controls-menu__group-label {");
    expect(overrides).toContain(".composer-compact-controls-menu__separator {");
    expect(overrides).toContain(".theme-light .composer-compact-controls-menu {");
    expect(overrides).toContain("background-color: rgba(255, 255, 255, 0.836);");
    expect(overrides).toContain("box-shadow: 0 16px 40px -18px rgba(0, 0, 0, 0.55);");
    expect(overrides).toContain(
      ".composer-context-item--checkout,\n.composer-context-item--branch {\n  position: relative;",
    );
    expect(overrides).toContain(
      ".composer-context-control--checkout {\n  width: 100%;\n  min-width: 0;",
    );
    expect(overrides).toContain(
      ".composer-context-label--checkout,\n.composer-context-label--branch {",
    );
    expect(overrides).toContain("text-overflow: ellipsis;");
    expect(composerSource).toContain("!compactFooter && !questionMode");
  });

  it("lets the settled Composer banner grow without collapsing its action", () => {
    const bannerStart = overrides.indexOf(".composer-settled-banner {");
    const bannerBlock = overrides.slice(bannerStart, overrides.indexOf("}", bannerStart));
    const copyStart = overrides.indexOf(".composer-settled-banner__copy {");
    const copyBlock = overrides.slice(copyStart, overrides.indexOf("}", copyStart));
    const actionStart = overrides.indexOf(".composer-settled-banner__action {");
    const actionBlock = overrides.slice(actionStart, overrides.indexOf("}", actionStart));

    expect(bannerBlock).toContain("height: auto;");
    expect(bannerBlock).toContain("min-height: 68px;");
    expect(bannerBlock).not.toContain("\n  height: 68px;");
    expect(copyBlock).toContain("flex-basis: 0;");
    expect(copyBlock).toContain("width: 0;");
    expect(actionBlock).toContain("width: 70px;");
    expect(actionBlock).toContain("min-width: 70px;");
    expect(actionBlock).toContain("max-width: 70px;");
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

  it("keeps shared user-row spacing in the native list-item measurement", () => {
    expect(overrides).toContain(".timeline-row-root--user {");
    expect(overrides).toContain(".timeline-row-root--user > .transcript-user-outer {");
  });

  it("retains the authority checkpoint border in light mode", () => {
    const start = overrides.indexOf(".theme-light .turn-diff-card {");
    const block = overrides.slice(start, overrides.indexOf("}", start));
    expect(block).toContain("border-color: rgba(228, 228, 231, 0.7);");
  });

  it("keeps the Lynx patch surface flush with the Web diff renderer", () => {
    const fileStart = overrides.indexOf(".diff-code-file {");
    const fileBlock = overrides.slice(fileStart, overrides.indexOf("}", fileStart));
    const headerStart = overrides.indexOf(".diff-code-file__header {");
    const headerBlock = overrides.slice(headerStart, overrides.indexOf("}", headerStart));
    expect(fileBlock).toContain("border-width: 0;");
    expect(fileBlock).toContain("border-radius: 0;");
    expect(headerBlock).toContain("height: 33px;");
  });
});

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
    expect(overrides).toContain(
      ".timeline-row-root--assistant > .transcript-assistant-group {\n  padding-bottom: 0;",
    );
    expect(overrides).toContain(".inline-markdown-code {\n  display: flex;\n  flex-shrink: 0;");
    expect(overrides).toContain(".turn-diff-card .lynx-changed-files-tree {\n  margin-top: 0;");
    expect(composerSource).toContain("compactFooter && !questionMode");
    expect(composerSource).toContain("shouldUseCompactComposerFooter(availableWidth");
    expect(composerSource).toContain('aria-label="More composer controls"');
    expect(composerSource).toContain("data-composer-compact-controls-menu");
    expect(composerSource).toContain("!compactFooter && !questionMode");
  });
});

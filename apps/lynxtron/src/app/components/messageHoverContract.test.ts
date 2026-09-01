import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");
const timelineSource = readFileSync(
  path.resolve(import.meta.dirname, "MessagesTimeline.tsx"),
  "utf8",
);
const sharedRowSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/chat/TranscriptRowSurface.tsx"),
  "utf8",
);

describe("message hover actions contract", () => {
  it("shares hover ownership and exposes matching user and assistant copy metadata", () => {
    expect(sharedRowSource).toContain("onMouseEnter={onHoverChange ? () => onHoverChange(true)");
    expect(sharedRowSource).toContain("onMouseLeave={onHoverChange ? () => onHoverChange(false)");
    expect(sharedRowSource).toContain("onMessageHoverChange?.(row.message.id, hovered)");
    expect(sharedRowSource).toContain('hoverRevealSelector=".transcript-message-meta"');
    expect(sharedRowSource).toContain("onMouseEnter={onHoverChange ? () => onHoverChange(true)");
    const hostElementsSource = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/ui/hostElements.lynx.tsx"),
      "utf8",
    );
    expect(hostElementsSource).toContain('"main-thread:bindmouseover": handleMouseEnter');
    expect(timelineSource.match(/flatten=\{false\}/gu)).toHaveLength(2);
    expect(timelineSource).toContain("resolveAssistantMessageCopyState");
    expect(timelineSource).toContain("deriveDisplayedUserMessageState(row.message.text).copyText");
    expect(timelineSource).toContain('aria-label="Copy link"');
    expect(timelineSource).toContain("}, 1_000);");
    expect(timelineSource).toContain("formatShortTimestamp(row.message.createdAt");
    expect(timelineSource).toContain("formatShortTimestamp(row.message.updatedAt");
    expect(overrides).toContain(".transcript-message-meta--visible {\n  opacity: 1;");
    expect(overrides).toContain(".transcript-user-row:hover > .transcript-message-meta");
    expect(overrides).toContain(".transcript-assistant-row:hover > .transcript-message-meta");
  });
});

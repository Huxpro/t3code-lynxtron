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
    expect(sharedRowSource).toContain('hoverRevealSelector=".transcript-message-meta"');
    const hostElementsSource = readFileSync(
      path.resolve(import.meta.dirname, "../../../../web/src/components/ui/hostElements.lynx.tsx"),
      "utf8",
    );
    expect(hostElementsSource).toContain('"main-thread:bindmouseover": handleMouseEnter');
    expect(hostElementsSource).toContain('setStyleProperty("visibility", "visible")');
    expect(hostElementsSource).toContain('setStyleProperty("visibility", "hidden")');
    expect(timelineSource.match(/flatten=\{false\}/gu)).toHaveLength(2);
    expect(timelineSource).toContain("resolveAssistantMessageCopyState");
    expect(timelineSource).toContain("deriveDisplayedUserMessageState(row.message.text).copyText");
    expect(timelineSource).toContain(
      'aria-label={status === "failed" ? "Copy failed" : "Copy link"}',
    );
    expect(timelineSource).toContain(
      'aria-label={revertFailed ? "Revert failed" : "Revert to this message"}',
    );
    expect(timelineSource).toContain("inferCheckpointTurnCountByTurnId(checkpoints)");
    expect(timelineSource).toContain("t3ClientActions.revertCheckpoint(revertTurnCount)");
    expect(timelineSource).toContain("runMessageRevert(");
    expect(timelineSource).toContain('data-message-revert-state={revertStatus ?? "idle"}');
    expect(timelineSource).toContain("requestGenerationRef.current += 1");
    expect(timelineSource).toContain("}, [identity, text]);");
    expect(timelineSource).toContain("identity={row.message.id}");
    expect(timelineSource).toContain("showNativeConfirm({");
    expect(timelineSource).toContain('confirmLabel: "Revert"');
    expect(timelineSource).toContain("}, 1_000);");
    expect(timelineSource).toContain("createdAt={row.message.createdAt}");
    expect(timelineSource).toContain("formatShortTimestamp(createdAt, timestampFormat)");
    expect(timelineSource).toContain("formatShortTimestamp(row.message.updatedAt");
    expect(overrides).toContain(".transcript-message-meta {");
    expect(overrides).toContain("opacity: 1;");
    expect(overrides).toContain("visibility: visible;");
    expect(overrides).toContain(".transcript-message-meta--visible {\n  opacity: 1;");
    expect(overrides).toContain(".transcript-message-meta__failure {");
    expect(overrides).toContain(".transcript-user-row:hover > .transcript-message-meta");
    expect(overrides).toContain(".transcript-assistant-row:hover > .transcript-message-meta");
    expect(overrides).toContain("visibility: visible;");
  });
});

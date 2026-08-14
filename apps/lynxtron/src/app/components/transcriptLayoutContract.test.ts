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

describe("transcript layout contract", () => {
  it("matches the Web timeline top inset and working-row spacing", () => {
    expect(overrides).toContain("padding: 16px 26px 20px;");
    expect(overrides).toContain(".timeline-row-root--working {\n  height: 40px;");
    expect(overrides).toContain(".transcript-working-outer {\n  padding-bottom: 16px;");
    expect(sharedRowSource).toContain('row.kind === "working" ? "transcript-working-outer" : null');
    expect(timelineSource).toContain(
      'row.kind === "working"\n                  ? "timeline-row-root timeline-row-root--working"',
    );
  });
});

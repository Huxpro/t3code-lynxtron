import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const source = readFileSync(
  path.resolve(import.meta.dirname, "../../web/src/components/ChatMarkdown.tsx"),
  "utf8",
);

describe("Web ChatMarkdown details contract", () => {
  it("keeps sanitized raw details and summary nodes reachable", () => {
    expect(source).toContain('tagNames: [...(defaultSchema.tagNames ?? []), "details", "summary"]');
    expect(source).toContain('details: [...(defaultSchema.attributes?.details ?? []), "open"]');
    expect(source).toContain(
      "return <MarkdownDetails open={detailsOpen}>{children}</MarkdownDetails>",
    );
  });
});

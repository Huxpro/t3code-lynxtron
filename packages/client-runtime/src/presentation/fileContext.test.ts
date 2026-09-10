import { describe, expect, it } from "vite-plus/test";

import {
  appendFileContextsToPrompt,
  composerFileContext,
  normalizeComposerFileContextsByScopeKey,
} from "./fileContext.ts";

describe("file context presentation", () => {
  it("materializes the same canonical Markdown mention used by Web", () => {
    expect(appendFileContextsToPrompt("Inspect", [composerFileContext("docs/My File.md")!])).toBe(
      "Inspect [My File.md](docs/My%20File.md)",
    );
  });

  it("strictly restores scoped, unique file contexts", () => {
    expect(
      normalizeComposerFileContextsByScopeKey({
        "project:p1": [{ path: " src/index.ts " }, { path: "src/index.ts" }, { path: "" }],
        invalid: [{ path: "README.md" }],
      }),
    ).toEqual({ "project:p1": [{ id: "src/index.ts", path: "src/index.ts" }] });
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

describe("Lynx Select", () => {
  it("renders a non-text decorative chevron without polluting visible value semantics", () => {
    const source = readFileSync(path.resolve(import.meta.dirname, "select.lynx.tsx"), "utf8");
    expect(source).toContain('<view className="ui-select-trigger__chevron" aria-hidden />');
    expect(source).not.toContain('className="ui-select-trigger__chevron">⌄</text>');
  });
});

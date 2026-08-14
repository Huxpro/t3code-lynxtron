import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const composerSource = readFileSync(path.resolve(import.meta.dirname, "Composer.tsx"), "utf8");

describe("approval Composer layout", () => {
  it("lets the shared column surface stack approval editor and footer directly", () => {
    expect(composerSource).not.toContain('className="composer-approval-body"');
    expect(composerSource).toContain(
      '<view className="composer-editor-area composer-editor-area--approval">',
    );
    expect(composerSource).toContain('className="composer-footer composer-footer--approval"');
  });
});

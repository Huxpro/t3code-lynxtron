/// <reference types="node" />

import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(path.join(import.meta.dirname, "Composer.tsx"), "utf8");

describe("Composer toolbar reconciliation", () => {
  it("keys every conditional top-level control island", () => {
    assert.include(source, '<view key="model" className="model-picker-anchor">');
    assert.include(source, 'key="model-option"');
    assert.include(source, '<view key="runtime" className="composer-runtime-control-wrap">');
    assert.include(source, 'key="interaction"');
  });
});

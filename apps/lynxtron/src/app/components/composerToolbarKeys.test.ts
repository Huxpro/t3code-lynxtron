/// <reference types="node" />

import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(path.join(import.meta.dirname, "Composer.tsx"), "utf8");

describe("Composer toolbar reconciliation", () => {
  it("keys every conditional top-level control island", () => {
    for (const key of ["model", "model-option", "runtime", "interaction"]) {
      assert.include(source, `key="${key}"`);
    }
  });
});

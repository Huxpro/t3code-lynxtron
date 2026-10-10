import { createRequire } from "node:module";

import { describe, expect, it } from "vite-plus/test";

const require = createRequire(import.meta.url);
const { lowerBigIntLiterals } = require("./lynx-bigint-loader.cjs");

describe("lynx-bigint-loader", () => {
  it("writes BigInt literals as calls that evaluate to the same values", () => {
    const source = "export const values = [0n, 1_000_000n * 3n, 0x1fn, -2n];";
    const lowered = lowerBigIntLiterals(source, "/repo/a.ts");
    expect(lowered).not.toMatch(/\dn\b/u);
    const evaluate = (code) =>
      new Function(`${code.replace("export const values =", "return")}`)().map(String);
    expect(evaluate(lowered)).toEqual(evaluate(source));
  });

  it("leaves strings, identifiers and plain numbers alone", () => {
    const source = 'const a = "10n"; const b1n = 1; const c = 10; // 5n\n';
    expect(lowerBigIntLiterals(source, "/repo/a.ts")).toBe(source);
  });

  it("keeps a typed expression valid", () => {
    expect(lowerBigIntLiterals("const a = (x ?? 0n) <= now;", "/repo/a.ts")).toBe(
      'const a = (x ?? BigInt("0")) <= now;',
    );
  });
});

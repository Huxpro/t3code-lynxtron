import "vite-plus/test/config";
import * as NodePath from "node:path";
import { defineConfig } from "vite-plus";

const webSource = NodePath.resolve(import.meta.dirname, "../web/src");

// Tests resolve modules the way the Lynx build does: a `.lynx` module wins over
// the Web module of the same name. Lynx-owned tests that live next to their
// module under apps/web are named `*.test.lynx.ts` so the Web suite skips them.
export default defineConfig({
  resolve: {
    alias: { "~": webSource },
    extensions: [".lynx.tsx", ".lynx.ts", ".tsx", ".ts", ".mjs", ".js", ".jsx", ".json"],
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.{ts,mjs}",
      "../web/src/**/*.test.lynx.ts",
    ],
    // Several script tests shell out to git or scan the source tree; under the
    // full suite they can exceed Vitest's default 5s budget.
    testTimeout: 15_000,
  },
});

import { describe, expect, it } from "vite-plus/test";

import { parseUnifiedDiff } from "./unifiedDiff.ts";

describe("parseUnifiedDiff", () => {
  it("parses new and changed files with line numbers", () => {
    const files = parseUnifiedDiff(`diff --git a/fib.js b/fib.js
new file mode 100644
--- /dev/null
+++ b/fib.js
@@ -0,0 +1,3 @@
+function fib(n) {
+  return n;
+}
diff --git a/a.js b/a.js
--- a/a.js
+++ b/a.js
@@ -1,2 +1,2 @@
-const a = 1;
+const a = 2;
 console.log(a);
`);

    expect(files).toEqual([
      {
        path: "fib.js",
        additions: 3,
        deletions: 0,
        lines: [
          { kind: "addition", content: "function fib(n) {", oldLine: null, newLine: 1 },
          { kind: "addition", content: "  return n;", oldLine: null, newLine: 2 },
          { kind: "addition", content: "}", oldLine: null, newLine: 3 },
        ],
      },
      {
        path: "a.js",
        additions: 1,
        deletions: 1,
        lines: [
          { kind: "deletion", content: "const a = 1;", oldLine: 1, newLine: null },
          { kind: "addition", content: "const a = 2;", oldLine: null, newLine: 1 },
          { kind: "context", content: "console.log(a);", oldLine: 2, newLine: 2 },
        ],
      },
    ]);
  });
});

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { assert, describe, it } from "vite-plus/test";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, "..");
const run = promisify(execFile);

describe("Plan 11C style coverage contract", () => {
  it("keeps generated coverage and unresolved risk separate", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "t3-style-coverage-"));
    const reusePath = path.join(root, "reuse.json");
    const cssPath = path.join(root, "generated.css");
    const outputPath = path.join(root, "report.json");
    try {
      await writeFile(
        reusePath,
        JSON.stringify({
          screens: [
            {
              id: "composer",
              graphs: {
                productSurface: {
                  web: {
                    modules: [
                      {
                        path: "apps/web/src/components/chat/ComposerSurface.tsx",
                      },
                    ],
                  },
                },
              },
            },
          ],
        }),
      );
      await writeFile(cssPath, ".flex{display:flex}.rounded-lg{border-radius:8px}");
      await run(process.execPath, [
        path.join(scriptDirectory, "style-coverage-report.mjs"),
        reusePath,
        cssPath,
        outputPath,
      ], { cwd: path.resolve(appRoot, "../..") });

      const report = JSON.parse(await readFile(outputPath, "utf8"));
      assert.deepEqual(report.screens, ["composer"]);
      assert.isAbove(report.summary.uniqueTokens, 0);
      assert.isAtLeast(report.summary.totalOccurrences, report.summary.coveredOccurrences);
      assert.isTrue(report.highestRisk.every((row) => row.classification !== "GENERATED"));
      assert.isTrue(
        report.highestRisk.every(
          (row) => row.screens.length > 0 && row.files.length > 0,
        ),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

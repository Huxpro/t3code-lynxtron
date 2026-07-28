import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { assertBoundaryBaseline, generateReuseReport, sha256, stableJson } from "./reuse-audit.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const REPO_ROOT = resolve(APP_ROOT, "../..");
const BOUNDARIES_PATH = resolve(SCRIPT_DIRECTORY, "reuse-boundaries.json");
const BASELINE_PATH = resolve(SCRIPT_DIRECTORY, "reuse-boundaries.baseline.json");
const DEFAULT_OUTPUT = resolve(APP_ROOT, "reports/reuse/current.json");

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const boundariesText = readFileSync(BOUNDARIES_PATH, "utf8");
const boundarySha256 = sha256(boundariesText);
const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));

assertBoundaryBaseline(boundarySha256, baseline.boundarySha256);

const boundaries = JSON.parse(boundariesText);
const report = await generateReuseReport({
  appRoot: APP_ROOT,
  boundaries,
  boundariesText,
  repoRoot: REPO_ROOT,
});
const output = argumentValue("--output")
  ? resolve(process.cwd(), argumentValue("--output"))
  : DEFAULT_OUTPUT;

mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, stableJson(report));
if (process.argv.includes("--stdout")) {
  process.stdout.write(stableJson(report));
} else {
  const productRows = report.screens.map((screen) => {
    const graph = screen.graphs.productSurface;
    return {
      screen: screen.id,
      modules: `${graph.reused.modules}/${graph.eligible.modules} (${graph.reusePercent.modules}%)`,
      lines: `${graph.reused.lines}/${graph.eligible.lines} (${graph.reusePercent.lines}%)`,
    };
  });
  process.stdout.write(
    `${JSON.stringify(
      {
        output,
        boundarySha256,
        lynxResolverFingerprint: report.resolver.lynxProduction.fingerprint,
        productSurface: productRows,
      },
      null,
      2,
    )}\n`,
  );
}

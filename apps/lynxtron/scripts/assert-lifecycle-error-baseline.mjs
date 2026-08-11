#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const EXPECTED_DETAIL =
  "OC0 fixture: backend unavailable; reconnect from the lifecycle affordance.";

const measurementsPath = process.argv.slice(2).find((argument) => argument !== "--");
if (!measurementsPath) {
  throw new Error("Usage: assert-lifecycle-error-baseline.mjs <lynx-measurements.json>");
}

const measurements = JSON.parse(readFileSync(resolve(measurementsPath), "utf8"));
const headerText = measurements.anchors?.workspaceHeader?.text ?? "";
const shellText = measurements.colors?.appBackground?.text ?? "";
const placeholderText = measurements.typography?.composerPlaceholder?.attributes?.placeholder ?? "";

const result = {
  schemaVersion: 1,
  fixture: "lifecycle-error",
  expectedDetail: EXPECTED_DETAIL,
  observed: {
    detailVisibleInHeader: headerText.includes(EXPECTED_DETAIL),
    detailVisibleInShell: shellText.includes(EXPECTED_DETAIL),
    composerPlaceholderText: placeholderText,
    connectingOnly:
      placeholderText === "Connecting to T3 Code…" && !shellText.includes(EXPECTED_DETAIL),
  },
};

if (
  result.observed.detailVisibleInHeader ||
  result.observed.detailVisibleInShell ||
  !result.observed.connectingOnly
) {
  throw new Error(`O5 baseline signature changed: ${JSON.stringify(result)}`);
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

import * as path from "node:path";

import { describe, expect, it } from "vite-plus/test";

import { resolveNodeExecutable, resolveServerBin, serverBinCandidates } from "./serverPaths";

describe("resolveNodeExecutable", () => {
  it("uses a packaged or explicitly configured Node runtime", () => {
    expect(resolveNodeExecutable({ T3_NODE_BIN: "/opt/t3/bin/node" })).toBe("/opt/t3/bin/node");
  });

  it("falls back to PATH instead of the Lynxtron host executable", () => {
    expect(resolveNodeExecutable({})).toBe("node");
  });
});

describe("resolveServerBin", () => {
  it("prefers an explicit server binary", () => {
    const explicitPath = "/tmp/custom-t3/bin.mjs";
    expect(
      resolveServerBin({
        explicitPath,
        connectorDirectory: "/repo/apps/lynxtron/dist/desktop",
        cwd: "/repo",
        exists: (candidate) => candidate === explicitPath,
      }),
    ).toBe(explicitPath);
  });

  it("resolves the sibling server app from the built connector directory", () => {
    const connectorDirectory = "/repo/apps/lynxtron/dist/desktop";
    const expected = path.resolve(connectorDirectory, "../../../server/dist/bin.mjs");
    expect(
      resolveServerBin({
        connectorDirectory,
        cwd: "/elsewhere",
        exists: (candidate) => candidate === expected,
      }),
    ).toBe(expected);
  });

  it("reports every checked location when no build exists", () => {
    expect(() =>
      resolveServerBin({
        connectorDirectory: "/repo/apps/lynxtron/dist/desktop",
        cwd: "/repo",
        exists: () => false,
      }),
    ).toThrow(/pnpm --filter t3 build:bundle/);
  });
});

describe("serverBinCandidates", () => {
  it("omits an empty explicit path", () => {
    expect(
      serverBinCandidates({
        connectorDirectory: "/repo/apps/lynxtron/dist/desktop",
        cwd: "/repo",
      }),
    ).not.toContain(undefined);
  });
});

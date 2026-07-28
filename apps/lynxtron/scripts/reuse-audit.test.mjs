import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, assert, describe, it } from "vite-plus/test";

import {
  assertBoundaryBaseline,
  createProductionResolver,
  generateReuseReport,
  stableJson,
} from "./reuse-audit.mjs";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const FIXTURE_SOURCE = join(SCRIPT_DIRECTORY, "fixtures", "reuse-audit");
const temporaryRoots = [];

function makeFixture() {
  const repoRoot = mkdtempSync(join(tmpdir(), "t3code-reuse-fixture-"));
  temporaryRoots.push(repoRoot);
  cpSync(FIXTURE_SOURCE, repoRoot, { recursive: true });
  mkdirSync(join(repoRoot, "node_modules"), { recursive: true });
  symlinkSync(join(repoRoot, "package-source"), join(repoRoot, "node_modules", "fixture-package"));
  symlinkSync(join(repoRoot, "shared", "symlink-target.ts"), join(repoRoot, "web", "linked.ts"));
  symlinkSync(join(repoRoot, "shared", "symlink-target.ts"), join(repoRoot, "lynx", "linked.ts"));
  return repoRoot;
}

function resolverOptions(repoRoot, platform) {
  return {
    alias: {
      "@fixture/primitives$": join(repoRoot, "shared", "primitive.ts"),
    },
    aliasFields: ["browser"],
    conditionNames:
      platform === "lynx" ? ["lynx", "import", "browser"] : ["import", "browser", "production"],
    exportsFields: ["exports"],
    extensions:
      platform === "lynx"
        ? [".lynx.tsx", ".lynx.ts", ".tsx", ".ts", ".js", ".json"]
        : [".web.tsx", ".web.ts", ".tsx", ".ts", ".js", ".json"],
    importsFields: ["imports"],
    mainFields: platform === "lynx" ? ["lynx", "module", "main"] : ["browser", "module", "main"],
    mainFiles: ["index"],
    modules: ["node_modules"],
    symlinks: true,
  };
}

function fixtureBoundaries() {
  const graph = {
    web: ["web/entry.tsx"],
    lynx: ["lynx/entry.tsx"],
  };
  return {
    schemaVersion: 1,
    denominator: "eligible-web-production-modules",
    sourceExtensions: [".css", ".js", ".jsx", ".mjs", ".ts", ".tsx"],
    exclusions: {
      pathPrefixes: ["generated/", "node_modules/"],
      exactPaths: [],
      pathPatterns: ["\\.(?:test|spec)\\.[cm]?[jt]sx?$", "\\.d\\.ts$"],
    },
    hardIslands: [],
    patchedPairs: [
      {
        id: "fixture-generated-css",
        source: "generated/web.css",
        output: "generated/lynx.css",
        generator: "fixture-generator",
      },
    ],
    screens: [
      {
        id: "fixture",
        label: "Fixture",
        graphs: {
          route: graph,
          productSurface: graph,
          rendererLocal: graph,
        },
      },
    ],
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    if (root.startsWith(join(tmpdir(), "t3code-reuse-fixture-"))) {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

describe("physical source reuse auditor", () => {
  it("requires an explicit reviewed baseline for boundary changes", () => {
    assert.doesNotThrow(() => assertBoundaryBaseline("same", "same"));
    assert.throws(
      () => assertBoundaryBaseline("changed", "reviewed"),
      /without a reviewed baseline update/u,
    );
  });

  it("uses platform extensions, exact aliases, exports conditions, and canonical realpaths", async () => {
    const repoRoot = makeFixture();
    const webOptions = resolverOptions(repoRoot, "web");
    const lynxOptions = resolverOptions(repoRoot, "lynx");
    const webResolver = createProductionResolver(webOptions);
    const lynxResolver = createProductionResolver(lynxOptions);
    const webEntry = join(repoRoot, "web", "entry.tsx");
    const lynxEntry = join(repoRoot, "lynx", "entry.tsx");

    assert.equal(
      webResolver.resolve(webEntry, "../platform/choice"),
      realpathSync(join(repoRoot, "platform", "choice.web.tsx")),
    );
    assert.equal(
      lynxResolver.resolve(lynxEntry, "../platform/choice"),
      realpathSync(join(repoRoot, "platform", "choice.lynx.tsx")),
    );
    assert.equal(
      webResolver.resolve(webEntry, "fixture-package/conditioned"),
      realpathSync(join(repoRoot, "package-source", "src", "conditioned.web.ts")),
    );
    assert.equal(
      lynxResolver.resolve(lynxEntry, "fixture-package/conditioned"),
      realpathSync(join(repoRoot, "package-source", "src", "conditioned.lynx.ts")),
    );
    assert.equal(
      webResolver.resolve(webEntry, "@fixture/primitives"),
      realpathSync(join(repoRoot, "shared", "primitive.ts")),
    );
    assert.throws(() => webResolver.resolve(webEntry, "@fixture/primitives-extra"));
    assert.equal(
      webResolver.resolve(webEntry, "./linked"),
      realpathSync(join(repoRoot, "shared", "symlink-target.ts")),
    );
  });

  it("does not count copied or renamed bytes as shared and excludes generated CSS", async () => {
    const repoRoot = makeFixture();
    const boundaries = fixtureBoundaries();
    const boundariesText = stableJson(boundaries);
    const report = await generateReuseReport({
      appRoot: repoRoot,
      boundaries,
      boundariesText,
      repoRoot,
      lynxResolverOptions: resolverOptions(repoRoot, "lynx"),
      webResolverOptions: resolverOptions(repoRoot, "web"),
    });
    const graph = report.screens[0].graphs.productSurface;
    const rows = new Map(graph.web.modules.map((row) => [row.path, row]));

    assert.equal(
      readFileSync(join(repoRoot, "web", "copied.ts"), "utf8"),
      readFileSync(join(repoRoot, "lynx", "copied-renamed.ts"), "utf8"),
    );
    assert.equal(rows.get("web/copied.ts").classification, "EXCLUSIVE");
    assert.equal(rows.get("platform/choice.web.tsx").classification, "SPLIT");
    assert.equal(rows.get("package-source/src/conditioned.web.ts").classification, "SPLIT");
    assert.equal(rows.get("shared/plain.tsx").classification, "SHARED");
    assert.equal(rows.get("shared/primitive.ts").classification, "SHARED");
    assert.equal(rows.get("shared/symlink-target.ts").classification, "SHARED");
    assert.equal(rows.get("package-source/src/shared.ts").classification, "SHARED");
    assert.notProperty(rows, "generated/web.css");
    assert.deepEqual(report.patchedPairs, [
      {
        classification: "PATCHED",
        generator: "fixture-generator",
        id: "fixture-generated-css",
        output: "generated/lynx.css",
        source: "generated/web.css",
      },
    ]);

    const second = await generateReuseReport({
      appRoot: repoRoot,
      boundaries,
      boundariesText,
      repoRoot,
      lynxResolverOptions: resolverOptions(repoRoot, "lynx"),
      webResolverOptions: resolverOptions(repoRoot, "web"),
    });
    assert.equal(stableJson(second), stableJson(report));
  });
});

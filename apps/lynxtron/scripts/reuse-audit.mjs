import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";

import enhancedResolve from "enhanced-resolve";
import ts from "typescript";

const GRAPH_NAMES = ["route", "productSurface", "rendererLocal"];
const CLASSIFICATIONS = ["SHARED", "PATCHED", "SPLIT", "EXCLUSIVE"];

function normalizePath(path) {
  return path.split(sep).join("/");
}

function stableValue(value) {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

export function stableJson(value) {
  return `${JSON.stringify(stableValue(value), null, 2)}\n`;
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export function assertBoundaryBaseline(actual, expected) {
  if (actual !== expected) {
    throw new Error(
      [
        "Reuse exclusions or graph boundaries changed without a reviewed baseline update.",
        `expected ${expected}`,
        `actual   ${actual}`,
        "Review scripts/reuse-boundaries.json, then update reuse-boundaries.baseline.json explicitly.",
      ].join("\n"),
    );
  }
}

export function physicalLineCount(file) {
  const text = readFileSync(file, "utf8");
  if (text.length === 0) return 0;
  return text.split(/\r?\n/u).length - (text.endsWith("\n") ? 1 : 0);
}

function sourceExtension(file, extensions) {
  return [...extensions]
    .sort((left, right) => right.length - left.length)
    .find((extension) => file.endsWith(extension));
}

function repoRelative(repoRoot, file) {
  return normalizePath(relative(repoRoot, file));
}

function isWithin(directory, file) {
  const path = relative(directory, file);
  return path === "" || (!path.startsWith(`..${sep}`) && path !== ".." && !path.startsWith(sep));
}

export function isExcluded(relativePath, boundaries) {
  const { exclusions } = boundaries;
  return (
    exclusions.pathPrefixes.some((prefix) => relativePath.startsWith(prefix)) ||
    exclusions.exactPaths.includes(relativePath) ||
    exclusions.pathPatterns.some((pattern) => new RegExp(pattern, "u").test(relativePath))
  );
}

function isEligibleFile(repoRoot, file, boundaries) {
  if (!isWithin(repoRoot, file)) return false;
  const relativePath = repoRelative(repoRoot, file);
  return (
    sourceExtension(relativePath, boundaries.sourceExtensions) !== undefined &&
    !isExcluded(relativePath, boundaries)
  );
}

function scriptKind(file) {
  if (file.endsWith(".tsx")) return ts.ScriptKind.TSX;
  if (file.endsWith(".jsx")) return ts.ScriptKind.JSX;
  if (file.endsWith(".ts")) return ts.ScriptKind.TS;
  if (file.endsWith(".json")) return ts.ScriptKind.JSON;
  return ts.ScriptKind.JS;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
    return node.text;
  }
  throw new Error(`Unsupported inspected-config property name: ${node.getText()}`);
}

function printedConfigValue(node) {
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(printedConfigValue);
  }
  if (ts.isObjectLiteralExpression(node)) {
    return Object.fromEntries(
      node.properties.map((property) => {
        if (!ts.isPropertyAssignment(property)) {
          throw new Error(`Unsupported inspected-config member: ${property.getText()}`);
        }
        return [propertyName(property.name), printedConfigValue(property.initializer)];
      }),
    );
  }
  throw new Error(`Unsupported inspected-config value: ${node.getText()}`);
}

function readPrintedResolveOptions(configPath) {
  const text = readFileSync(configPath, "utf8");
  const source = ts.createSourceFile(
    configPath,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS,
  );
  const exportAssignment = source.statements.find(ts.isExportAssignment);
  if (!exportAssignment || !ts.isObjectLiteralExpression(exportAssignment.expression)) {
    throw new Error("Inspected Rspack config does not export an object literal");
  }
  const resolveProperty = exportAssignment.expression.properties.find(
    (property) => ts.isPropertyAssignment(property) && propertyName(property.name) === "resolve",
  );
  if (!resolveProperty || !ts.isPropertyAssignment(resolveProperty)) {
    throw new Error("Inspected Rspack config does not contain resolve options");
  }
  return printedConfigValue(resolveProperty.initializer);
}

function isTypeOnlyImport(node) {
  if (!node.importClause) return false;
  if (node.importClause.isTypeOnly) return true;
  const bindings = node.importClause.namedBindings;
  return (
    bindings &&
    ts.isNamedImports(bindings) &&
    bindings.elements.length > 0 &&
    bindings.elements.every((element) => element.isTypeOnly)
  );
}

function sourceSpecifiers(file) {
  const text = readFileSync(file, "utf8");
  if (file.endsWith(".css")) {
    return [...text.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/gu)].map((match) => match[1]);
  }

  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
  const specifiers = new Set();

  function visit(node) {
    if (
      ts.isImportDeclaration(node) &&
      !isTypeOnlyImport(node) &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text);
    } else if (
      ts.isExportDeclaration(node) &&
      !node.isTypeOnly &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.add(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === "require"))
    ) {
      specifiers.add(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }

  visit(source);
  return [...specifiers].sort();
}

function stripRequestSuffix(specifier) {
  return specifier.split(/[?#]/u, 1)[0];
}

function isInternalRequest(specifier) {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    specifier.startsWith("~/") ||
    specifier.startsWith("@t3tools/")
  );
}

export function createProductionResolver(options) {
  const resolveSync = enhancedResolve.create.sync({
    alias: options.alias ?? {},
    aliasFields: options.aliasFields ?? [],
    conditionNames: options.conditionNames ?? [],
    descriptionFiles: options.descriptionFiles ?? ["package.json"],
    enforceExtension: false,
    exportsFields: options.exportsFields ?? ["exports"],
    extensionAlias: options.extensionAlias ?? {},
    extensions: options.extensions,
    fullySpecified: false,
    importsFields: options.importsFields ?? ["imports"],
    mainFields: options.mainFields ?? ["main"],
    mainFiles: options.mainFiles ?? ["index"],
    modules: options.modules ?? ["node_modules"],
    symlinks: options.symlinks ?? true,
    useSyncFileSystemCalls: true,
  });

  return {
    options,
    resolve(importer, request) {
      const cleanRequest = stripRequestSuffix(request);
      const result = resolveSync(dirname(importer), cleanRequest);
      return result ? realpathSync(result) : null;
    },
  };
}

export function buildGraph({ boundaries, repoRoot, resolver, roots }) {
  const rootFiles = roots.map((root) => realpathSync(resolve(repoRoot, root)));
  const pending = [...rootFiles];
  const modules = new Set();
  const edges = [];
  const unresolved = [];

  while (pending.length > 0) {
    const file = pending.pop();
    if (!file || modules.has(file) || !isEligibleFile(repoRoot, file, boundaries)) continue;
    modules.add(file);

    for (const request of sourceSpecifiers(file)) {
      let dependency = null;
      try {
        dependency = resolver.resolve(file, request);
      } catch (error) {
        if (isInternalRequest(request)) {
          throw new Error(
            `Production resolver could not resolve ${JSON.stringify(request)} from ${repoRelative(
              repoRoot,
              file,
            )}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
        unresolved.push({
          importer: repoRelative(repoRoot, file),
          request,
        });
        continue;
      }
      if (!dependency || !isEligibleFile(repoRoot, dependency, boundaries)) continue;
      edges.push({
        from: repoRelative(repoRoot, file),
        request,
        to: repoRelative(repoRoot, dependency),
      });
      if (!modules.has(dependency)) pending.push(dependency);
    }
  }

  return {
    roots: rootFiles.map((file) => repoRelative(repoRoot, file)).sort(),
    modules,
    edges: edges.sort(
      (left, right) =>
        left.from.localeCompare(right.from) ||
        left.request.localeCompare(right.request) ||
        left.to.localeCompare(right.to),
    ),
    unresolved: unresolved.sort(
      (left, right) =>
        left.importer.localeCompare(right.importer) || left.request.localeCompare(right.request),
    ),
  };
}

function platformLogicalPath(path) {
  return path.replace(/\.(?:web|lynx)(?=\.[^.]+$)/u, ".platform");
}

function classifyWebModule({ file, lynxModules, lynxLogicalPaths, patchedSources, repoRoot }) {
  if (lynxModules.has(file)) return "SHARED";
  const relativePath = repoRelative(repoRoot, file);
  if (patchedSources.has(relativePath)) return "PATCHED";
  if (
    relativePath !== platformLogicalPath(relativePath) &&
    lynxLogicalPaths.has(platformLogicalPath(relativePath))
  ) {
    return "SPLIT";
  }
  return "EXCLUSIVE";
}

function graphReport({ boundaries, repoRoot, webGraph, lynxGraph }) {
  const patchedSources = new Set(boundaries.patchedPairs.map((pair) => pair.source));
  const lynxLogicalPaths = new Set(
    [...lynxGraph.modules].map((file) => platformLogicalPath(repoRelative(repoRoot, file))),
  );
  const rows = [...webGraph.modules]
    .map((file) => {
      const classification = classifyWebModule({
        file,
        lynxModules: lynxGraph.modules,
        lynxLogicalPaths,
        patchedSources,
        repoRoot,
      });
      return {
        path: repoRelative(repoRoot, file),
        classification,
        lines: physicalLineCount(file),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));

  const webPathSet = new Set([...webGraph.modules].map((file) => repoRelative(repoRoot, file)));
  const lynxOnlyRows = [...lynxGraph.modules]
    .filter((file) => !webGraph.modules.has(file))
    .map((file) => ({
      path: repoRelative(repoRoot, file),
      classification:
        repoRelative(repoRoot, file) !== platformLogicalPath(repoRelative(repoRoot, file)) &&
        [...webPathSet].some(
          (webPath) =>
            platformLogicalPath(webPath) === platformLogicalPath(repoRelative(repoRoot, file)),
        )
          ? "SPLIT"
          : "EXCLUSIVE",
      lines: physicalLineCount(file),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));

  const sharedRows = rows.filter((row) => row.classification === "SHARED");
  const eligibleLines = rows.reduce((sum, row) => sum + row.lines, 0);
  const reusedLines = sharedRows.reduce((sum, row) => sum + row.lines, 0);
  const counts = Object.fromEntries(
    CLASSIFICATIONS.map((classification) => [
      classification,
      rows.filter((row) => row.classification === classification).length,
    ]),
  );
  const largestNonShared = [...rows, ...lynxOnlyRows]
    .filter((row) => row.classification !== "SHARED")
    .sort((left, right) => right.lines - left.lines || left.path.localeCompare(right.path))
    .slice(0, 15);

  return {
    denominator: boundaries.denominator,
    eligible: {
      modules: rows.length,
      lines: eligibleLines,
    },
    reused: {
      modules: sharedRows.length,
      lines: reusedLines,
    },
    reusePercent: {
      modules: rows.length === 0 ? 0 : Number(((sharedRows.length / rows.length) * 100).toFixed(1)),
      lines: eligibleLines === 0 ? 0 : Number(((reusedLines / eligibleLines) * 100).toFixed(1)),
    },
    classificationCounts: counts,
    largestNonShared,
    web: {
      roots: webGraph.roots,
      modules: rows,
      edges: webGraph.edges,
      unresolvedExternalRequests: webGraph.unresolved,
    },
    lynx: {
      roots: lynxGraph.roots,
      eligibleModules: lynxGraph.modules.size,
      eligibleLines: [...lynxGraph.modules].reduce((sum, file) => sum + physicalLineCount(file), 0),
      modulesOnlyInLynx: lynxOnlyRows,
      edges: lynxGraph.edges,
      unresolvedExternalRequests: lynxGraph.unresolved,
    },
  };
}

function normalizedResolverContract(repoRoot, options) {
  const replaceRoot = (value) =>
    typeof value === "string"
      ? normalizePath(value).replace(normalizePath(repoRoot), "<repo>")
      : value;
  return stableValue({
    alias: Object.fromEntries(
      Object.entries(options.alias ?? {}).map(([key, value]) => [key, replaceRoot(value)]),
    ),
    aliasFields: options.aliasFields ?? [],
    conditionNames: options.conditionNames ?? [],
    exportsFields: options.exportsFields ?? ["exports"],
    extensions: options.extensions,
    importsFields: options.importsFields ?? ["imports"],
    mainFields: options.mainFields ?? [],
    mainFiles: options.mainFiles ?? ["index"],
    modules: options.modules ?? ["node_modules"],
    symlinks: options.symlinks ?? true,
  });
}

export async function inspectLynxProductionResolver({ appRoot, repoRoot }) {
  const inspectRoot = mkdtempSync(join(tmpdir(), "t3code-lynx-resolver-"));
  const binary = join(appRoot, "node_modules", ".bin", "rspeedy");
  try {
    const result = spawnSync(
      binary,
      ["inspect", "--output", inspectRoot, "--verbose", "-m", "production"],
      {
        cwd: appRoot,
        encoding: "utf8",
        env: {
          ...process.env,
          NODE_ENV: "production",
        },
      },
    );
    if (result.status !== 0) {
      throw new Error(result.stderr || result.stdout || "rspeedy inspect failed");
    }
    const configPath = join(inspectRoot, "rspack.config.lynx.mjs");
    const options = readPrintedResolveOptions(configPath);
    if (!options?.extensions || !options?.conditionNames || !options?.alias) {
      throw new Error("Inspected Lynx production config is missing resolver fields");
    }
    const contract = normalizedResolverContract(repoRoot, options);
    return {
      options,
      contract,
      fingerprint: sha256(stableJson(contract)),
    };
  } finally {
    if (
      inspectRoot.startsWith(join(tmpdir(), "t3code-lynx-resolver-")) &&
      existsSync(inspectRoot)
    ) {
      rmSync(inspectRoot, { recursive: true, force: true });
    }
  }
}

export function webProductionResolverOptions(repoRoot) {
  return {
    alias: {
      "~": join(repoRoot, "apps", "web", "src"),
    },
    aliasFields: ["browser"],
    conditionNames: ["import", "module", "browser", "production"],
    exportsFields: ["exports"],
    extensions: [".web.tsx", ".web.ts", ".tsx", ".ts", ".jsx", ".js", ".json"],
    importsFields: ["imports"],
    mainFields: ["browser", "module", "jsnext:main", "jsnext", "main"],
    mainFiles: ["index"],
    modules: ["node_modules"],
    symlinks: true,
  };
}

export async function generateReuseReport({
  appRoot,
  boundaries,
  boundariesText,
  repoRoot,
  lynxResolverOptions,
  webResolverOptions,
}) {
  const canonicalRepoRoot = realpathSync(repoRoot);
  const resolvedWebOptions = webResolverOptions ?? webProductionResolverOptions(canonicalRepoRoot);
  const inspected =
    lynxResolverOptions === undefined
      ? await inspectLynxProductionResolver({ appRoot, repoRoot: canonicalRepoRoot })
      : {
          options: lynxResolverOptions,
          contract: normalizedResolverContract(canonicalRepoRoot, lynxResolverOptions),
          fingerprint: sha256(
            stableJson(normalizedResolverContract(canonicalRepoRoot, lynxResolverOptions)),
          ),
        };
  const webContract = normalizedResolverContract(canonicalRepoRoot, resolvedWebOptions);
  const lynxResolver = createProductionResolver(inspected.options);
  const webResolver = createProductionResolver(resolvedWebOptions);

  const screens = [];
  for (const screen of boundaries.screens) {
    const graphs = {};
    for (const graphName of GRAPH_NAMES) {
      const graphBoundary = screen.graphs[graphName];
      const webGraph = buildGraph({
        boundaries,
        repoRoot: canonicalRepoRoot,
        resolver: webResolver,
        roots: graphBoundary.web,
      });
      const lynxGraph = buildGraph({
        boundaries,
        repoRoot: canonicalRepoRoot,
        resolver: lynxResolver,
        roots: graphBoundary.lynx,
      });
      graphs[graphName] = graphReport({
        boundaries,
        repoRoot: canonicalRepoRoot,
        webGraph,
        lynxGraph,
      });
    }
    screens.push({
      id: screen.id,
      label: screen.label,
      graphs,
    });
  }

  return {
    schemaVersion: 1,
    method: {
      denominator: boundaries.denominator,
      physicalLines: "newline-delimited physical source lines",
      reused:
        "eligible Web production modules whose canonical realpath is reachable in the paired Lynx graph",
      copiedFiles: "EXCLUSIVE even when bytes are identical",
      generatedStyles: "registered as PATCHED and excluded from SHARED reuse",
      symlinks: "resolved before graph identity comparison",
    },
    boundarySha256: sha256(boundariesText),
    resolver: {
      lynxProduction: {
        source: "rspeedy inspect --verbose -m production",
        fingerprint: inspected.fingerprint,
        contract: inspected.contract,
      },
      webProduction: {
        source: "apps/web/vite.config.ts plus tsconfig ~ alias",
        fingerprint: sha256(stableJson(webContract)),
        contract: webContract,
      },
    },
    exclusions: boundaries.exclusions,
    hardIslands: boundaries.hardIslands,
    patchedPairs: boundaries.patchedPairs.map((pair) => ({
      ...pair,
      classification: "PATCHED",
    })),
    screens,
  };
}

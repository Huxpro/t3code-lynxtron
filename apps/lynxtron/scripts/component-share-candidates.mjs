#!/usr/bin/env node

// Lists upstream Web components that the Lynx build replaces with a `.lynx.tsx`
// file of the same name, and what stands between each one and compiling the
// upstream file instead (see lynx-dom-jsx-loader.cjs).
//
//   node scripts/component-share-candidates.mjs [--json] [--all]
//
// For every `apps/web/src/components/**/X.tsx` with an `X.lynx.tsx` next to it:
// line counts, the DOM tags and DOM event props the upstream file writes, and
// each value import classified as
//   seam      resolves to a `.lynx` module that exports the imported names
//   in place  an upstream module or package the Lynx bundle already compiles
//   blocker   anything else: no Lynx answer yet
// Unmapped DOM tags, unmappable event props and DOM refs are blockers too, and
// so is Lynx code importing a name from the copy that upstream does not export.
// Sorted by fewest blockers. `components/ui` rows are primitives, which stay
// Lynx implementations; they are listed so the table is complete.

import * as NodeFS from "node:fs";
import { createRequire } from "node:module";
import * as NodePath from "node:path";
import NodeProcess from "node:process";
import * as NodeURL from "node:url";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const { readHostTags } = require("./lynx-dom-jsx-loader.cjs");

const appRoot = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");
const repoRoot = NodePath.resolve(appRoot, "../..");
const webSource = NodePath.join(repoRoot, "apps/web/src");
const componentsRoot = NodePath.join(webSource, "components");
const EXTENSIONS = [".lynx.tsx", ".lynx.ts", ".tsx", ".ts"];
// Packages the Lynx build aliases to a Lynx module: the shims in lynx.config.ts
// and every package specifier src/app/tsconfig.json maps to a Lynx file.
const ALIASED_PACKAGES = new Set([
  "react",
  "react-dom",
  "lucide-react",
  "@formkit/auto-animate",
  ...Object.keys(
    JSON.parse(NodeFS.readFileSync(NodePath.join(appRoot, "src/app/tsconfig.json"), "utf8"))
      .compilerOptions.paths,
  ).filter((specifier) => !specifier.includes("*")),
]);
const WORKSPACE_PACKAGES = {
  "@t3tools/client-runtime": "packages/client-runtime",
  "@t3tools/contracts": "packages/contracts",
  "@t3tools/lynx-logic": "packages/lynx-logic",
  "@t3tools/shared": "packages/shared",
};
const EVENT_PROPS = new Set(["onClick"]);

const isFile = (path) => NodeFS.existsSync(path) && NodeFS.statSync(path).isFile();
const isLynxModule = (path) => /\.lynx\.tsx?$/u.test(path);
const relative = (path) => NodePath.relative(repoRoot, path);

function resolveFile(base) {
  if (isFile(base)) return base;
  for (const extension of EXTENSIONS) if (isFile(base + extension)) return base + extension;
  for (const extension of EXTENSIONS) {
    const index = NodePath.join(base, `index${extension}`);
    if (isFile(index)) return index;
  }
  return null;
}

function resolveWorkspacePackage(specifier) {
  for (const [name, directory] of Object.entries(WORKSPACE_PACKAGES)) {
    if (specifier !== name && !specifier.startsWith(`${name}/`)) continue;
    const subpath = specifier.slice(name.length + 1);
    const root = NodePath.join(repoRoot, directory);
    const exportsMap = JSON.parse(
      NodeFS.readFileSync(NodePath.join(root, "package.json"), "utf8"),
    ).exports;
    const entry = exportsMap?.[subpath ? `./${subpath}` : "."] ?? exportsMap?.["./*"];
    const target = typeof entry === "string" ? entry : (entry?.types ?? entry?.import);
    if (typeof target !== "string") return null;
    return resolveFile(NodePath.join(root, target.replace("*", subpath)).replace(/\.ts$/u, ""));
  }
  return null;
}

/** Resolves the way the Lynx build does: `.lynx` first. Null for an npm package. */
function resolveSpecifier(from, specifier) {
  if (specifier.startsWith("~/")) return resolveFile(NodePath.join(webSource, specifier.slice(2)));
  if (specifier.startsWith(".")) {
    return resolveFile(NodePath.resolve(NodePath.dirname(from), specifier.replace(/\.tsx?$/u, "")));
  }
  return resolveWorkspacePackage(specifier);
}

const parsed = new Map();
function parse(file) {
  let source = parsed.get(file);
  if (!source) {
    source = ts.createSourceFile(
      file,
      NodeFS.readFileSync(file, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    parsed.set(file, source);
  }
  return source;
}

/** Value imports and re-exports of a module: `{ specifier, names }`, names null for `*`. */
function valueImports(file) {
  const imports = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (!clause) {
        imports.push({ specifier: node.moduleSpecifier.text, names: [] });
      } else if (!clause.isTypeOnly) {
        const names = [];
        let wildcard = false;
        if (clause.name) names.push("default");
        if (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings)) wildcard = true;
        if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
          for (const element of clause.namedBindings.elements) {
            if (!element.isTypeOnly) names.push((element.propertyName ?? element.name).text);
          }
        }
        if (wildcard || names.length > 0) {
          imports.push({ specifier: node.moduleSpecifier.text, names: wildcard ? null : names });
        }
      }
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      !node.isTypeOnly
    ) {
      const names =
        node.exportClause && ts.isNamedExports(node.exportClause)
          ? node.exportClause.elements
              .filter((element) => !element.isTypeOnly)
              .map((element) => (element.propertyName ?? element.name).text)
          : null;
      imports.push({ specifier: node.moduleSpecifier.text, names });
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments[0] &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      imports.push({ specifier: node.arguments[0].text, names: null });
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return imports;
}

/** Names a module exports as values. Null when it re-exports `*` (unknown). */
function valueExports(file) {
  const names = new Set();
  for (const statement of parse(file).statements) {
    const exported = statement.modifiers?.some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    );
    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue;
      if (!statement.exportClause) return null;
      if (ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) names.add(element.name.text);
      }
    } else if (ts.isExportAssignment(statement)) {
      names.add("default");
    } else if (exported) {
      const isDefault = statement.modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
      );
      if (isDefault) names.add("default");
      else if (ts.isVariableStatement(statement)) {
        for (const declaration of statement.declarationList.declarations) {
          if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text);
        }
      } else if (
        (ts.isFunctionDeclaration(statement) ||
          ts.isClassDeclaration(statement) ||
          ts.isEnumDeclaration(statement)) &&
        statement.name
      ) {
        names.add(statement.name.text);
      }
    }
  }
  return names;
}

// What the Lynx bundle compiles today: files and npm specifiers reachable from the entry.
const bundleFiles = new Set();
const bundlePackages = new Set();
// Per bundled file, the names other bundled files import from it.
const importedNames = new Map();
const pending = [NodePath.join(appRoot, "src/app/index.tsx")];
while (pending.length > 0) {
  const file = pending.pop();
  if (bundleFiles.has(file)) continue;
  bundleFiles.add(file);
  for (const { specifier, names } of valueImports(file)) {
    const resolved = resolveSpecifier(file, specifier);
    if (resolved) {
      pending.push(resolved);
      const wanted = importedNames.get(resolved) ?? new Set();
      for (const name of names ?? []) wanted.add(name);
      importedNames.set(resolved, wanted);
    } else if (!specifier.startsWith(".") && !specifier.startsWith("~/"))
      bundlePackages.add(specifier);
  }
}

const hostTags = readHostTags(
  NodeFS.readFileSync(NodePath.join(appRoot, "src/app/platform/hostDom.tsx"), "utf8"),
);
const lucideIcons = valueExports(NodePath.join(appRoot, "src/app/lucide-react-shim.tsx"));

function domUsage(file) {
  const tags = new Set();
  const events = new Set();
  const blockers = new Set();
  const visit = (node) => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      if (ts.isIdentifier(node.tagName) && /^[a-z]/u.test(node.tagName.text)) {
        const tag = node.tagName.text;
        tags.add(tag);
        if (!hostTags.has(tag)) blockers.add(`tag <${tag}>`);
        for (const attribute of node.attributes.properties) {
          if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
          const name = attribute.name.text;
          if (/^on[A-Z]/u.test(name)) {
            events.add(name);
            if (!EVENT_PROPS.has(name)) blockers.add(`event ${name}`);
          } else if (name === "ref" || name === "dangerouslySetInnerHTML") {
            blockers.add(`prop ${name} on a DOM tag`);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parse(file));
  return { tags: [...tags].sort(), events: [...events].sort(), blockers: [...blockers].sort() };
}

function classifyImport(file, { specifier, names }) {
  const local = specifier.startsWith(".") || specifier.startsWith("~/");
  const resolved = resolveSpecifier(file, specifier);
  if (resolved === null) {
    if (local) return { kind: "blocker", label: `${specifier} (unresolved)` };
    if (specifier === "lucide-react" && lucideIcons) {
      const missing = (names ?? []).filter((name) => !lucideIcons.has(name));
      if (missing.length > 0) {
        return { kind: "blocker", label: `lucide-react lacks ${missing.join(", ")}` };
      }
    }
    return ALIASED_PACKAGES.has(specifier) || bundlePackages.has(specifier)
      ? { kind: "inPlace", label: specifier }
      : { kind: "blocker", label: `package ${specifier}` };
  }
  const label = relative(resolved).replace(/^apps\/web\/src\//u, "");
  if (isLynxModule(resolved)) {
    const exported = valueExports(resolved);
    const missing = exported ? (names ?? []).filter((name) => !exported.has(name)) : [];
    return missing.length > 0
      ? { kind: "blocker", label: `${label} lacks ${missing.join(", ")}` }
      : { kind: "seam", label };
  }
  return bundleFiles.has(resolved)
    ? { kind: "inPlace", label }
    : { kind: "blocker", label: `${label} (not in the Lynx bundle)` };
}

function listShadowed(directory) {
  const found = [];
  for (const entry of NodeFS.readdirSync(directory, { withFileTypes: true })) {
    const path = NodePath.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...listShadowed(path));
    else if (entry.name.endsWith(".lynx.tsx")) {
      const upstream = path.replace(/\.lynx\.tsx$/u, ".tsx");
      if (isFile(upstream)) found.push({ upstream, lynx: path });
    }
  }
  return found;
}

const lineCount = (file) => NodeFS.readFileSync(file, "utf8").split("\n").length - 1;

const rows = listShadowed(componentsRoot)
  .map(({ upstream, lynx }) => {
    const dom = domUsage(upstream);
    const imports = valueImports(upstream).map((entry) => classifyImport(upstream, entry));
    const labels = (kind) => imports.filter((entry) => entry.kind === kind).map((e) => e.label);
    // Lynx code written against the copy may import names upstream never had.
    const upstreamExports = valueExports(upstream);
    const lynxOnlyNames = upstreamExports
      ? [...(importedNames.get(lynx) ?? [])].filter((name) => !upstreamExports.has(name)).sort()
      : [];
    return {
      component: NodePath.relative(componentsRoot, upstream).replace(/\.tsx$/u, ""),
      primitive: NodePath.relative(componentsRoot, upstream).startsWith("ui/"),
      upstreamLines: lineCount(upstream),
      lynxLines: lineCount(lynx),
      tags: dom.tags,
      events: dom.events,
      seams: labels("seam"),
      inPlace: labels("inPlace"),
      blockers: [
        ...dom.blockers,
        ...labels("blocker"),
        ...(lynxOnlyNames.length > 0
          ? [`Lynx code imports ${lynxOnlyNames.join(", ")}, which upstream does not export`]
          : []),
      ],
    };
  })
  .sort(
    (left, right) =>
      left.blockers.length - right.blockers.length ||
      left.upstreamLines - right.upstreamLines ||
      left.component.localeCompare(right.component),
  );

const blockerCounts = new Map();
for (const row of rows) {
  for (const blocker of row.blockers) {
    blockerCounts.set(blocker, (blockerCounts.get(blocker) ?? 0) + 1);
  }
}
const commonBlockers = [...blockerCounts]
  .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
  .slice(0, 12);
const summary = {
  shadows: rows.length,
  primitives: rows.filter((row) => row.primitive).length,
  zeroBlockers: rows.filter((row) => row.blockers.length === 0).length,
  zeroBlockerProductComponents: rows.filter((row) => !row.primitive && row.blockers.length === 0)
    .length,
};

if (NodeProcess.argv.includes("--json")) {
  console.log(JSON.stringify({ summary, commonBlockers, rows }, null, 2));
} else {
  const shown = NodeProcess.argv.includes("--all") ? rows : rows.slice(0, 25);
  console.log("blockers  web/lynx lines  component");
  for (const row of shown) {
    console.log(
      `${String(row.blockers.length).padStart(8)}  ${`${row.upstreamLines}/${row.lynxLines}`.padStart(14)}  ${row.component}${row.primitive ? "  [ui primitive]" : ""}`,
    );
    console.log(`${" ".repeat(26)}tags: ${row.tags.join(" ") || "-"}`);
    if (row.events.length > 0) console.log(`${" ".repeat(26)}events: ${row.events.join(" ")}`);
    console.log(
      `${" ".repeat(26)}imports: ${row.seams.length} seam, ${row.inPlace.length} in place`,
    );
    for (const blocker of row.blockers) console.log(`${" ".repeat(26)}! ${blocker}`);
  }
  if (shown.length < rows.length)
    console.log(`... ${rows.length - shown.length} more (--all, --json)`);
  console.log(
    `\n${summary.shadows} shadowed components (${summary.primitives} ui primitives); ` +
      `${summary.zeroBlockers} with no blockers, ${summary.zeroBlockerProductComponents} of them product components.`,
  );
  console.log("Most common blockers:");
  for (const [blocker, count] of commonBlockers) console.log(`  ${count}  ${blocker}`);
}

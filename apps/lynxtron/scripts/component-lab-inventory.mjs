import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(SCRIPT_DIRECTORY, "..");
const REPO_ROOT = resolve(APP_ROOT, "../..");
const WEB_COMPONENT_ROOT = resolve(REPO_ROOT, "apps/web/src/components");
const WEB_SOURCE_ROOT = resolve(REPO_ROOT, "apps/web/src");
const LYNX_SOURCE_ROOT = resolve(REPO_ROOT, "apps/lynxtron/src/app");
const DEFAULT_OUTPUT = resolve(APP_ROOT, "reports/components-lab/inventory.json");
const CATALOG_PATH = resolve(LYNX_SOURCE_ROOT, "components-lab/catalog.json");
const ISOLATED_CATALOG_PATH = resolve(LYNX_SOURCE_ROOT, "components-lab/isolatedCatalog.json");
const SOURCE_EXTENSIONS = [".web.tsx", ".lynx.tsx", ".tsx", ".web.ts", ".lynx.ts", ".ts"];

function normalizePath(value) {
  return value.split(sep).join("/");
}

function repoPath(value) {
  return normalizePath(relative(REPO_ROOT, value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
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

function sourceFiles(root) {
  const result = [];
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) pending.push(path);
      else if (SOURCE_EXTENSIONS.some((extension) => path.endsWith(extension))) result.push(path);
    }
  }
  return result
    .filter((path) => !/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(path))
    .filter((path) => !path.endsWith(".d.ts"))
    .sort();
}

function scriptKind(path) {
  return path.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
}

function sourceFile(path) {
  return ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    scriptKind(path),
  );
}

function isPascalCase(value) {
  return /^[A-Z][A-Za-z0-9]*$/u.test(value);
}

function containsJsx(node) {
  let found = false;
  function visit(child) {
    if (ts.isJsxElement(child) || ts.isJsxSelfClosingElement(child) || ts.isJsxFragment(child)) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  }
  visit(node);
  return found;
}

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

export function componentDefinitions(path) {
  const source = sourceFile(path);
  const explicitlyExported = new Set();
  for (const statement of source.statements) {
    if (!ts.isExportDeclaration(statement) || !statement.exportClause) continue;
    if (!ts.isNamedExports(statement.exportClause)) continue;
    for (const element of statement.exportClause.elements) {
      explicitlyExported.add((element.propertyName ?? element.name).text);
    }
  }

  const definitions = [];
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) {
      const name = statement.name.text;
      const exported = hasExportModifier(statement) || explicitlyExported.has(name);
      if (isPascalCase(name) && (containsJsx(statement) || exported)) {
        definitions.push({
          name,
          exported,
          line: source.getLineAndCharacterOfPosition(statement.getStart(source)).line + 1,
        });
      }
      continue;
    }
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || !declaration.initializer) continue;
      const name = declaration.name.text;
      const exported = hasExportModifier(statement) || explicitlyExported.has(name);
      if (!isPascalCase(name) || (!containsJsx(declaration.initializer) && !exported)) continue;
      definitions.push({
        name,
        exported,
        line: source.getLineAndCharacterOfPosition(declaration.getStart(source)).line + 1,
      });
    }
  }
  return definitions.sort((left, right) => left.name.localeCompare(right.name));
}

function logicalModulePath(path) {
  return repoPath(path).replace(/\.(?:web|lynx)(?=\.[^.]+$)/u, "");
}

function resolveLocalModule(importer, request, platform) {
  const base = request.startsWith("~/")
    ? resolve(WEB_SOURCE_ROOT, request.slice(2))
    : request.startsWith(".")
      ? resolve(dirname(importer), request)
      : null;
  if (!base) return null;
  const suffixes =
    platform === "lynx"
      ? [".lynx.tsx", ".lynx.ts", ".tsx", ".ts"]
      : [".web.tsx", ".web.ts", ".tsx", ".ts"];
  for (const suffix of suffixes) {
    if (existsSync(`${base}${suffix}`)) return resolve(`${base}${suffix}`);
    if (existsSync(resolve(base, `index${suffix}`))) return resolve(base, `index${suffix}`);
  }
  return null;
}

function jsxNames(source) {
  const names = new Set();
  function visit(node) {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const expression = node.tagName;
      if (ts.isIdentifier(expression)) names.add(expression.text);
      else if (ts.isPropertyAccessExpression(expression))
        names.add(expression.expression.getText(source));
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return names;
}

function localDependencies(path, platform) {
  const source = sourceFile(path);
  const dependencies = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteralLike(statement.moduleSpecifier)) {
      continue;
    }
    const target = resolveLocalModule(path, statement.moduleSpecifier.text, platform);
    if (target) dependencies.push(target);
  }
  return dependencies;
}

function reachableLocalFiles(entries, platform) {
  const files = new Set();
  const pending = [...entries];
  while (pending.length > 0) {
    const path = pending.pop();
    if (!path || files.has(path) || !existsSync(path)) continue;
    files.add(path);
    pending.push(...localDependencies(path, platform));
  }
  return files;
}

function importedComponentUses(path, platform) {
  const source = sourceFile(path);
  const usedNames = jsxNames(source);
  const uses = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    if (!ts.isStringLiteralLike(statement.moduleSpecifier)) continue;
    const target = resolveLocalModule(path, statement.moduleSpecifier.text, platform);
    if (!target) continue;
    const clause = statement.importClause;
    if (clause.name && usedNames.has(clause.name.text)) {
      uses.push({ exportName: "default", localName: clause.name.text, target });
    }
    const bindings = clause.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (!usedNames.has(element.name.text)) continue;
        uses.push({
          exportName: (element.propertyName ?? element.name).text,
          localName: element.name.text,
          target,
        });
      }
    }
  }
  return uses;
}

function platformFiles(module) {
  const base = module.replace(/\.(tsx|ts)$/u, "");
  const generic = resolve(REPO_ROOT, module);
  const web = `${resolve(REPO_ROOT, base)}.web${extname(module)}`;
  const lynx = `${resolve(REPO_ROOT, base)}.lynx${extname(module)}`;
  return {
    web: existsSync(web) ? web : generic,
    lynx: existsSync(lynx) ? lynx : existsSync(generic) ? generic : null,
    hasExplicitWeb: existsSync(web),
    hasExplicitLynx: existsSync(lynx),
  };
}

export function generateComponentInventory() {
  const fullCatalog = JSON.parse(readFileSync(CATALOG_PATH, "utf8"));
  const isolatedCatalog = JSON.parse(readFileSync(ISOLATED_CATALOG_PATH, "utf8"));
  const catalog = [
    ...new Map([...fullCatalog, ...isolatedCatalog].map((story) => [story.id, story])).values(),
  ];
  const stories = new Map(catalog.map((story) => [story.id, story]));
  const componentFiles = sourceFiles(WEB_COMPONENT_ROOT);
  // A Lynx-owned component with no Web module of the same name is its own authority.
  const authorityFiles = componentFiles.filter(
    (path) => !path.endsWith(".lynx.tsx") || !existsSync(path.replace(/\.lynx\.tsx$/u, ".tsx")),
  );
  const logicalModules = new Map();
  for (const path of authorityFiles) {
    const logical = logicalModulePath(path);
    const current = logicalModules.get(logical);
    if (!current || path.endsWith(".web.tsx")) logicalModules.set(logical, path);
  }

  const webReachable = reachableLocalFiles([resolve(WEB_SOURCE_ROOT, "main.tsx")], "web");
  const lynxReachable = reachableLocalFiles([resolve(LYNX_SOURCE_ROOT, "index.tsx")], "lynx");
  const allConsumerFiles = [...new Set([...webReachable, ...lynxReachable])].sort();
  const useSites = new Map();
  for (const consumer of allConsumerFiles) {
    const platforms = [
      ...(webReachable.has(consumer) ? ["web"] : []),
      ...(lynxReachable.has(consumer) ? ["lynx"] : []),
    ];
    for (const platform of platforms) {
      for (const use of importedComponentUses(consumer, platform)) {
        const key = `${repoPath(use.target)}#${use.exportName}`;
        const entries = useSites.get(key) ?? [];
        entries.push({ path: repoPath(consumer), platform });
        useSites.set(key, entries);
      }
    }
  }

  const components = [];
  for (const [logical, authorityFile] of [...logicalModules].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const files = platformFiles(logical);
    for (const definition of componentDefinitions(authorityFile)) {
      const webKey = `${repoPath(files.web)}#${definition.name}`;
      const lynxKey = files.lynx ? `${repoPath(files.lynx)}#${definition.name}` : "";
      const consumers = [...(useSites.get(webKey) ?? []), ...(useSites.get(lynxKey) ?? [])]
        .filter(
          (entry, index, values) =>
            values.findIndex(
              (candidate) => candidate.path === entry.path && candidate.platform === entry.platform,
            ) === index,
        )
        .sort((left, right) => left.path.localeCompare(right.path));
      const implementation = files.hasExplicitLynx
        ? "platform-pair"
        : consumers.some((entry) => entry.platform === "lynx")
          ? "shared-source"
          : "web-only";
      components.push({
        id: `${logical.replace(/^apps\/web\/src\/components\//u, "").replace(/\.(tsx|ts)$/u, "")}#${definition.name}`,
        name: definition.name,
        exported: definition.exported,
        implementation,
        authority: { path: repoPath(files.web), line: definition.line },
        lynx: files.hasExplicitLynx ? { path: repoPath(files.lynx) } : null,
        useSites: consumers,
        reuse: {
          webUseSiteCount: consumers.filter((entry) => entry.platform === "web").length,
          lynxUseSiteCount: consumers.filter((entry) => entry.platform === "lynx").length,
          authorityShared: consumers.filter((entry) => entry.platform === "web").length > 1,
          lynxUsesLogicalComponent: consumers.some((entry) => entry.platform === "lynx"),
        },
        story: stories.has(
          `${logical.replace(/^apps\/web\/src\/components\//u, "").replace(/\.(tsx|ts)$/u, "")}#${definition.name}`,
        )
          ? {
              status: "covered",
              ...stories.get(
                `${logical.replace(/^apps\/web\/src\/components\//u, "").replace(/\.(tsx|ts)$/u, "")}#${definition.name}`,
              ),
            }
          : { status: "uncovered" },
      });
    }
  }

  const counts = {
    components: components.length,
    exported: components.filter((entry) => entry.exported).length,
    internal: components.filter((entry) => !entry.exported).length,
    platformPairs: components.filter((entry) => entry.implementation === "platform-pair").length,
    sharedSource: components.filter((entry) => entry.implementation === "shared-source").length,
    webOnly: components.filter((entry) => entry.implementation === "web-only").length,
    stories: components.filter((entry) => entry.story.status === "covered").length,
    coveredStoriesMissingLynxUse: components.filter(
      (entry) => entry.story.status === "covered" && !entry.reuse.lynxUsesLogicalComponent,
    ).length,
  };
  return {
    schemaVersion: 1,
    generatedFrom: "apps/web/src/components",
    method: {
      component: "top-level PascalCase function or variable initializer containing JSX",
      authority: "Web production resolver (.web before generic)",
      lynx: "Lynx production resolver (.lynx before generic)",
      useSite: "local import binding referenced as a JSX tag",
      storyCoverage: "explicit shared Components Lab story registry",
    },
    counts,
    catalog,
    components,
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const output = argumentValue("--output")
    ? resolve(process.cwd(), argumentValue("--output"))
    : DEFAULT_OUTPUT;
  const report = generateComponentInventory();
  const json = stableJson(report);
  if (process.argv.includes("--check")) {
    if (!existsSync(output)) throw new Error(`Components Lab inventory is missing: ${output}`);
    const current = JSON.parse(readFileSync(output, "utf8"));
    if (stableJson(current) !== json) {
      throw new Error(
        "Components Lab inventory drifted. Run pnpm --filter @t3tools/lynxtron report:components-lab and review the component/use-site changes.",
      );
    }
  } else {
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, json);
  }
  const digest = createHash("sha256").update(json).digest("hex");
  process.stdout.write(
    `${JSON.stringify({ checked: process.argv.includes("--check"), output, sha256: digest, ...report.counts }, null, 2)}\n`,
  );
}

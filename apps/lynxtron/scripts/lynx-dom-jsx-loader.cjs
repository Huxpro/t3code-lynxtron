// Rspack loader for the Lynx build. Upstream Web components write DOM tags
// (`<div>`, `<span>`, `<button>`); Lynx has no DOM. Upstream files are not
// edited, so each DOM tag in an upstream `apps/web/src/**/*.tsx` is rewritten
// here to the component of the same name exported by the Lynx-owned host module
// (`src/app/platform/hostDom.tsx`) before ReactLynx compiles the file.
//
// The host module's exports are the tag map: a tag is supported when hostDom
// exports it. Anything the rewrite cannot express fails the build with the file
// and the offending tag or prop, because a silently dropped element or handler
// is a broken screen:
//   - a DOM tag hostDom does not export
//   - an event prop on a DOM tag with no exact Lynx equivalent
//   - `ref` or `dangerouslySetInnerHTML` on a DOM tag (DOM node access)
// Lynx-owned files are not rewritten; a DOM tag in one of them also fails.
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");

const WEB_SOURCE = path.resolve(__dirname, "../../web/src") + path.sep;
const HOST_MODULE = path.resolve(__dirname, "../src/app/platform/hostDom.tsx");
const HOST_NAMESPACE = "__LynxHostDom";

// DOM event props whose Lynx binding has the same meaning.
const EVENT_PROPS = new Map([["onClick", "bindtap"]]);

const REFUSED_PROPS = new Map([
  ["ref", "a DOM node ref has no Lynx equivalent"],
  ["dangerouslySetInnerHTML", "Lynx cannot render HTML strings"],
]);

function isUpstreamComponent(resourcePath) {
  return (
    resourcePath.startsWith(WEB_SOURCE) &&
    resourcePath.endsWith(".tsx") &&
    !resourcePath.endsWith(".lynx.tsx")
  );
}

function hasExportModifier(node) {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) ?? false;
}

/** The value names a host module exports, read from its source. */
function readHostTags(hostSource, hostPath = HOST_MODULE) {
  const file = ts.createSourceFile(
    hostPath,
    hostSource,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const tags = new Set();
  for (const statement of file.statements) {
    if (!hasExportModifier(statement)) continue;
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) tags.add(declaration.name.text);
      }
    } else if (ts.isFunctionDeclaration(statement) && statement.name) {
      tags.add(statement.name.text);
    }
  }
  return tags;
}

// Re-read when the host module changes, so a dev build picks up a new tag.
let cachedHostTags = { mtimeMs: -1, tags: new Set() };
function hostTags() {
  const { mtimeMs } = fs.statSync(HOST_MODULE);
  if (mtimeMs !== cachedHostTags.mtimeMs) {
    cachedHostTags = { mtimeMs, tags: readHostTags(fs.readFileSync(HOST_MODULE, "utf8")) };
  }
  return cachedHostTags.tags;
}

// JSX treats a lowercase or hyphenated bare name as a host element.
function intrinsicTagName(tagName) {
  if (!ts.isIdentifier(tagName)) return null;
  return /^[a-z]/u.test(tagName.text) ? tagName.text : null;
}

function describeFile(resourcePath) {
  const relative = path.relative(path.resolve(__dirname, "../../.."), resourcePath);
  return relative.startsWith("..") ? resourcePath : relative;
}

/** Every DOM tag in a file, with what the rewrite would do to it. */
function scanDomJsx(source, resourcePath, tags) {
  const file = ts.createSourceFile(
    resourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const edits = [];
  const problems = [];
  const used = new Set();
  const line = (node) => file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;

  const visit = (node) => {
    const isOpening = ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node);
    if (isOpening || ts.isJsxClosingElement(node)) {
      const tag = intrinsicTagName(node.tagName);
      if (tag !== null) {
        used.add(tag);
        if (!tags.has(tag)) {
          if (isOpening) problems.push(`<${tag}> has no Lynx host mapping (line ${line(node)})`);
        } else {
          edits.push({
            start: node.tagName.getStart(file),
            end: node.tagName.getEnd(),
            text: `${HOST_NAMESPACE}.${tag}`,
          });
          if (isOpening) {
            for (const attribute of node.attributes.properties) {
              if (!ts.isJsxAttribute(attribute) || !ts.isIdentifier(attribute.name)) continue;
              const name = attribute.name.text;
              const refusal = REFUSED_PROPS.get(name);
              if (refusal) {
                problems.push(`${name} on <${tag}>: ${refusal} (line ${line(attribute)})`);
              } else if (EVENT_PROPS.has(name)) {
                edits.push({
                  start: attribute.name.getStart(file),
                  end: attribute.name.getEnd(),
                  text: EVENT_PROPS.get(name),
                });
              } else if (/^on[A-Z]/u.test(name)) {
                problems.push(
                  `${name} on <${tag}> has no Lynx event mapping (line ${line(attribute)})`,
                );
              }
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { edits, problems, used };
}

/**
 * Rewrites the DOM tags of one upstream component to host components.
 * `tags` is the set of tag names the host module exports. Throws when the file
 * uses something the rewrite cannot express.
 */
function transformDomJsx(source, resourcePath, tags, hostModule = HOST_MODULE) {
  const { edits, problems } = scanDomJsx(source, resourcePath, tags);
  if (problems.length > 0) {
    throw new Error(
      `[lynx-dom-jsx] ${describeFile(resourcePath)} cannot be compiled for Lynx:\n` +
        problems.map((problem) => `  - ${problem}`).join("\n") +
        "\nAdd the mapping to apps/lynxtron/src/app/platform/hostDom.tsx, or replace this module with a .lynx module.",
    );
  }
  if (edits.length === 0) return source;
  let output = source;
  for (const edit of edits.toSorted((left, right) => right.start - left.start)) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  // Same line as the first statement, so reported line numbers stay upstream's.
  return `import * as ${HOST_NAMESPACE} from ${JSON.stringify(hostModule)};${output}`;
}

/** Fails when a Lynx-owned file writes a DOM tag: nothing rewrites it there. */
function assertNoDomJsx(source, resourcePath, tags) {
  const { used } = scanDomJsx(source, resourcePath, tags);
  const found = [...used].filter((tag) => tags.has(tag));
  if (found.length === 0) return;
  throw new Error(
    `[lynx-dom-jsx] ${describeFile(resourcePath)} is Lynx-owned and writes DOM tags (${found
      .map((tag) => `<${tag}>`)
      .join(", ")}). Only upstream Web components are rewritten; use Lynx host elements here.`,
  );
}

module.exports = function lynxDomJsxLoader(source) {
  if (!this.resourcePath.endsWith(".tsx") || this.resourcePath === HOST_MODULE) return source;
  this.addDependency(HOST_MODULE);
  if (isUpstreamComponent(this.resourcePath)) {
    return transformDomJsx(source, this.resourcePath, hostTags());
  }
  // Cheap pre-filter: most Lynx-owned files never mention a DOM tag name.
  const tags = hostTags();
  if ([...tags].some((tag) => source.includes(`<${tag}`))) {
    assertNoDomJsx(source, this.resourcePath, tags);
  }
  return source;
};

module.exports.assertNoDomJsx = assertNoDomJsx;
module.exports.isUpstreamComponent = isUpstreamComponent;
module.exports.readHostTags = readHostTags;
module.exports.transformDomJsx = transformDomJsx;

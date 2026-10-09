// Rspack loader for the Lynx build. The Lynx main-thread engine cannot compile
// Unicode property escapes (\p{L}, \p{Sc}, ...), which upstream's shared
// packages use. Upstream files are not edited, so the regular expression
// literals are lowered here, with regexpu-core, before the file is compiled.
const ts = require("typescript");
const rewritePattern = require("regexpu-core");

module.exports = function lynxRegexpLoader(source) {
  if (!source.includes("\\p{") && !source.includes("\\P{")) return source;
  const file = ts.createSourceFile(
    this.resourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/u.test(this.resourcePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits = [];
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.RegularExpressionLiteral) {
      const text = node.getText(file);
      const end = text.lastIndexOf("/");
      const pattern = text.slice(1, end);
      const flags = text.slice(end + 1);
      if (/\\[pP]\{/u.test(pattern)) {
        const lowered = rewritePattern(pattern, flags, {
          unicodeFlag: "transform",
          unicodePropertyEscapes: "transform",
        });
        edits.push({
          start: node.getStart(file),
          end: node.getEnd(),
          text: `/${lowered}/${flags.replace("u", "")}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  let output = source;
  for (const edit of edits.toReversed()) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return output;
};

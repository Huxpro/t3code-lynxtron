// Rspack loader for the Lynx build. The Lynx main-thread engine cannot compile
// a BigInt literal (`0n`): one anywhere in the main-thread script fails the
// whole bundle at load, before any console exists, and the window stays blank.
// Upstream's connection code writes them. Upstream files are not edited, so
// each literal becomes a `BigInt("...")` call here, which the engine compiles
// and which only runs where upstream's code does, on the background thread.
const ts = require("typescript");

/** `source` with every BigInt literal written as a `BigInt` call. */
function lowerBigIntLiterals(source, resourcePath) {
  const file = ts.createSourceFile(
    resourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    /\.[jt]sx$/u.test(resourcePath) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const edits = [];
  const visit = (node) => {
    if (node.kind === ts.SyntaxKind.BigIntLiteral) {
      const digits = node.getText(file).slice(0, -1).replaceAll("_", "");
      edits.push({
        start: node.getStart(file),
        end: node.getEnd(),
        text: `BigInt(${JSON.stringify(digits)})`,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  let output = source;
  for (const edit of edits.toReversed()) {
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
  }
  return output;
}

module.exports = function lynxBigIntLoader(source) {
  // Cheap pre-filter: a digit followed by `n` that does not continue a word.
  if (!/\dn(?![\w$])/u.test(source)) return source;
  return lowerBigIntLiterals(source, this.resourcePath);
};

module.exports.lowerBigIntLiterals = lowerBigIntLiterals;

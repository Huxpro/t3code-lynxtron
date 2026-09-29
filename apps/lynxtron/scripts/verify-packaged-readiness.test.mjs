import { assert, test } from "vite-plus/test";

import {
  clientMatchesOwnedPorts,
  collectDescendantPids,
  parseListeningPorts,
  renderedTextFromOuterHtml,
  unwrapDocumentRoot,
} from "./verify-packaged-readiness.mjs";

test("collects a PID tree without duplicating descendants", () => {
  const children = new Map([
    [10, [11, 12]],
    [11, [13]],
    [12, [13]],
  ]);
  assert.deepEqual(
    collectDescendantPids(10, (pid) => children.get(pid) ?? []),
    [10, 11, 12, 13],
  );
});

test("matches only DevTool clients listening inside the owned PID tree", () => {
  const ports = parseListeningPorts("p1\nn127.0.0.1:8904\nn*:52143\n");
  assert.deepEqual([...ports], [8904, 52143]);
  assert.equal(clientMatchesOwnedPorts({ id: "localhost:8904" }, ports), true);
  assert.equal(clientMatchesOwnedPorts({ id: "localhost:8903" }, ports), false);
});

test("unwraps direct and nested DevTool document responses", () => {
  const root = { nodeId: 1 };
  assert.equal(unwrapDocumentRoot({ root }), root);
  assert.equal(unwrapDocumentRoot({ result: { root } }), root);
  assert.equal(unwrapDocumentRoot({ result: { result: { root } } }), root);
});

test("extracts rendered Lynx text attributes from outer HTML", () => {
  assert.equal(
    renderedTextFromOuterHtml(
      '<view><text text="t3code"/><raw-text text="What &amp; why"/></view>',
    ),
    "t3code What & why",
  );
});

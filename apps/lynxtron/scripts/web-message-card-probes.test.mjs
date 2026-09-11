import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.resolve(import.meta.dirname, "../../web/src/components/chat/MessagesTimeline.tsx"),
  "utf8",
);

describe("Web message-card semantic probes", () => {
  it("exposes renderer-neutral card identities without extra render state", () => {
    assert.include(source, 'data-message-context-kind="element"');
    assert.include(source, "data-preview-annotation={props.annotation.id}");
    assert.include(source, "data-review-comment={comment.id}");
    assert.include(source, "data-review-comment-file={comment.filePath}");
    assert.include(source, "data-review-comment-range={comment.rangeLabel}");
  });
});

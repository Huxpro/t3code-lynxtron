import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, expect, it } from "vite-plus/test";

import { deriveUserMessagePresentation } from "../../../packages/client-runtime/src/presentation/userMessage.ts";
import {
  MESSAGE_CARD_PROMPT,
  prepareMessageCardProjectionFixture,
} from "./prepare-message-card-projection-fixture.mjs";

describe("message-card projection fixture", () => {
  it("drives review, preview, and element cards through the shared parser", () => {
    const presentation = deriveUserMessagePresentation(MESSAGE_CARD_PROMPT);
    expect(presentation.visibleText).toContain("<review_comment");
    expect(presentation.semanticText).toContain("src/card.tsx · Turn 1 · +5 to +7");
    expect(presentation.semanticText).toContain("Keep the shared card semantics aligned.");
    expect(presentation.previewAnnotations).toEqual([
      expect.objectContaining({
        id: "card-spacing",
        comment: "Tighten the card hierarchy.",
        styleChanges: ["Increase the content gap to 12px."],
      }),
    ]);
    expect(presentation.elementContexts).toEqual([
      { header: "<CardBody> (src/card.tsx:5)", body: "selector: [data-card-body]" },
    ]);
  });

  it("labels direct projection and pins dark Native preferences", () => {
    const source = readFileSync(
      path.join(import.meta.dirname, "prepare-message-card-projection-fixture.mjs"),
      "utf8",
    );
    assert.include(source, 'kind: "direct-projection-message-card-fixture"');
    assert.include(source, "backendBehaviorClaimed: false");
    assert.include(source, "interactionClaimed: false");
    assert.include(source, 'themePreference: "dark"');
    assert.isFunction(prepareMessageCardProjectionFixture);
  });
});

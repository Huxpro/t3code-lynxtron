import { describe, expect, it } from "vite-plus/test";

import { deriveUserMessagePresentation } from "../../../packages/lynx-logic/src/userMessage.ts";
import { MESSAGE_CARD_PROMPT } from "./prepare-message-card-fixture.mjs";

describe("message-card fixture", () => {
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
});

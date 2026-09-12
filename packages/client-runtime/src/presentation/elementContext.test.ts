import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  addComposerElementContext,
  appendElementContextsToPrompt,
  formatElementContextLabel,
  formatElementContextSourceLabel,
  normalizeComposerElementContextsByScopeKey,
  removeComposerElementContext,
  type ElementContextDraft,
} from "./elementContext.ts";

function context(overrides: Partial<ElementContextDraft> = {}): ElementContextDraft {
  return {
    id: "element-1",
    threadId: ThreadId.make("thread-1"),
    pickedAt: "2026-09-12T00:00:00.000Z",
    pageUrl: "https://example.com/dashboard",
    pageTitle: "Dashboard",
    tagName: "button",
    selector: "button.submit",
    htmlPreview: '<button class="submit">Save</button>',
    componentName: "SubmitButton",
    source: {
      functionName: "SubmitButton",
      fileName: "/repo/src/Button.tsx",
      lineNumber: 12,
      columnNumber: 5,
    },
    styles: ".submit { color: white; }",
    ...overrides,
  };
}

describe("element context presentation", () => {
  it("formats the canonical component and source labels", () => {
    expect(formatElementContextLabel(context())).toBe("<SubmitButton>");
    expect(formatElementContextSourceLabel(context())).toBe("Button.tsx:12");
  });

  it("serializes the canonical element context block", () => {
    expect(appendElementContextsToPrompt("Inspect this", [context()])).toContain(
      "Inspect this\n\n<element_context>\n- <SubmitButton> (Button.tsx:12):",
    );
  });

  it("strictly restores scoped contexts and deduplicates by element identity", () => {
    const duplicate = context({ id: "newer", htmlPreview: "newer" });
    expect(
      normalizeComposerElementContextsByScopeKey({
        "project:project-1": [context(), duplicate],
        invalid: [context()],
        "thread:broken": [{ ...context(), pageTitle: 42 }],
      }),
    ).toEqual({ "project:project-1": [duplicate] });
  });

  it("adds and removes a scoped context without touching siblings", () => {
    const first = context();
    const second = context({ id: "element-2", selector: "button.cancel" });
    const added = addComposerElementContext(
      { "project:other": [first] },
      "thread:thread-1",
      second,
    );
    expect(added["project:other"]).toEqual([first]);
    expect(added["thread:thread-1"]).toEqual([second]);
    expect(removeComposerElementContext(added, "thread:thread-1", second.id)).toEqual({
      "project:other": [first],
    });
  });

  it("rejects duplicate element identities without replacing the original", () => {
    const first = context();
    const initial = { "thread:thread-1": [first] };
    expect(
      addComposerElementContext(
        initial,
        "thread:thread-1",
        context({ id: "newer", htmlPreview: "newer" }),
      ),
    ).toBe(initial);
  });
});

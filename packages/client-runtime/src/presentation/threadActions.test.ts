import { describe, expect, it } from "vite-plus/test";

import {
  formatThreadActionConfirmationMessage,
  projectThreadActionConfirmation,
} from "./threadActions.ts";

describe("thread action confirmation presentation", () => {
  it("projects the canonical delete warning", () => {
    const presentation = projectThreadActionConfirmation({
      action: "delete",
      threadTitle: "Composer parity",
    });
    expect(presentation).toEqual({
      action: "delete",
      title: 'Delete thread "Composer parity"?',
      description: "This permanently clears conversation history for this thread.",
      confirmLabel: "Delete",
      destructive: true,
    });
    expect(formatThreadActionConfirmationMessage(presentation)).toBe(
      'Delete thread "Composer parity"?\n' +
        "This permanently clears conversation history for this thread.",
    );
  });

  it("projects archive and empty-title fallbacks without destructive copy", () => {
    const presentation = projectThreadActionConfirmation({
      action: "archive",
      threadTitle: " ",
    });
    expect(presentation).toEqual({
      action: "archive",
      title: 'Archive thread "this thread"?',
      description: null,
      confirmLabel: "Archive",
      destructive: false,
    });
    expect(formatThreadActionConfirmationMessage(presentation)).toBe(
      'Archive thread "this thread"?',
    );
  });
});

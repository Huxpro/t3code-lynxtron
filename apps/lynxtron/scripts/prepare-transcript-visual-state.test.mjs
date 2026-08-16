import { readFileSync } from "node:fs";
import path from "node:path";

import { assert, describe, it } from "vite-plus/test";

const source = readFileSync(
  path.join(import.meta.dirname, "prepare-transcript-visual-state.mjs"),
  "utf8",
);

describe("transcript visual-state preparation", () => {
  it("waits for a real completed turn and assistant message", () => {
    assert.include(source, 'settleMode !== "completed" &&');
    assert.include(source, 'settleMode !== "failed"');
    assert.include(source, 'state === "completed"');
    assert.include(source, 'message.role === "assistant"');
    assert.include(source, "message.text.trim().length > 0");
    assert.include(source, 'payload?.sessionStatus === "error"');
    assert.include(source, 'errorState: "session-error"');
    assert.include(source, "const settledResult = await settledPayloadPromise");
    assert.include(source, "if (expectedAssistantText && assistantText !== expectedAssistantText)");
    assert.include(source, 'argumentValue("--expect-assistant")');
  });

  it("interrupts only the legacy scroll-depth fixture mode", () => {
    assert.include(source, 'if (settleMode === "interrupted")');
    assert.include(source, "await connector.interrupt({ threadId })");
    assert.include(source, 'const settleMode = argumentValue("--settle-mode") ?? "interrupted"');
    assert.include(source, "settleMode,");
  });

  it("accepts an explicit model selection for deterministic provider setup", () => {
    assert.include(source, "await connector.setModelSelection({ selection: modelSelection })");
    assert.include(source, 'argumentValue("--instance-id")');
    assert.include(source, 'argumentValue("--model")');
  });

  it("admits failed fixtures only with matching turn, session, and persisted error state", () => {
    assert.include(source, 'settleMode === "failed"');
    assert.include(source, 'payload?.sessionStatus === "error"');
    assert.include(source, 'state === "error"');
    assert.include(source, "SELECT last_error AS lastError");
    assert.include(source, "Failed transcript fixture has no persisted session error.");
  });

  it("declares the created transcript as the canonical Sidebar fixture", () => {
    assert.include(source, "SELECT title FROM projection_threads WHERE thread_id = ?");
    assert.include(source, "Transcript fixture has no persisted thread title.");
    assert.include(source, "title: persistedTitle");
    assert.include(source, "sidebarFixture: {");
    assert.include(source, "titles: [fixture.title]");
  });
});

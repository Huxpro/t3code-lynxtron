import { describe, expect, it } from "vite-plus/test";

import {
  appendComposerText,
  onComposerTextInsertion,
  requestComposerTextInsertion,
} from "./composerCommandBus";

describe("composerCommandBus", () => {
  it("adds one boundary before externally inserted text", () => {
    expect(appendComposerText("", "[README.md](README.md) ")).toBe("[README.md](README.md) ");
    expect(appendComposerText("Review", "[README.md](README.md) ")).toBe(
      "Review [README.md](README.md) ",
    );
    expect(appendComposerText("Review ", "[README.md](README.md) ")).toBe(
      "Review [README.md](README.md) ",
    );
  });

  it("routes to the mounted composer and removes only that subscription", () => {
    const received: string[] = [];
    const dispose = onComposerTextInsertion((text) => {
      received.push(text);
      return true;
    });

    expect(requestComposerTextInsertion("[README.md](README.md) ")).toBe(true);
    expect(received).toEqual(["[README.md](README.md) "]);
    dispose();
    expect(requestComposerTextInsertion("ignored")).toBe(false);
  });
});

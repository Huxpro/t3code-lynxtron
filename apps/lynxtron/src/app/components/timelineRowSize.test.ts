import { describe, expect, it } from "vite-plus/test";

import { timelineRowReuseIdentifier } from "./timelineRowSize";

describe("timelineRowReuseIdentifier", () => {
  it("separates expandable checkpoint messages from plain assistant messages", () => {
    expect(
      timelineRowReuseIdentifier({
        kind: "message",
        role: "assistant",
        hasCheckpoint: true,
      }),
    ).toBe("message:assistant:checkpoint");
    expect(
      timelineRowReuseIdentifier({
        kind: "message",
        role: "assistant",
        hasCheckpoint: false,
      }),
    ).toBe("message:assistant");
  });

  it("keeps other transcript templates in stable reuse pools", () => {
    expect(
      timelineRowReuseIdentifier({ kind: "message", role: "user", hasCheckpoint: false }),
    ).toBe("message:user");
    expect(timelineRowReuseIdentifier({ kind: "work" })).toBe("work");
    expect(timelineRowReuseIdentifier({ kind: "working" })).toBe("working");
  });
});

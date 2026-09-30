import { describe, expect, it } from "vite-plus/test";

import { resolveNativeTimelineScrollUpdate, timelineRowReuseIdentifier } from "./timelineRowSize";

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
    expect(timelineRowReuseIdentifier({ kind: "work-live" })).toBe("work-live");
  });

  it("keeps one-line tool rows out of the multi-line work pools", () => {
    expect(timelineRowReuseIdentifier({ kind: "work", grouped: true })).toBe("work:grouped");
    expect(timelineRowReuseIdentifier({ kind: "work-toggle", summary: true })).toBe(
      "work-toggle:summary",
    );
    expect(timelineRowReuseIdentifier({ kind: "work-toggle", summary: false })).toBe("work-toggle");
    expect(timelineRowReuseIdentifier({ kind: "working", thinking: true })).toBe(
      "working:thinking",
    );
  });
});

describe("resolveNativeTimelineScrollUpdate", () => {
  it("detaches for a real user wheel away from the end", () => {
    expect(
      resolveNativeTimelineScrollUpdate({
        mode: "following-end",
        eventSource: 2,
        userScrollEventSource: 2,
        atEnd: false,
        contentFits: false,
        jumpToLatestInFlight: false,
      }),
    ).toEqual({ mode: "free-scrolling", clearAnchor: true, jumpToLatestInFlight: false });
  });

  it("does not reinterpret smooth jump frames as a fresh user scroll away", () => {
    expect(
      resolveNativeTimelineScrollUpdate({
        mode: "following-end",
        eventSource: 2,
        userScrollEventSource: 2,
        atEnd: false,
        contentFits: false,
        jumpToLatestInFlight: true,
      }),
    ).toEqual({ mode: "following-end", clearAnchor: false, jumpToLatestInFlight: true });
  });

  it("finishes a jump only after the list reaches the end", () => {
    expect(
      resolveNativeTimelineScrollUpdate({
        mode: "following-end",
        eventSource: 2,
        userScrollEventSource: 2,
        atEnd: true,
        contentFits: false,
        jumpToLatestInFlight: true,
      }),
    ).toEqual({ mode: "following-end", clearAnchor: false, jumpToLatestInFlight: false });
  });
});

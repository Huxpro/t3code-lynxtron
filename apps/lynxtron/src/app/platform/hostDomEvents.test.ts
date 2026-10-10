import { describe, expect, it } from "vite-plus/test";

import { type DomKeyEvent, domKeyEvent, hostKeyHandler } from "./hostDomEvents";

describe("domKeyEvent", () => {
  it("carries the key, repeat and modifiers of the Lynx event", () => {
    const event = domKeyEvent({
      key: "Enter",
      repeat: true,
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: true,
      timestamp: 12,
    });
    expect({ ...event, preventDefault: undefined, stopPropagation: undefined }).toEqual({
      key: "Enter",
      repeat: true,
      altKey: false,
      ctrlKey: false,
      metaKey: true,
      shiftKey: true,
      preventDefault: undefined,
      stopPropagation: undefined,
    });
  });

  it("reads a modifier the host did not forward as not pressed", () => {
    expect(domKeyEvent({ key: "a" }).shiftKey).toBe(false);
  });

  it("lets a handler call preventDefault and refuses stopPropagation by name", () => {
    const event = domKeyEvent({ key: " " });
    expect(() => event.preventDefault()).not.toThrow();
    expect(() => event.stopPropagation()).toThrow(/KeyboardEvent\.stopPropagation/u);
  });

  it("rejects something that is not a key event", () => {
    expect(() => domKeyEvent(undefined)).toThrow(/without a key/u);
    expect(() => domKeyEvent({})).toThrow(/without a key/u);
  });
});

describe("hostKeyHandler", () => {
  it("runs upstream's handler the way toast's expandable header uses it", () => {
    let toggled = 0;
    const onKeyDown = (event: DomKeyEvent) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggled += 1;
      }
    };
    const handler = hostKeyHandler(onKeyDown);
    handler({ key: "Enter" });
    handler({ key: "Escape" });
    handler({ key: " " });
    expect(toggled).toBe(2);
  });
});

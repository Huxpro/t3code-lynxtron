import { describe, expect, it } from "vite-plus/test";

import { textClassName } from "./hostDomClasses";

describe("textClassName", () => {
  it("keeps upstream kbd's weight, family, colour and size and drops its box classes", () => {
    expect(
      textClassName(
        "pointer-events-none inline-flex h-5 min-w-5 select-none items-center justify-center gap-1 rounded bg-muted px-1 font-medium font-sans text-muted-foreground text-xs [&_svg:not([class*='size-'])]:size-3",
      ),
    ).toBe("font-medium font-sans text-muted-foreground text-xs");
  });

  it("keeps alignment, leading, tracking and truncation", () => {
    expect(
      textClassName(
        "flex min-w-0 text-right leading-5 -tracking-wide truncate whitespace-nowrap line-clamp-2 overflow-hidden",
      ),
    ).toBe("text-right leading-5 -tracking-wide truncate whitespace-nowrap line-clamp-2");
  });

  it("keeps arbitrary values, size/leading shorthands, opacity and important marks", () => {
    expect(
      textClassName("text-[13px] text-base/4.5 text-foreground/70 !font-bold leading-[1.2]!"),
    ).toBe("text-[13px] text-base/4.5 text-foreground/70 !font-bold leading-[1.2]!");
  });

  it("keeps a class behind a media, theme, container or ancestor-state variant", () => {
    expect(
      textClassName(
        "sm:text-sm dark:text-white max-[760px]:text-xs @[15rem]/header:font-medium group-hover:text-foreground group-data-[state=open]/row:font-bold in-data-[slot=menu]:text-xs",
      ),
    ).toBe(
      "sm:text-sm dark:text-white max-[760px]:text-xs @[15rem]/header:font-medium group-hover:text-foreground group-data-[state=open]/row:font-bold in-data-[slot=menu]:text-xs",
    );
  });

  it("leaves a class that depends on the box's own state on the box", () => {
    expect(
      textClassName(
        "hover:text-foreground focus-visible:font-bold data-[active=true]:text-primary aria-disabled:text-muted-foreground md:hover:text-xs [&>span]:text-xs",
      ),
    ).toBe("");
  });

  it("does not take a box utility that merely contains a text utility's name", () => {
    expect(textClassName("context-menu fontish mt-text-2 [text-box:trim-both] decoration-2")).toBe(
      "",
    );
  });

  it("answers the empty string for a missing or non-string class", () => {
    expect(textClassName(undefined)).toBe("");
    expect(textClassName("")).toBe("");
    expect(textClassName(42)).toBe("");
  });
});

import { describe, expect, it } from "vite-plus/test";

import { mergeProps } from "./merge-props";

describe("Lynx mergeProps", () => {
  it("lets a later set win and keeps props it does not define", () => {
    expect(
      mergeProps({ "data-slot": "label", id: "a" }, { id: "b", title: undefined }, undefined),
    ).toEqual({ "data-slot": "label", id: "b", title: undefined });
    expect(mergeProps({ id: "a" }, { id: undefined })).toEqual({ id: "a" });
  });

  it("joins class names and merges style objects", () => {
    expect(
      mergeProps(
        { className: "font-medium", style: { color: "red", width: 1 } },
        { className: "mt-2", style: { color: "blue" } },
      ),
    ).toEqual({ className: "mt-2 font-medium", style: { color: "blue", width: 1 } });
  });

  it("runs every handler of the same name, the later one first", () => {
    const calls: Array<string> = [];
    const merged = mergeProps(
      { onClick: () => calls.push("default"), bindtap: () => calls.push("default tap") },
      { onClick: () => calls.push("caller") },
    );
    (merged.onClick as () => void)();
    (merged.bindtap as () => void)();
    expect(calls).toEqual(["caller", "default", "default tap"]);
  });
});

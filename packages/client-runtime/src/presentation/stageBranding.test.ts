import { describe, expect, it } from "vite-plus/test";

import { projectEnvironmentIdentification } from "./stageBranding.ts";

describe("environment identification presentation", () => {
  it.each([
    ["Dev", "artwork", { backdropVariant: "dev", pillLabel: null }],
    ["Nightly", "artwork", { backdropVariant: "nightly", pillLabel: null }],
    ["Dev", "pill", { backdropVariant: null, pillLabel: "Dev" }],
    ["Nightly", "pill", { backdropVariant: null, pillLabel: "Nightly" }],
    ["Dev", "none", { backdropVariant: null, pillLabel: null }],
    ["Alpha", "artwork", { backdropVariant: null, pillLabel: null }],
    ["Latest", "pill", { backdropVariant: null, pillLabel: null }],
  ] as const)("projects %s in %s mode", (stageLabel, mode, expected) => {
    expect(projectEnvironmentIdentification({ stageLabel, mode })).toEqual(expected);
  });
});

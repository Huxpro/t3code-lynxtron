import { describe, expect, it } from "vite-plus/test";

import { shouldReportVcsStatusReadFailure } from "./vcsStatusProjection.logic";

describe("shouldReportVcsStatusReadFailure", () => {
  it("reports online failures but not expected disconnect cancellation", () => {
    expect(shouldReportVcsStatusReadFailure("ready")).toBe(true);
    expect(shouldReportVcsStatusReadFailure("error")).toBe(false);
    expect(shouldReportVcsStatusReadFailure("reconnecting")).toBe(false);
    expect(shouldReportVcsStatusReadFailure("connecting")).toBe(false);
    expect(shouldReportVcsStatusReadFailure("starting-server")).toBe(false);
    expect(shouldReportVcsStatusReadFailure("idle")).toBe(false);
  });
});

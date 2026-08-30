import { describe, expect, it } from "vite-plus/test";

import {
  formatElapsedDurationLabel,
  formatExpiresInLabel,
  formatShortTimestamp,
  formatTimestamp,
  getTimestampFormatOptions,
  formatRelativeTimeLabel,
  formatRelativeTimeUntilLabel,
  getRelativeTimeState,
} from "./time.ts";

const NOW = Date.parse("2026-04-07T12:00:00.000Z");

describe("shared time presentation", () => {
  it("formats renderer-neutral chat timestamps", () => {
    expect(getTimestampFormatOptions("12-hour", false)).toMatchObject({ hour12: true });
    expect(getTimestampFormatOptions("24-hour", true)).toMatchObject({
      hour12: false,
      second: "2-digit",
    });
    expect(formatShortTimestamp("not-a-date", "locale")).toBe("");
    expect(formatTimestamp("not-a-date", "locale")).toBe("");
  });

  it("formats relative history labels used by Web and Lynx", () => {
    expect(formatRelativeTimeLabel("2026-04-07T12:00:00.000Z", NOW)).toBe("just now");
    expect(formatRelativeTimeLabel("2026-04-07T11:45:00.000Z", NOW)).toBe("15m ago");
    expect(formatRelativeTimeLabel("2026-04-05T12:00:00.000Z", NOW)).toBe("2d ago");
  });

  it("distinguishes missing and invalid timestamps", () => {
    expect(getRelativeTimeState(null, NOW)).toEqual({ status: "missing" });
    expect(getRelativeTimeState("not-a-date", NOW)).toEqual({ status: "invalid" });
    expect(formatRelativeTimeLabel("not-a-date", NOW)).toBe("");
  });

  it("formats elapsed and future labels from the same clock snapshot", () => {
    expect(formatElapsedDurationLabel("2026-04-07T11:45:00.000Z", NOW)).toBe("15m");
    expect(formatRelativeTimeUntilLabel("2026-04-07T12:15:00.000Z", NOW)).toBe("15m left");
    expect(formatExpiresInLabel("2026-04-07T12:04:12.000Z", NOW)).toBe("Expires in 4m 12s");
  });
});

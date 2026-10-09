import { describe, expect, it } from "vite-plus/test";

import { formatDayAwareTimestamp, formatShortTimestamp } from "./time.ts";

describe("formatDayAwareTimestamp", () => {
  // Local-time instants keep the calendar-day boundaries stable in any timezone.
  const iso = (y: number, monthIndex: number, d: number, h: number, mi: number) =>
    new Date(y, monthIndex, d, h, mi).toISOString();
  const now = new Date(2026, 7, 14, 12, 0).getTime();
  const time = (isoDate: string) => formatShortTimestamp(isoDate, "12-hour");
  const date = (isoDate: string, withYear: boolean) =>
    new Intl.DateTimeFormat(undefined, {
      month: "numeric",
      day: "numeric",
      ...(withYear ? { year: "numeric" } : {}),
    }).format(new Date(isoDate));

  it("shows only the time for today", () => {
    const messageAt = iso(2026, 7, 14, 9, 30);
    expect(formatDayAwareTimestamp(messageAt, "12-hour", now)).toBe(time(messageAt));
  });

  it("labels the previous calendar day as yesterday", () => {
    const messageAt = iso(2026, 7, 13, 23, 30);
    const justPastMidnight = new Date(2026, 7, 14, 0, 30).getTime();
    expect(formatDayAwareTimestamp(messageAt, "12-hour", justPastMidnight)).toBe(
      `yesterday at ${time(messageAt)}`,
    );
  });

  it("adds the numeric date, and the year once it differs", () => {
    const sameYear = iso(2026, 7, 12, 12, 34);
    expect(formatDayAwareTimestamp(sameYear, "12-hour", now)).toBe(
      `${date(sameYear, false)} ${time(sameYear)}`,
    );
    const lastYear = iso(2025, 11, 31, 18, 0);
    expect(formatDayAwareTimestamp(lastYear, "12-hour", now)).toBe(
      `${date(lastYear, true)} ${time(lastYear)}`,
    );
  });

  it("returns an empty label for an invalid instant", () => {
    expect(formatDayAwareTimestamp("not a date", "12-hour", now)).toBe("");
  });
});

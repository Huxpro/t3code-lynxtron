import { type TimestampFormat } from "@t3tools/contracts/settings";
import {
  formatElapsedDurationLabel as formatElapsedDurationLabelAt,
  formatExpiresInLabel as formatExpiresInLabelAt,
  formatRelativeTime as formatRelativeTimeAt,
  formatRelativeTimeLabel as formatRelativeTimeLabelAt,
  formatRelativeTimeUntil as formatRelativeTimeUntilAt,
  formatRelativeTimeUntilLabel as formatRelativeTimeUntilLabelAt,
  getRelativeTimeState as getRelativeTimeStateAt,
  type RelativeTimeParts,
  type RelativeTimeState,
} from "@t3tools/client-runtime/presentation/time";

export type { RelativeTimeParts, RelativeTimeState };

export function getTimestampFormatOptions(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormatOptions {
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  };

  if (timestampFormat === "locale") {
    return baseOptions;
  }

  return {
    ...baseOptions,
    hour12: timestampFormat === "12-hour",
  };
}

const timestampFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTimestampFormatter(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormat {
  const cacheKey = `${timestampFormat}:${includeSeconds ? "seconds" : "minutes"}`;
  const cachedFormatter = timestampFormatterCache.get(cacheKey);
  if (cachedFormatter) {
    return cachedFormatter;
  }

  const formatter = new Intl.DateTimeFormat(
    undefined,
    getTimestampFormatOptions(timestampFormat, includeSeconds),
  );
  timestampFormatterCache.set(cacheKey, formatter);
  return formatter;
}

export function parseTimestampDate(isoDate: string): Date | null {
  const date = new Date(isoDate);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  return getTimestampFormatter(timestampFormat, true).format(date);
}

const monthNameFormatter = new Intl.DateTimeFormat(undefined, { month: "long" });

function ordinalSuffix(day: number): string {
  const lastTwo = day % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return "th";
  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

/**
 * Long-form tooltip label, e.g. `12:04, 4th June`.
 * Renders the wall-clock time without seconds followed by the ordinal day and month name.
 */
export function formatChatTimestampTooltip(
  isoDate: string,
  timestampFormat: TimestampFormat,
): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  const time = formatShortTimestamp(isoDate, timestampFormat);
  const day = date.getDate();
  const month = monthNameFormatter.format(date);
  const year = date.getFullYear();
  return `${time}, ${day}${ordinalSuffix(day)} ${month} ${year}`;
}

export function formatShortTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  const date = parseTimestampDate(isoDate);
  if (!date) return "";
  return getTimestampFormatter(timestampFormat, false).format(date);
}

export function formatRelativeTime(isoDate: string): RelativeTimeParts | null {
  return formatRelativeTimeAt(isoDate, Date.now());
}

export function formatRelativeTimeLabel(isoDate: string): string {
  return formatRelativeTimeLabelAt(isoDate, Date.now());
}

export function getRelativeTimeState(isoDate: string | null): RelativeTimeState {
  return getRelativeTimeStateAt(isoDate, Date.now());
}

export function formatElapsedDurationLabel(isoDate: string, nowMs: number = Date.now()): string {
  return formatElapsedDurationLabelAt(isoDate, nowMs);
}

export function formatRelativeTimeUntil(isoDate: string): RelativeTimeParts | null {
  return formatRelativeTimeUntilAt(isoDate, Date.now());
}

export function formatRelativeTimeUntilLabel(isoDate: string): string {
  return formatRelativeTimeUntilLabelAt(isoDate, Date.now());
}

export function formatExpiresInLabel(isoDate: string, nowMs: number = Date.now()): string {
  return formatExpiresInLabelAt(isoDate, nowMs);
}

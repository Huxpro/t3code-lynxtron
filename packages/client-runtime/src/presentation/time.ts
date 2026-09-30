import type { TimestampFormat } from "@t3tools/contracts/settings";

export interface RelativeTimeParts {
  readonly value: string;
  readonly suffix: string | null;
}

export function getTimestampFormatOptions(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormatOptions {
  const baseOptions: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    ...(includeSeconds ? { second: "2-digit" } : {}),
  };

  if (timestampFormat === "locale") return baseOptions;
  return { ...baseOptions, hour12: timestampFormat === "12-hour" };
}

const timestampFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getTimestampFormatter(
  timestampFormat: TimestampFormat,
  includeSeconds: boolean,
): Intl.DateTimeFormat {
  const cacheKey = `${timestampFormat}:${includeSeconds ? "seconds" : "minutes"}`;
  const cachedFormatter = timestampFormatterCache.get(cacheKey);
  if (cachedFormatter) return cachedFormatter;

  const formatter = new Intl.DateTimeFormat(
    undefined,
    getTimestampFormatOptions(timestampFormat, includeSeconds),
  );
  timestampFormatterCache.set(cacheKey, formatter);
  return formatter;
}

export function formatTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  const timestampMs = Date.parse(isoDate);
  if (Number.isNaN(timestampMs)) return "";
  return getTimestampFormatter(timestampFormat, true).format(timestampMs);
}

export function formatShortTimestamp(isoDate: string, timestampFormat: TimestampFormat): string {
  const timestampMs = Date.parse(isoDate);
  if (Number.isNaN(timestampMs)) return "";
  return getTimestampFormatter(timestampFormat, false).format(timestampMs);
}

export type RelativeTimeState =
  | { readonly status: "missing" }
  | { readonly status: "invalid" }
  | {
      readonly status: "relative";
      readonly value: string;
      readonly suffix: string | null;
    };

function parseTimestampMs(isoDate: string): number | null {
  const timestampMs = Date.parse(isoDate);
  return Number.isNaN(timestampMs) ? null : timestampMs;
}

export function formatRelativeTime(isoDate: string, nowMs: number): RelativeTimeParts | null {
  const timestampMs = parseTimestampMs(isoDate);
  if (timestampMs === null) return null;
  const diffMs = nowMs - timestampMs;
  if (diffMs < 0) return { value: "just now", suffix: null };
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return { value: "just now", suffix: null };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { value: `${minutes}m`, suffix: "ago" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { value: `${hours}h`, suffix: "ago" };
  return { value: `${Math.floor(hours / 24)}d`, suffix: "ago" };
}

export function formatRelativeTimeLabel(isoDate: string, nowMs: number): string {
  const relative = formatRelativeTime(isoDate, nowMs);
  if (!relative) return "";
  return relative.suffix ? `${relative.value} ${relative.suffix}` : relative.value;
}

export function getRelativeTimeState(isoDate: string | null, nowMs: number): RelativeTimeState {
  if (!isoDate) return { status: "missing" };
  const relative = formatRelativeTime(isoDate, nowMs);
  if (!relative) return { status: "invalid" };
  return { status: "relative", ...relative };
}

export function formatElapsedDurationLabel(isoDate: string, nowMs: number): string {
  const timestampMs = parseTimestampMs(isoDate);
  if (timestampMs === null) return "";
  const diffMs = nowMs - timestampMs;
  if (diffMs <= 0) return "just now";

  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return "just now";
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  return `${Math.floor(hours / 24)}d`;
}

export function formatRelativeTimeUntil(isoDate: string, nowMs: number): RelativeTimeParts | null {
  const timestampMs = parseTimestampMs(isoDate);
  if (timestampMs === null) return null;
  const diffMs = timestampMs - nowMs;
  if (diffMs <= 0) return { value: "Expired", suffix: null };
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 5) return { value: "Soon", suffix: null };
  if (seconds < 60) return { value: `${seconds}s`, suffix: "left" };
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return { value: `${minutes}m`, suffix: "left" };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { value: `${hours}h`, suffix: "left" };
  return { value: `${Math.floor(hours / 24)}d`, suffix: "left" };
}

export function formatRelativeTimeUntilLabel(isoDate: string, nowMs: number): string {
  const relative = formatRelativeTimeUntil(isoDate, nowMs);
  if (!relative) return "";
  return relative.suffix ? `${relative.value} ${relative.suffix}` : relative.value;
}

export function formatExpiresInLabel(isoDate: string, nowMs: number): string {
  const timestampMs = parseTimestampMs(isoDate);
  if (timestampMs === null) return "";
  const diffMs = timestampMs - nowMs;
  if (diffMs <= 0) return "Expired";

  const totalSeconds = Math.floor(diffMs / 1000);
  if (totalSeconds < 5) return "Expires in a moment";
  if (totalSeconds < 60) return `Expires in ${totalSeconds}s`;

  if (totalSeconds < 3600) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return seconds === 0 ? `Expires in ${minutes}m` : `Expires in ${minutes}m ${seconds}s`;
  }

  if (totalSeconds < 86_400) {
    const hours = Math.floor(totalSeconds / 3600);
    const rem = totalSeconds % 3600;
    const minutes = Math.floor(rem / 60);
    const seconds = rem % 60;
    const parts = [`${hours}h`];
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);
    return `Expires in ${parts.join(" ")}`;
  }

  const days = Math.floor(totalSeconds / 86_400);
  const remAfterDays = totalSeconds % 86_400;
  if (remAfterDays === 0) return `Expires in ${days}d`;
  const hours = Math.floor(remAfterDays / 3600);
  const rem = remAfterDays % 3600;
  const minutes = Math.floor(rem / 60);
  const seconds = rem % 60;
  const tail: string[] = [];
  if (hours > 0) tail.push(`${hours}h`);
  if (minutes > 0) tail.push(`${minutes}m`);
  if (seconds > 0) tail.push(`${seconds}s`);
  return tail.length > 0 ? `Expires in ${days}d ${tail.join(" ")}` : `Expires in ${days}d`;
}

const numericDateFormatters = new Map<string, Intl.DateTimeFormat>();

function numericDateFormatter(locale: string | undefined, withYear: boolean): Intl.DateTimeFormat {
  const cacheKey = `${locale ?? ""}:${withYear ? "year" : "day"}`;
  const cached = numericDateFormatters.get(cacheKey);
  if (cached) return cached;
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "numeric",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
  numericDateFormatters.set(cacheKey, formatter);
  return formatter;
}

/**
 * Chat timestamp that adds the date once the message is no longer from today:
 * today `12:34 PM`, yesterday `yesterday at 12:34 PM`, older `8/13 12:34 PM`
 * (locale digit order), with the year included once the calendar year differs.
 * Boundaries are local calendar days, not 24-hour windows.
 */
export function formatDayAwareTimestamp(
  isoDate: string,
  timestampFormat: TimestampFormat,
  nowMs: number = Date.now(),
  options: {
    readonly locale?: string;
    readonly formatTime?: (date: Date) => string;
  } = {},
): string {
  const date = new Date(isoDate);
  if (Number.isNaN(date.getTime())) return "";
  const time =
    options.formatTime?.(date) ?? getTimestampFormatter(timestampFormat, false).format(date);

  const now = new Date(nowMs);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfMessageDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  // Round so DST-shifted 23/25 hour days still count as whole days.
  const dayDiff = Math.round((startOfToday - startOfMessageDay) / 86_400_000);

  if (dayDiff <= 0) return time;
  if (dayDiff === 1) return `yesterday at ${time}`;
  const dateFormatter = numericDateFormatter(
    options.locale,
    date.getFullYear() !== now.getFullYear(),
  );
  return `${dateFormatter.format(date)} ${time}`;
}

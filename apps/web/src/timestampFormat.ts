import { type TimestampFormat } from "@t3tools/contracts/settings";
import {
  formatDayAwareTimestamp as formatDayAwareTimestampShared,
  formatElapsedDurationLabel as formatElapsedDurationLabelAt,
  formatExpiresInLabel as formatExpiresInLabelAt,
  getTimestampFormatOptions as getTimestampFormatOptionsShared,
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
  return getTimestampFormatOptionsShared(timestampFormat, includeSeconds);
}

/**
 * Pick the locale to format wall-clock times in, given the locale the host
 * reports. Hosts that report nothing fall back to `undefined`, which is the
 * runtime default and the right answer in a browser.
 *
 * A host reports a locale only when it knows better than the runtime does —
 * see `getSystemLocale` on the desktop bridge for why desktop does.
 */
export function resolveTimestampLocale(
  systemLocale: string | null | undefined,
): string | undefined {
  const tag = systemLocale?.trim();
  if (!tag) return undefined;

  try {
    // Every timestamp in the UI runs through this formatter, so a tag the host
    // could not normalize falls back rather than throwing. Throws on a
    // structurally invalid tag; a well-formed tag ICU has no data for resolves
    // here and is left to ICU's own fallback.
    Intl.DateTimeFormat.supportedLocalesOf([tag]);
    return tag;
  } catch {
    return undefined;
  }
}

function readHostSystemLocale(): string | null {
  if (typeof window === "undefined") return null;
  return window.desktopBridge?.getSystemLocale?.() ?? null;
}

const timestampLocale = resolveTimestampLocale(readHostSystemLocale());

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
    timestampLocale,
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

// Deliberately not the host locale: the tooltip's ordinal suffix and
// day-before-month order below are English, so a localized month alone would
// read "4th Juni 2026". Localizing the whole label is a separate change.
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

/**
 * Chat timestamp that adds the date once the message is no longer from today:
 * today `12:34 PM`, yesterday `yesterday at 12:34 PM`, older `8/13 12:34 PM`
 * (locale digit order), with the year included once the calendar year differs.
 * The day rule is shared with Lynx through client-runtime.
 */
export function formatDayAwareTimestamp(
  isoDate: string,
  timestampFormat: TimestampFormat,
  nowMs: number = Date.now(),
): string {
  return formatDayAwareTimestampShared(isoDate, timestampFormat, nowMs, {
    locale: timestampLocale,
    formatTime: (date) => getTimestampFormatter(timestampFormat, false).format(date),
  });
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

import { formatRelativeTimeLabel as formatRelativeTimeLabelAt } from "@t3tools/lynx-logic/time";

export function formatRelativeTimeLabel(isoDate: string): string {
  return formatRelativeTimeLabelAt(isoDate, Date.now());
}

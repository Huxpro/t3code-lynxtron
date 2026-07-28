import { formatRelativeTimeLabel as formatRelativeTimeLabelAt } from "@t3tools/client-runtime/presentation/time";

export function formatRelativeTimeLabel(isoDate: string): string {
  return formatRelativeTimeLabelAt(isoDate, Date.now());
}

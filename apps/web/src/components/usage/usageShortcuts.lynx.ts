/**
 * Upstream's module reads the DOM event target and takes a type from the
 * Usage chart component. Lynx has neither; the option tables are the same.
 */
import type { KeybindingCommand, ResolvedKeybindingsConfig } from "@t3tools/contracts";

import { resolveShortcutCommand, type ShortcutEventLike } from "../../keybindings";

export type UsageMetric = "cost" | "tokens" | "limits";
export const METRIC_OPTIONS = [
  { value: "cost", label: "Cost", command: "usage.cost" },
  { value: "tokens", label: "Tokens", command: "usage.tokens" },
  { value: "limits", label: "Limits", command: "usage.limits" },
] as const satisfies readonly { value: UsageMetric; label: string; command: KeybindingCommand }[];

export const WINDOW_OPTIONS = [
  { days: 1, label: "Past 24h", command: "usage.period.day" },
  { days: 7, label: "7 days", command: "usage.period.week" },
  { days: 30, label: "30 days", command: "usage.period.month" },
  { days: 90, label: "90 days", command: "usage.period.quarter" },
] as const;

/** Lynx key events carry no DOM target, so there is no field or popup to yield to. */
export function resolveUsageShortcut(
  event: ShortcutEventLike & { target: unknown },
  keybindings: ResolvedKeybindingsConfig,
) {
  return resolveShortcutCommand(event, keybindings, {
    context: { usagePageOpen: true },
  });
}

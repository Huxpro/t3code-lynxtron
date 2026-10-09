import {
  ClaudeSettings,
  CodexSettings,
  CursorSettings,
  GrokSettings,
  OpenCodeSettings,
  ProviderDriverKind,
} from "@t3tools/contracts";
import type * as Schema from "effect/Schema";

export type ProviderSettingsSchema = {
  readonly fields: Readonly<Record<string, Schema.Top>>;
} & Schema.Top;

/**
 * Icon-free provider driver definition shared by every settings renderer.
 * Renderers attach their own icons (see `providerDriverMeta.ts` for Web).
 */
export interface ProviderDriverDefinition {
  readonly value: ProviderDriverKind;
  readonly label: string;
  readonly settingsSchema: ProviderSettingsSchema;
  /**
   * Optional short label rendered as a warning badge next to the instance
   * title. Used to flag drivers that still ship under an early-access or
   * preview gate — the flag is a property of the driver kind (not a specific
   * instance), so every instance of that driver advertises the same marker.
   */
  readonly badgeLabel?: string;
}

export const PROVIDER_DRIVER_DEFINITIONS: readonly ProviderDriverDefinition[] = [
  { value: ProviderDriverKind.make("codex"), label: "Codex", settingsSchema: CodexSettings },
  {
    value: ProviderDriverKind.make("claudeAgent"),
    label: "Claude",
    settingsSchema: ClaudeSettings,
  },
  {
    value: ProviderDriverKind.make("cursor"),
    label: "Cursor",
    badgeLabel: "Early Access",
    settingsSchema: CursorSettings,
  },
  {
    value: ProviderDriverKind.make("grok"),
    label: "Grok",
    badgeLabel: "Early Access",
    settingsSchema: GrokSettings,
  },
  {
    value: ProviderDriverKind.make("opencode"),
    label: "OpenCode",
    settingsSchema: OpenCodeSettings,
  },
];

export const PROVIDER_DRIVER_DEFINITION_BY_VALUE: Partial<
  Record<ProviderDriverKind, ProviderDriverDefinition>
> = Object.fromEntries(
  PROVIDER_DRIVER_DEFINITIONS.map((definition) => [definition.value, definition]),
);

/** Drivers the add-provider dialog lists as coming soon (disabled). */
export const COMING_SOON_PROVIDER_DRIVERS: ReadonlyArray<{
  readonly value: ProviderDriverKind;
  readonly label: string;
}> = [
  { value: ProviderDriverKind.make("githubCopilot"), label: "Github Copilot" },
  { value: ProviderDriverKind.make("gemini"), label: "Gemini" },
  { value: ProviderDriverKind.make("acpRegistry"), label: "ACP Registry" },
  { value: ProviderDriverKind.make("piAgent"), label: "Pi Agent" },
];

export const PROVIDER_ACCENT_SWATCHES = [
  "#2563eb",
  "#16a34a",
  "#ea580c",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
] as const;

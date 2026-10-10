import type { BackgroundActivityProfile, ServerSettings } from "@t3tools/contracts";
import { resolveServerBackgroundActivitySettings } from "@t3tools/shared/backgroundActivitySettings";

import { resolveBackgroundActivityProfileOption } from "../../../../web/src/components/settings/SettingsPanels.logic";

const BACKGROUND_ACTIVITY_PROFILE_DESCRIPTIONS: Record<BackgroundActivityProfile, string> = {
  balanced:
    "Pauses background probes when clients are idle, the host is locked, or low power mode is active.",
  performance: "Allows scoped background probes while any subscribed client remains connected.",
  "battery-saver": "Also pauses background probes when the host or client is on battery.",
};

export function backgroundActivityProfileDescription(settings: ServerSettings): string {
  const resolved = resolveServerBackgroundActivitySettings(settings);
  return resolveBackgroundActivityProfileOption(settings) === "advanced"
    ? `Uses custom background intervals with the selected shared power policy. Current shared policy: ${resolved.profile === "battery-saver" ? "Battery saver" : resolved.profile[0]?.toUpperCase() + resolved.profile.slice(1)}.`
    : BACKGROUND_ACTIVITY_PROFILE_DESCRIPTIONS[resolved.profile];
}

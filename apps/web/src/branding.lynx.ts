import type { DesktopAppBranding } from "@t3tools/contracts";

import { formatAppDisplayName } from "./branding.logic";

const buildEnv = (
  import.meta as unknown as {
    readonly env: {
      readonly APP_VERSION?: string;
      readonly DEV?: boolean;
      readonly VITE_HOSTED_APP_CHANNEL?: string;
    };
  }
).env;

declare const NativeModules: {
  nodejs?: {
    exposed?: {
      getAppBranding?: () => DesktopAppBranding;
    };
  };
} & Record<string, unknown>;

function readInjectedDesktopAppBranding(): DesktopAppBranding | null {
  "background only";
  try {
    return NativeModules?.nodejs?.exposed?.getAppBranding?.() ?? null;
  } catch {
    return null;
  }
}

const injectedDesktopAppBranding = readInjectedDesktopAppBranding();
const hostedAppChannel = buildEnv.VITE_HOSTED_APP_CHANNEL?.trim().toLowerCase();

export const HOSTED_APP_CHANNEL =
  hostedAppChannel === "latest" || hostedAppChannel === "nightly" ? hostedAppChannel : null;
export const HOSTED_APP_CHANNEL_LABEL =
  HOSTED_APP_CHANNEL === "nightly" ? "Nightly" : HOSTED_APP_CHANNEL === "latest" ? "Latest" : null;
export const APP_BASE_NAME = injectedDesktopAppBranding?.baseName ?? "T3 Code";
export const APP_STAGE_LABEL =
  injectedDesktopAppBranding?.stageLabel ??
  HOSTED_APP_CHANNEL_LABEL ??
  (buildEnv.DEV ? "Dev" : "Alpha");
export const APP_DISPLAY_NAME =
  injectedDesktopAppBranding?.displayName ??
  formatAppDisplayName({ baseName: APP_BASE_NAME, stageLabel: APP_STAGE_LABEL });
export const APP_VERSION = buildEnv.APP_VERSION || "0.0.0";

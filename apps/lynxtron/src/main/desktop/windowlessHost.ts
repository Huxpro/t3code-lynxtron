// Linux Lynxtron has no native window: LynxWindows must be windowless, and
// the frames reach a developer through the Linux dev viewer instead.

const MIN_SCALE_FACTOR = 1;
const MAX_SCALE_FACTOR = 4;

export interface WindowlessWindowOptions {
  readonly windowless?: true;
  readonly deviceScaleFactor?: number;
}

export function resolveWindowlessWindowOptions(
  platform: NodeJS.Platform,
  env: Readonly<Record<string, string | undefined>>,
): WindowlessWindowOptions {
  if (platform !== "linux") {
    return {};
  }
  const scale = Number(env.T3_LYNXTRON_DEVICE_SCALE_FACTOR);
  return Number.isFinite(scale) && scale >= MIN_SCALE_FACTOR && scale <= MAX_SCALE_FACTOR
    ? { windowless: true, deviceScaleFactor: scale }
    : { windowless: true };
}

// The Linux dev viewer drives the page through Lynx DevTool, which only
// attaches to views created after DevTool is enabled.
export function shouldEnableDevTool(env: Readonly<Record<string, string | undefined>>): boolean {
  return env.T3_LYNXTRON_DEVTOOL === "1";
}

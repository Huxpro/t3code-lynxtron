export const DEFAULT_LYNXTRON_VIEWPORT = {
  width: 1180,
  height: 748,
} as const;

const MIN_VIEWPORT_EDGE = 320;
const MAX_VIEWPORT_EDGE = 7680;

export interface LynxtronViewport {
  readonly width: number;
  readonly height: number;
}

function parseViewportEdge(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= MIN_VIEWPORT_EDGE && parsed <= MAX_VIEWPORT_EDGE
    ? parsed
    : fallback;
}

export function resolveLynxtronViewport(
  env: Readonly<Record<string, string | undefined>> = process.env,
): LynxtronViewport {
  return {
    width: parseViewportEdge(env.T3_LYNXTRON_VIEWPORT_WIDTH, DEFAULT_LYNXTRON_VIEWPORT.width),
    height: parseViewportEdge(env.T3_LYNXTRON_VIEWPORT_HEIGHT, DEFAULT_LYNXTRON_VIEWPORT.height),
  };
}

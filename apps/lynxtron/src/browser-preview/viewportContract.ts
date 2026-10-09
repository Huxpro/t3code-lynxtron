export interface BrowserPreviewViewportContract {
  readonly cssWidth: number;
  readonly cssHeight: number;
  readonly pixelRatio: number;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
}

interface BrowserPreviewViewportInput {
  readonly innerWidth: number;
  readonly innerHeight: number;
  readonly pixelRatio: number;
  readonly requestedWidth?: string | null;
  readonly requestedHeight?: string | null;
}

const DEFAULT_VIEWPORT_WIDTH = 1280;
const DEFAULT_VIEWPORT_HEIGHT = 820;

function resolvePositiveDimension(
  measured: number,
  requested: string | null | undefined,
  fallback: number,
): number {
  if (Number.isFinite(measured) && measured > 0) return Math.round(measured);
  const parsed = Number(requested);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

export function resolveBrowserPreviewViewportContract({
  innerWidth,
  innerHeight,
  pixelRatio,
  requestedWidth,
  requestedHeight,
}: BrowserPreviewViewportInput): BrowserPreviewViewportContract {
  const cssWidth = resolvePositiveDimension(innerWidth, requestedWidth, DEFAULT_VIEWPORT_WIDTH);
  const cssHeight = resolvePositiveDimension(innerHeight, requestedHeight, DEFAULT_VIEWPORT_HEIGHT);
  const resolvedPixelRatio = Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;

  return {
    cssWidth,
    cssHeight,
    pixelRatio: resolvedPixelRatio,
    pixelWidth: Math.round(cssWidth * resolvedPixelRatio),
    pixelHeight: Math.round(cssHeight * resolvedPixelRatio),
  };
}

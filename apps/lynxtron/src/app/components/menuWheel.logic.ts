const MIN_WHEEL_STEP_PX = 24;
const MAX_WHEEL_STEP_PX = 96;
const WHEEL_GAIN = 1.75;

/** Keep short trackpad/wheel gestures responsive without allowing one event to skip a menu. */
export function responsiveMenuWheelDelta(deltaY: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
  const direction = Math.sign(deltaY);
  const magnitude = Math.min(
    MAX_WHEEL_STEP_PX,
    Math.max(MIN_WHEEL_STEP_PX, Math.abs(deltaY) * WHEEL_GAIN),
  );
  return direction * magnitude;
}

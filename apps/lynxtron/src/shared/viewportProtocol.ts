export const T3_VIEWPORT_EVENT = "t3:viewport-changed";
export const T3_VIEWPORT_READY_METHOD = "t3:viewport.ready";
export const T3_VIEWPORT_SET_FOR_TEST_METHOD = "t3:viewport.set-for-test";
export const T3_RELOAD_FOR_TEST_METHOD = "t3:reload-for-test";

export interface LynxtronViewportSnapshot {
  readonly width: number;
  readonly height: number;
  readonly pointer: "fine";
  readonly sequence: number;
  readonly testResize?: boolean;
}

export function isLynxtronViewportSnapshot(value: unknown): value is LynxtronViewportSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Partial<LynxtronViewportSnapshot>;
  return (
    Number.isFinite(snapshot.width) &&
    Number.isFinite(snapshot.height) &&
    typeof snapshot.sequence === "number" &&
    Number.isInteger(snapshot.sequence) &&
    snapshot.sequence >= 0 &&
    snapshot.pointer === "fine" &&
    (snapshot.testResize === undefined || typeof snapshot.testResize === "boolean")
  );
}

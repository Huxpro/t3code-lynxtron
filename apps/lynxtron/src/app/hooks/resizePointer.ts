export interface PointerLikeEvent {
  readonly button?: number;
  readonly buttons?: number;
  readonly clientX?: number;
  readonly pageX?: number;
  readonly x?: number;
  readonly detail?: {
    readonly buttons?: number;
    readonly clientX?: number;
    readonly pageX?: number;
    readonly x?: number;
  };
  readonly touches?: ReadonlyArray<{
    readonly clientX?: number;
    readonly pageX?: number;
    readonly x?: number;
  }>;
  readonly changedTouches?: ReadonlyArray<{
    readonly clientX?: number;
    readonly pageX?: number;
    readonly x?: number;
  }>;
}

function finiteCoordinate(...values: ReadonlyArray<number | undefined>): number | null {
  const value = values.find((candidate) => Number.isFinite(candidate));
  return value === undefined ? null : value;
}

export function pointerClientX(event: PointerLikeEvent): number | null {
  const touch = event.touches?.[0] ?? event.changedTouches?.[0];
  return finiteCoordinate(
    touch?.clientX,
    touch?.pageX,
    touch?.x,
    event.clientX,
    event.pageX,
    event.x,
    event.detail?.clientX,
    event.detail?.pageX,
    event.detail?.x,
  );
}

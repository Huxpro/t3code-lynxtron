export interface FloatingRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type FloatingSide = "top" | "right" | "bottom" | "left";
export type FloatingAlign = "start" | "center" | "end";

export interface FloatingPlacement {
  readonly side: FloatingSide;
  readonly align: FloatingAlign;
  readonly sideOffset: number;
  readonly alignOffset?: number;
}

export interface FloatingAnchorPoint {
  readonly x: number;
  readonly y: number;
  readonly transform: string;
}

export interface FloatingRelationMetrics {
  readonly alignDelta: number;
  readonly sideGap: number;
  readonly sideMismatch: boolean;
}

function horizontalAlignmentPoint(rect: FloatingRect, align: FloatingAlign): number {
  if (align === "start") return rect.x;
  if (align === "end") return rect.x + rect.width;
  return rect.x + rect.width / 2;
}

function verticalAlignmentPoint(rect: FloatingRect, align: FloatingAlign): number {
  if (align === "start") return rect.y;
  if (align === "end") return rect.y + rect.height;
  return rect.y + rect.height / 2;
}

function transformForPlacement(side: FloatingSide, align: FloatingAlign): string {
  const crossAxis = align === "start" ? "0%" : align === "end" ? "-100%" : "-50%";
  if (side === "top") return `translate(${crossAxis}, -100%)`;
  if (side === "bottom") return `translate(${crossAxis}, 0%)`;
  if (side === "left") return `translate(-100%, ${crossAxis})`;
  return `translate(0%, ${crossAxis})`;
}

export function resolveFloatingAnchorPoint(
  anchor: FloatingRect,
  placement: FloatingPlacement,
): FloatingAnchorPoint {
  const alignOffset = placement.alignOffset ?? 0;
  if (placement.side === "top" || placement.side === "bottom") {
    return {
      x: horizontalAlignmentPoint(anchor, placement.align) + alignOffset,
      y:
        placement.side === "top"
          ? anchor.y - placement.sideOffset
          : anchor.y + anchor.height + placement.sideOffset,
      transform: transformForPlacement(placement.side, placement.align),
    };
  }
  return {
    x:
      placement.side === "left"
        ? anchor.x - placement.sideOffset
        : anchor.x + anchor.width + placement.sideOffset,
    y: verticalAlignmentPoint(anchor, placement.align) + alignOffset,
    transform: transformForPlacement(placement.side, placement.align),
  };
}

export function measureFloatingRelation(
  anchor: FloatingRect,
  popup: FloatingRect,
  placement: FloatingPlacement,
): FloatingRelationMetrics {
  const alignOffset = placement.alignOffset ?? 0;
  if (placement.side === "top" || placement.side === "bottom") {
    const expectedAlign = horizontalAlignmentPoint(anchor, placement.align) + alignOffset;
    const popupAlign = horizontalAlignmentPoint(popup, placement.align);
    const sideGap =
      placement.side === "top"
        ? anchor.y - (popup.y + popup.height)
        : popup.y - (anchor.y + anchor.height);
    return {
      alignDelta: popupAlign - expectedAlign,
      sideGap,
      sideMismatch: sideGap < 0,
    };
  }
  const expectedAlign = verticalAlignmentPoint(anchor, placement.align) + alignOffset;
  const popupAlign = verticalAlignmentPoint(popup, placement.align);
  const sideGap =
    placement.side === "left"
      ? anchor.x - (popup.x + popup.width)
      : popup.x - (anchor.x + anchor.width);
  return {
    alignDelta: popupAlign - expectedAlign,
    sideGap,
    sideMismatch: sideGap < 0,
  };
}

export function floatingRelationResidual(
  metrics: FloatingRelationMetrics,
  placement: FloatingPlacement,
  scale = 32,
): number {
  const gapDelta = Math.abs(metrics.sideGap - placement.sideOffset);
  const normalized =
    (Math.min(1, Math.abs(metrics.alignDelta) / scale) +
      Math.min(1, gapDelta / scale) +
      (metrics.sideMismatch ? 1 : 0)) /
    3;
  return Number(normalized.toFixed(6));
}

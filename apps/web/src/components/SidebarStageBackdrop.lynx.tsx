import { APP_STAGE_LABEL } from "../branding";

export type SidebarStageBackdropVariant = "nightly" | "dev";

const GRID_COLUMNS = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120, 128, 136, 144, 152, 160, 168,
  176, 184, 192, 200, 208, 216, 224, 232, 240, 248, 256,
] as const;
const GRID_ROWS = [0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80] as const;
const BLUEPRINT_MARKS = [
  { x: 46, y: 38 },
  { x: 146, y: 50 },
  { x: 228, y: 26 },
] as const;
const NIGHTLY_STARS = [
  { x: 14, y: 10, size: 1.2 },
  { x: 38, y: 22, size: 0.8 },
  { x: 58, y: 8, size: 1 },
  { x: 84, y: 16, size: 0.8 },
  { x: 104, y: 7, size: 1.2 },
  { x: 126, y: 20, size: 0.8 },
  { x: 148, y: 11, size: 1 },
  { x: 170, y: 24, size: 0.8 },
  { x: 192, y: 9, size: 1.2 },
  { x: 214, y: 18, size: 0.8 },
  { x: 236, y: 8, size: 1 },
  { x: 26, y: 34, size: 0.8 },
  { x: 118, y: 34, size: 0.8 },
  { x: 202, y: 32, size: 0.8 },
] as const;

export function resolveSidebarStageBackdropVariant(
  stageLabel: string,
): SidebarStageBackdropVariant | null {
  const normalized = stageLabel.trim().toLowerCase();
  if (normalized === "nightly") return "nightly";
  if (normalized === "dev") return "dev";
  return null;
}

export function useSidebarStageBackdropVariant(): SidebarStageBackdropVariant | null {
  return resolveSidebarStageBackdropVariant(APP_STAGE_LABEL);
}

export function StageBackdropArt({
  compact = false,
  variant,
}: {
  readonly compact?: boolean;
  readonly variant: SidebarStageBackdropVariant;
}) {
  return (
    <view
      className={[
        "sidebar__brand-bg",
        variant === "nightly" ? "sidebar-stage-backdrop--nightly" : "sidebar-stage-backdrop--dev",
        compact ? "sidebar-stage-backdrop--compact" : undefined,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <view className="sidebar__brand-glow" />
      {variant === "dev"
        ? GRID_COLUMNS.map((left, index) => (
            <view
              key={`column-${left}`}
              className={
                index % 4 === 0
                  ? "sidebar__brand-grid-line sidebar__brand-grid-line--vertical sidebar__brand-grid-line--major"
                  : "sidebar__brand-grid-line sidebar__brand-grid-line--vertical"
              }
              style={{ left: `${left}px` }}
            />
          ))
        : NIGHTLY_STARS.map((star) => (
            <view
              key={`star-${star.x}-${star.y}`}
              className="sidebar__brand-star"
              style={{
                left: `${star.x}px`,
                top: `${star.y}px`,
                width: `${star.size}px`,
                height: `${star.size}px`,
              }}
            />
          ))}
      {variant === "dev"
        ? GRID_ROWS.map((top, index) => (
            <view
              key={`row-${top}`}
              className={
                index % 4 === 0
                  ? "sidebar__brand-grid-line sidebar__brand-grid-line--horizontal sidebar__brand-grid-line--major"
                  : "sidebar__brand-grid-line sidebar__brand-grid-line--horizontal"
              }
              style={{ top: `${top}px` }}
            />
          ))
        : null}
      {variant === "dev"
        ? GRID_COLUMNS.slice(1).map((left, index) => (
            <view
              key={`tick-${left}`}
              className={
                index % 4 === 3
                  ? "sidebar__brand-ruler-tick sidebar__brand-ruler-tick--major"
                  : "sidebar__brand-ruler-tick"
              }
              style={{ left: `${left}px` }}
            />
          ))
        : null}
      {variant === "dev"
        ? BLUEPRINT_MARKS.map((mark) => (
            <view
              key={`mark-${mark.x}-${mark.y}`}
              className="sidebar__brand-mark"
              style={{ left: `${mark.x}px`, top: `${mark.y}px` }}
            >
              <view className="sidebar__brand-mark-line sidebar__brand-mark-line--horizontal" />
              <view className="sidebar__brand-mark-line sidebar__brand-mark-line--vertical" />
            </view>
          ))
        : null}
      <view className="sidebar__brand-fade" />
    </view>
  );
}

export function SidebarStageBackdrop({
  variant,
}: {
  readonly variant: SidebarStageBackdropVariant;
}) {
  return <StageBackdropArt variant={variant} />;
}

export function StageBackdropButtonArt({
  variant,
}: {
  readonly variant: SidebarStageBackdropVariant;
}) {
  return <StageBackdropArt compact variant={variant} />;
}

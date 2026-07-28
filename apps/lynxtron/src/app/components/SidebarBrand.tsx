import { Icon } from "./Icon";

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

function SidebarBlueprintBackdrop() {
  return (
    <view className="sidebar__brand-bg">
      <view className="sidebar__brand-glow" />
      {GRID_COLUMNS.map((left, index) => (
        <view
          key={`column-${left}`}
          className={
            index % 4 === 0
              ? "sidebar__brand-grid-line sidebar__brand-grid-line--vertical sidebar__brand-grid-line--major"
              : "sidebar__brand-grid-line sidebar__brand-grid-line--vertical"
          }
          style={{ left: `${left}px` }}
        />
      ))}
      {GRID_ROWS.map((top, index) => (
        <view
          key={`row-${top}`}
          className={
            index % 4 === 0
              ? "sidebar__brand-grid-line sidebar__brand-grid-line--horizontal sidebar__brand-grid-line--major"
              : "sidebar__brand-grid-line sidebar__brand-grid-line--horizontal"
          }
          style={{ top: `${top}px` }}
        />
      ))}
      {GRID_COLUMNS.slice(1).map((left, index) => (
        <view
          key={`tick-${left}`}
          className={
            index % 4 === 3
              ? "sidebar__brand-ruler-tick sidebar__brand-ruler-tick--major"
              : "sidebar__brand-ruler-tick"
          }
          style={{ left: `${left}px` }}
        />
      ))}
      {BLUEPRINT_MARKS.map((mark) => (
        <view
          key={`mark-${mark.x}-${mark.y}`}
          className="sidebar__brand-mark"
          style={{ left: `${mark.x}px`, top: `${mark.y}px` }}
        >
          <view className="sidebar__brand-mark-line sidebar__brand-mark-line--horizontal" />
          <view className="sidebar__brand-mark-line sidebar__brand-mark-line--vertical" />
        </view>
      ))}
      <view className="sidebar__brand-fade" />
    </view>
  );
}

export function SidebarBrand() {
  return (
    <view className="sidebar__brand">
      <SidebarBlueprintBackdrop />
      <view className="sidebar__toggle">
        <Icon name="panel-left" size={16} color="#f5f5f5" className="sidebar__toggle-img" />
      </view>
      <view className="sidebar__logo">
        <Icon name="t3-wordmark" size={10} className="sidebar__logo-img" />
      </view>
      <text className="sidebar__title">Code</text>
    </view>
  );
}

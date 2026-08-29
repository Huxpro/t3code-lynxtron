export type QuickSwitchView =
  | "root"
  | "new-thread-projects"
  | "add-project-sources"
  | "add-project-local"
  | "add-project-remote"
  | "add-project-destination";

export interface QuickSwitchNavigationItem {
  readonly id: string;
  readonly disabled?: boolean;
  readonly run: () => void;
}

export function clampQuickSwitchActiveIndex(
  activeIndex: number,
  items: ReadonlyArray<QuickSwitchNavigationItem>,
): number {
  if (items.length === 0) return 0;
  return Math.min(Math.max(activeIndex, 0), items.length - 1);
}

export function moveQuickSwitchActiveIndex(
  activeIndex: number,
  direction: -1 | 1,
  items: ReadonlyArray<QuickSwitchNavigationItem>,
): number {
  if (items.length === 0) return 0;
  if (activeIndex < 0) {
    const ordered = direction === 1 ? items : [...items].reverse();
    const item = ordered.find((candidate) => !candidate.disabled);
    return item ? items.indexOf(item) : activeIndex;
  }
  let next = clampQuickSwitchActiveIndex(activeIndex, items);
  for (let step = 0; step < items.length; step += 1) {
    next = (next + direction + items.length) % items.length;
    if (!items[next]?.disabled) return next;
  }
  return activeIndex;
}

export function firstEnabledQuickSwitchIndex(
  items: ReadonlyArray<QuickSwitchNavigationItem>,
): number {
  const index = items.findIndex((item) => !item.disabled);
  return index < 0 ? 0 : index;
}

export function runActiveQuickSwitchItem(
  activeIndex: number,
  items: ReadonlyArray<QuickSwitchNavigationItem>,
): boolean {
  if (activeIndex < 0) return false;
  const item = items[clampQuickSwitchActiveIndex(activeIndex, items)];
  if (!item || item.disabled) return false;
  item.run();
  return true;
}

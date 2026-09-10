const MIN_COLUMN_WIDTH = 132;
const MIN_TABLE_WIDTH = 320;

export function markdownTableContentWidth(columnCount: number): number {
  if (!Number.isFinite(columnCount) || columnCount <= 0) return MIN_TABLE_WIDTH;
  return Math.max(MIN_TABLE_WIDTH, Math.floor(columnCount) * MIN_COLUMN_WIDTH);
}

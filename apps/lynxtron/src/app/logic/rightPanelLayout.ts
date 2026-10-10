export const RIGHT_PANEL_WIDTH_STORAGE_KEY = "t3code:preview-panel-width";
export const RIGHT_PANEL_DEFAULT_WIDTH = 540;
export const RIGHT_PANEL_MIN_WIDTH = 360;
export const RIGHT_PANEL_MAX_WIDTH_FRACTION = 0.7;
export const RIGHT_PANEL_MIN_CHAT_COLUMN_WIDTH = 408;
export const RIGHT_PANEL_SIDEBAR_RESERVE_WIDTH = 256;

export function resolveRightPanelMaximumWidth(viewportWidth: number): number {
  const fractionalMaximum = Math.floor(viewportWidth * RIGHT_PANEL_MAX_WIDTH_FRACTION);
  const chatReservedMaximum =
    viewportWidth - RIGHT_PANEL_SIDEBAR_RESERVE_WIDTH - RIGHT_PANEL_MIN_CHAT_COLUMN_WIDTH;
  return Math.max(RIGHT_PANEL_MIN_WIDTH, Math.min(fractionalMaximum, chatReservedMaximum));
}

export function resolveRightPanelSheetWidth(viewportWidth: number): number {
  return viewportWidth <= 760
    ? Math.min(viewportWidth * 0.88, 384)
    : Math.max(320, Math.min(viewportWidth * 0.42, 448));
}

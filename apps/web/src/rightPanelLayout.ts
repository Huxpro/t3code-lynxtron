export const RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 1023px)";
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

export const RIGHT_PANEL_SHEET_CLASS_NAME =
  "w-[min(42vw,28rem)] min-w-80 max-w-[28rem] p-0 max-[760px]:w-[min(88vw,24rem)] max-[760px]:min-w-0 wco:mt-[env(titlebar-area-height)] wco:h-[calc(100%-env(titlebar-area-height))] wco:max-h-[calc(100%-env(titlebar-area-height))]";

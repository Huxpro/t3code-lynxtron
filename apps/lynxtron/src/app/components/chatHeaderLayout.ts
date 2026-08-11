export const EXPANDED_HEADER_ACTIONS_MIN_WIDTH = 768;

export function shouldCompactHeaderActions(centerPanelWidth: number): boolean {
  return centerPanelWidth < EXPANDED_HEADER_ACTIONS_MIN_WIDTH;
}

const CONTENT_PADDING_PX = 8;
const SECTION_LABEL_HEIGHT_PX = 25;
const DIVIDED_SECTION_CHROME_PX = 12;
const ROW_HEIGHT_PX = 28;
const PANEL_BORDER_PX = 2;
const MODE_ROW_COUNT = 2;
const ACCESS_ROW_COUNT = 4;

export function compactControlsContentHeight(
  sections: ReadonlyArray<{ readonly items: ReadonlyArray<unknown> }>,
  showInteractionModeToggle: boolean,
): number {
  const modelSectionsHeight = sections.reduce(
    (height, section) => height + SECTION_LABEL_HEIGHT_PX + section.items.length * ROW_HEIGHT_PX,
    0,
  );
  const modeHeight = showInteractionModeToggle
    ? DIVIDED_SECTION_CHROME_PX + MODE_ROW_COUNT * ROW_HEIGHT_PX
    : 0;
  const accessHeight = DIVIDED_SECTION_CHROME_PX + ACCESS_ROW_COUNT * ROW_HEIGHT_PX;
  return CONTENT_PADDING_PX + modelSectionsHeight + modeHeight + accessHeight;
}

export function compactControlsPanelHeight(options: {
  readonly contentHeight: number;
  readonly viewportHeight: number;
}): number {
  const intrinsicHeight = options.contentHeight + PANEL_BORDER_PX;
  const viewportLimit = Math.max(160, options.viewportHeight - 140);
  return Math.min(intrinsicHeight, viewportLimit);
}

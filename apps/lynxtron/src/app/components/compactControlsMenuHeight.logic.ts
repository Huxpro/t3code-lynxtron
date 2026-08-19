const CONTENT_PADDING_PX = 8;
const TRAIT_SECTION_LABEL_HEIGHT_PX = 26;
const GROUP_SECTION_LABEL_HEIGHT_PX = 28;
const SECTION_SEPARATOR_HEIGHT_PX = 9;
const ROW_HEIGHT_PX = 28;
const PANEL_BORDER_PX = 2;
const VIEWPORT_COLLISION_CHROME_PX = 103;
const MODE_ROW_COUNT = 2;
const ACCESS_ROW_COUNT = 4;

export function compactControlsContentHeight(
  sections: ReadonlyArray<{ readonly items: ReadonlyArray<unknown> }>,
  showInteractionModeToggle: boolean,
): number {
  const modelSectionsHeight =
    sections.reduce(
      (height, section) =>
        height + TRAIT_SECTION_LABEL_HEIGHT_PX + section.items.length * ROW_HEIGHT_PX,
      0,
    ) +
    Math.max(0, sections.length - 1) * SECTION_SEPARATOR_HEIGHT_PX;
  const modelTailSeparator = sections.length > 0 ? SECTION_SEPARATOR_HEIGHT_PX : 0;
  const modeHeight = showInteractionModeToggle
    ? GROUP_SECTION_LABEL_HEIGHT_PX + MODE_ROW_COUNT * ROW_HEIGHT_PX + SECTION_SEPARATOR_HEIGHT_PX
    : 0;
  const accessHeight = GROUP_SECTION_LABEL_HEIGHT_PX + ACCESS_ROW_COUNT * ROW_HEIGHT_PX;
  return CONTENT_PADDING_PX + modelSectionsHeight + modelTailSeparator + modeHeight + accessHeight;
}

export function compactControlsPanelHeight(options: {
  readonly contentHeight: number;
  readonly viewportHeight: number;
}): number {
  const intrinsicHeight = options.contentHeight + PANEL_BORDER_PX;
  const viewportLimit = Math.max(160, options.viewportHeight - VIEWPORT_COLLISION_CHROME_PX);
  return Math.min(intrinsicHeight, viewportLimit);
}

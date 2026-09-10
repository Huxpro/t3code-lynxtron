import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const overrides = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");
const timelineSource = readFileSync(
  path.resolve(import.meta.dirname, "MessagesTimeline.tsx"),
  "utf8",
);
const composerSource = readFileSync(path.resolve(import.meta.dirname, "Composer.tsx"), "utf8");
const markdownSource = readFileSync(
  path.resolve(import.meta.dirname, "MarkdownRenderer.tsx"),
  "utf8",
);
const hostElementsSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/ui/hostElements.lynx.tsx"),
  "utf8",
);
const sharedRowSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/chat/TranscriptRowSurface.tsx"),
  "utf8",
);
const appSource = readFileSync(path.resolve(import.meta.dirname, "../index.tsx"), "utf8");
const chatViewSource = readFileSync(path.resolve(import.meta.dirname, "ChatView.tsx"), "utf8");
const imagePreviewSource = readFileSync(
  path.resolve(import.meta.dirname, "ImagePreviewOverlay.tsx"),
  "utf8",
);
const webTimelineSource = readFileSync(
  path.resolve(import.meta.dirname, "../../../../web/src/components/chat/MessagesTimeline.tsx"),
  "utf8",
);
const rightPanelSource = readFileSync(path.resolve(import.meta.dirname, "RightPanel.tsx"), "utf8");
const planPanelSource = readFileSync(path.resolve(import.meta.dirname, "PlanPanel.tsx"), "utf8");
const browserPreviewSource = readFileSync(
  path.resolve(import.meta.dirname, "../../browser-preview/index.ts"),
  "utf8",
);

describe("transcript layout contract", () => {
  it("measures changed-files compact mode from the transcript viewport like Web", () => {
    expect(timelineSource).toContain("const [timelineViewportWidth, setTimelineViewportWidth]");
    expect(timelineSource).toContain("timelineViewportWidth < 360");
    expect(timelineSource).toContain("timelineViewportWidth < 640");
    expect(timelineSource).toContain("deriveTimelineMinimapItems(rows)");
    expect(timelineSource).toContain("timelineViewportWidth >= 864");
    expect(timelineSource).toContain("data-timeline-minimap-item");
    expect(timelineSource).toContain("resolveTimelineMinimapHeightStyle(minimapItems.length)");
    expect(timelineSource).toContain(
      "resolveTimelineMinimapTopPercent(index, minimapItems.length)",
    );
    expect(overrides).toContain(".timeline-minimap__target {\n  position: absolute;");
    expect(overrides).toContain(".timeline-minimap__preview {");
    expect(timelineSource).toContain("!compactActions");
    expect(timelineSource).toContain("bindlayoutchange={(event:");
    expect(timelineSource).not.toContain("availableWidth < 360");
  });
  it("matches the Web timeline top inset and working-row spacing", () => {
    expect(overrides).toContain("padding: 16px 26px 20px;");
    expect(overrides).toContain(
      ".timeline-settled-header-space {\n  width: 100%;\n  height: 32px;",
    );
    expect(timelineSource).toContain('item-key="timeline-settled-header-space"');
    expect(overrides).toContain(".transcript-turn-fold-outer {\n  width: 100%;\n  height: 29px;");
    expect(overrides).toContain(".transcript-turn-fold-button {");
    expect(overrides).toContain("  height: 16px;");
    expect(browserPreviewSource).toContain(
      '".timeline-row-root--turn-fold{height:45px!important;}"',
    );
    expect(browserPreviewSource).toContain(
      '".transcript-assistant-row>.inline-markdown-row{min-height:23px!important;margin-bottom:0!important;}"',
    );
    expect(timelineSource).toContain('row.kind === "turn-fold"');
    expect(timelineSource).toContain('? "timeline-row-root timeline-row-root--turn-fold"');
    expect(overrides).toContain(".transcript-work-entry-body {");
    expect(overrides).toContain(
      ".transcript-work-entry-preview--native {\n  flex-grow: 1;\n  flex-shrink: 1;\n  width: 0;",
    );
    expect(overrides).toContain("font-family: var(--font-mono);");
    expect(appSource).not.toContain("width:764px");
    expect(appSource).not.toContain("line-height:24px!important");
    expect(markdownSource).toContain('className="md-list md-list-text"');
    expect(timelineSource).not.toContain("scaleX(1.096)");
    expect(timelineSource).toContain("estimated-main-axis-size-px={32}");
    expect(timelineSource).toContain("!isWorking && !hasTopBanner");
    expect(timelineSource).toContain(
      'hasTopBanner\n            ? "timeline-list timeline-list--top-banner"',
    );
    expect(timelineSource).toContain(
      'isWorking\n              ? "timeline-list timeline-list--working"',
    );
    expect(appSource).toContain('__T3_LYNXTRON_WEB_PREVIEW__ ? " lynx-web-preview"');
    expect(overrides).toContain(".lynx-web-preview .timeline-list {\n  padding-top: 48px;");
    expect(overrides).toContain(".timeline-list--top-banner {\n  padding-top: 20px;");
    expect(overrides).toContain(
      ".lynx-web-preview .timeline-list--top-banner {\n  padding-top: 16px;",
    );
    expect(overrides).toContain(
      ".lynx-web-preview .timeline-settled-header-space {\n  display: none;",
    );
    expect(overrides).toContain(".timeline-row-root--working {\n  height: 40px;");
    expect(overrides).toContain(".transcript-working-outer {\n  padding-bottom: 16px;");
    expect(sharedRowSource).toContain('row.kind === "working" ? "transcript-working-outer" : null');
    expect(timelineSource).toContain(
      'row.kind === "working"\n                  ? "timeline-row-root timeline-row-root--working"',
    );
    expect(timelineSource).toContain('row.kind === "message" && row.message.role === "assistant"');
    expect(timelineSource).toContain("text={displayed.visibleText}");
    expect(overrides).toContain(".transcript-user-body .md-paragraph {");
    expect(overrides).toContain("overflow-wrap: anywhere;");
    expect(overrides).toContain(".timeline-row-root--assistant {\n  padding-bottom: 16px;");
    expect(overrides).toContain(".inline-markdown-code {\n  display: flex;\n  flex-shrink: 0;");
    expect(overrides).toContain(".turn-diff-card .lynx-changed-files-tree {\n  margin-top: 0;");
    expect(composerSource).toContain("compactFooter && !questionMode");
    expect(composerSource).toContain("shouldUseCompactComposerFooter(availableWidth");
    expect(composerSource).toContain("viewport.width < 640 && !mobileComposerExpanded");
    expect(composerSource).toContain('aria-label="Expand composer"');
    expect(composerSource).toContain('className="composer-mobile-collapsed"');
    expect(overrides).toContain(".composer-mobile-collapsed {");
    expect(overrides).toContain("height: 48px;");
    expect(composerSource).toContain("separators={!compactFooter}");
    expect(composerSource).toContain("compactControlsPanelHeight({");
    expect(composerSource).toContain("const compactControlsEstimatedContentHeight");
    expect(composerSource).toContain(
      "compactControlsMeasuredContentHeight ?? compactControlsEstimatedContentHeight",
    );
    expect(composerSource).toContain('className="composer-compact-controls-menu__content"');
    expect(composerSource).toContain("setCompactControlsMeasuredContentHeight");
    expect(composerSource).toContain("compactControlsMenuHeight - 2");
    expect(composerSource).toContain("__T3_LYNXTRON_COMPACT_CONTROLS_SCROLL_PROBE__");
    expect(composerSource).toContain(
      'target.invoke("scrollTo", { offset: nextOffset, smooth: false })',
    );
    expect(composerSource).toContain('aria-label="More composer controls"');
    expect(composerSource).toContain("data-composer-compact-controls-menu");
    expect(composerSource).toContain('className="composer-compact-controls-dismiss"');
    expect(composerSource.indexOf('className="composer-compact-controls-menu"')).toBeLessThan(
      composerSource.indexOf('className="composer-compact-controls-dismiss"'),
    );
    expect(composerSource).toContain('className="composer-compact-controls-menu__scroll"');
    expect(composerSource).toContain(
      "main-thread:global-bindwheel={handleCompactControlsMenuWheel}",
    );
    expect(composerSource).toContain("responsiveMenuWheelDelta(");
    expect(composerSource).toContain("if (!Number.isFinite(deltaY) || deltaY === 0) return;");
    expect(composerSource).toContain('target.setAttribute("data-scroll-offset", `${nextOffset}`)');
    expect(composerSource).toContain('scroll-orientation="vertical"');
    expect(composerSource).toContain('mode === "default" ? "Chat" : "Plan"');
    expect(composerSource).toContain("composer-compact-controls-menu__badge");
    const modeHeader = composerSource.search(
      /composer-compact-controls-menu__section-label">\s*Mode\s*<\/text>/,
    );
    const accessHeader = composerSource.search(
      /composer-compact-controls-menu__section-label">\s*Access\s*<\/text>/,
    );
    expect(modeHeader).toBeGreaterThan(-1);
    expect(accessHeader).toBeGreaterThan(modeHeader);
    expect(overrides).toContain(".composer-compact-controls-menu__scroll {");
    expect(overrides).toContain("max-height: calc(100vh - 142px);");
    expect(overrides).toContain("width: 148px;");
    expect(composerSource).toContain("resolveCompactComposerControlsAlign(availableWidth)");
    expect(composerSource).toContain('compactControlsAlign === "end"');
    expect(overrides).toContain(".composer-compact-controls-menu--narrow {");
    expect(overrides).toContain("right: 0;");
    expect(overrides).toContain("left: auto;");
    expect(overrides).toContain(".composer-compact-controls-menu__group-label {");
    expect(overrides).toContain(".composer-compact-controls-menu__separator {");
    expect(overrides).toContain(".theme-light .composer-compact-controls-menu {");
    expect(overrides).toContain("background-color: rgba(255, 255, 255, 0.836);");
    expect(overrides).toContain("box-shadow: 0 16px 40px -18px rgba(0, 0, 0, 0.55);");
    expect(overrides).toContain(
      ".composer-context-item--checkout,\n.composer-context-item--branch {\n  position: relative;",
    );
    expect(overrides).toContain(
      ".composer-context-control--checkout {\n  width: 100%;\n  min-width: 0;",
    );
    expect(overrides).toContain(
      ".composer-context-label--checkout,\n.composer-context-label--branch {",
    );
    expect(overrides).toContain("text-overflow: ellipsis;");
    expect(composerSource).toContain("!compactFooter && !questionMode");
  });

  it("lets the settled Composer banner grow without collapsing its action", () => {
    const bannerStart = overrides.indexOf(".composer-settled-banner {");
    const bannerBlock = overrides.slice(bannerStart, overrides.indexOf("}", bannerStart));
    const copyStart = overrides.indexOf(".composer-settled-banner__copy {");
    const copyBlock = overrides.slice(copyStart, overrides.indexOf("}", copyStart));
    const actionStart = overrides.indexOf(".composer-settled-banner__action {");
    const actionBlock = overrides.slice(actionStart, overrides.indexOf("}", actionStart));

    expect(bannerBlock).toContain("height: auto;");
    expect(bannerBlock).toContain("min-height: 68px;");
    expect(bannerBlock).not.toContain("\n  height: 68px;");
    expect(copyBlock).toContain("flex-basis: 0;");
    expect(copyBlock).toContain("width: 0;");
    expect(actionBlock).toContain("width: 70px;");
    expect(actionBlock).toContain("min-width: 70px;");
    expect(actionBlock).toContain("max-width: 70px;");
  });

  it("stretches Review checkpoint cards across the transcript column", () => {
    const start = overrides.indexOf(".turn-diff-card {");
    const block = overrides.slice(start, overrides.indexOf("}", start));
    expect(block).toContain("--align-self-column: stretch;");
    expect(block).toContain("align-self: stretch;");
    expect(block).toContain("width: 100%;");
    expect(block).toContain("max-width: 760px;");
  });

  it("keeps code headers fixed while long source lines scroll horizontally", () => {
    expect(markdownSource).toContain('className="md-code-scroll" scroll-orientation="horizontal"');
    const blockStart = overrides.indexOf(".md-code-block {");
    const block = overrides.slice(blockStart, overrides.indexOf("}", blockStart));
    const scrollStart = overrides.indexOf(".md-code-scroll {");
    const scroll = overrides.slice(scrollStart, overrides.indexOf("}", scrollStart));
    expect(block).toContain("overflow: hidden;");
    expect(scroll).toContain("overflow-x: scroll;");
    expect(scroll).toContain("overflow-y: hidden;");
  });

  it("matches Web code-block wrap controls without stealing transcript follow", () => {
    expect(markdownSource).toContain("const [wrapped, setWrapped] = useState(initialWrapped)");
    expect(markdownSource).toContain("setWrapped(initialWrapped)");
    expect(markdownSource).toContain('aria-label={wrapped ? "Disable line wrap" : "Wrap lines"}');
    expect(markdownSource).toContain("onManualNavigation?.();");
    expect(markdownSource).toContain('className="md-code-text md-code-text--wrapped"');
    const wrappedStart = overrides.indexOf(".md-code-text--wrapped {");
    const wrapped = overrides.slice(wrappedStart, overrides.indexOf("}", wrappedStart));
    expect(wrapped).toContain("white-space: pre-wrap;");
    expect(wrapped).toContain("word-break: break-word;");
  });

  it("keeps wide Markdown tables horizontally reachable without crushing columns", () => {
    expect(markdownSource).toContain('className="md-table-scroll" scroll-orientation="horizontal"');
    expect(markdownSource).toContain("markdownTableContentWidth(table.headers.length)");
    const scrollStart = overrides.indexOf(".md-table-scroll {");
    const scroll = overrides.slice(scrollStart, overrides.indexOf("}", scrollStart));
    const cellStart = overrides.indexOf(".md-table-cell {");
    const cell = overrides.slice(cellStart, overrides.indexOf("}", cellStart));
    expect(scroll).toContain("overflow-x: scroll;");
    expect(scroll).toContain("overflow-y: hidden;");
    expect(cell).toContain("min-width: 132px;");
  });

  it("keeps table copy feedback inside the table block", () => {
    expect(markdownSource).toContain("function MarkdownTableBlock");
    expect(markdownSource).toContain('label: "Copy as Markdown"');
    expect(markdownSource).toContain('label: "Copy as CSV"');
    expect(markdownSource).toContain("serializeMarkdownTable(table, selection)");
    expect(markdownSource).toContain('data-markdown-table-copy-state={copyStatus ?? "idle"}');
  });

  it("renders real proposed-plan content before opening the full panel", () => {
    expect(timelineSource).toContain("buildCollapsedProposedPlanPreviewMarkdown");
    expect(timelineSource).toContain("<MarkdownRenderer text={preview}");
    expect(timelineSource).toContain("cwd={cwd} threadId={threadId}");
    expect(timelineSource).toContain("Open full plan");
    expect(timelineSource).toContain('onClick={() => uiActions.openRightPanelSurface("plan")}');
  });

  it("detaches follow before expanding table cells and resets recycled state", () => {
    expect(markdownSource).toContain("const [expanded, setExpanded] = useState(initialExpanded)");
    expect(markdownSource).toContain("setExpanded(initialExpanded)");
    expect(markdownSource).toContain("onManualNavigation?.();");
    expect(markdownSource).toContain('text-maxline={expanded ? undefined : "1"}');
    expect(markdownSource).toContain(
      'aria-label={expanded ? "Collapse table cells" : "Expand table cells"}',
    );
  });

  it("routes supported Markdown images into the root preview overlay", () => {
    expect(markdownSource).toContain("resolveMarkdownImageSource(href, cwd)");
    expect(markdownSource).toContain("onImageExpand({");
    expect(markdownSource).toContain("onImageExpand={onImageExpand}");
    expect(timelineSource).toContain("onImageExpand={onImageExpand}");
    expect(chatViewSource).toContain("<ImagePreviewOverlay");
    expect(chatViewSource).toContain("onImageExpand={setExpandedImage}");
    expect(chatViewSource).toContain(
      "useEffect(() => setExpandedImage(null), [activeThreadId, threadId])",
    );
    expect(imagePreviewSource).toContain('aria-label="Close image preview"');
    expect(imagePreviewSource).toContain('aria-label="Previous image"');
    expect(imagePreviewSource).toContain('aria-label="Next image"');
    expect(markdownSource).toContain("function MarkdownImageBlock");
    expect(markdownSource).toContain("binderror={() => setFailed(true)}");
    expect(markdownSource).toContain('_tag: "workspace-file", threadId, path: source.path');
    expect(markdownSource).toContain('data-markdown-image-loading="true"');
    expect(markdownSource).toContain("if (refreshTimer !== null) clearTimeout(refreshTimer)");
    expect(imagePreviewSource).toContain("Unable to load image");
    expect(imagePreviewSource).toContain("binderror={() => setFailedSrc(item.src)}");
    expect(chatViewSource).toContain("onImageExpand={setExpandedImage}");
    expect(rightPanelSource).toContain("onImageExpand={props.onImageExpand}");
    expect(planPanelSource).toContain("onImageExpand={onImageExpand}");
    expect(timelineSource).toContain("threadId={threadId}");
    expect(planPanelSource).toContain("threadId={threadId}");
    expect(planPanelSource).toContain("normalizePlanMarkdownForExport(planMarkdown)");
    expect(planPanelSource).toContain('data-plan-copy-state={copyStatus ?? "idle"}');
    expect(planPanelSource).toContain("}, [planMarkdown]);");
    expect(planPanelSource).toContain("savePlanToDefaultWorkspacePath");
    expect(planPanelSource).toContain('data-plan-save-state={saveStatus?.status ?? "idle"}');
    expect(planPanelSource).toContain("Saved: ${saveStatus.relativePath}");
    expect(planPanelSource).toContain("Save failed: ${saveStatus.message}");
    expect(webTimelineSource).toContain("@t3tools/client-runtime/presentation/image-preview");
  });

  it("hydrates persisted attachment previews without mutating canonical messages", () => {
    expect(chatViewSource).toContain('resource: { _tag: "attachment", attachmentId }');
    expect(chatViewSource).toContain("if (!active) return;");
    expect(chatViewSource).toContain("earliestExpiry - Date.now() - 5 * 60_000");
    expect(chatViewSource).toContain("if (refreshTimer !== null) clearTimeout(refreshTimer)");
    expect(chatViewSource).toContain("const displayMessages = useMemo");
    expect(chatViewSource).toContain("previewUrl: attachmentPreviewUrlById[attachment.id]");
    expect(chatViewSource).toContain("messages={displayMessages}");
    expect(timelineSource).toContain("buildExpandedImagePreview(attachments, attachment.id)");
    expect(timelineSource).toContain('className="transcript-attachment-preview"');
  });

  it("resets recycled work disclosures and routes expansion through manual navigation", () => {
    expect(sharedRowSource).toContain("useEffect(() => setExpanded(false), [workEntry.id])");
    expect(sharedRowSource).toContain("onDisclosure?.();\n              setExpanded");
    expect(sharedRowSource).toContain("onWorkEntryDisclosure={onWorkEntryDisclosure}");
    expect(timelineSource).toContain("onWorkEntryDisclosure={detachForManualNavigation}");
    expect(timelineSource).toContain("transcript-disclosure-chevron-native--expanded");
    expect(overrides).toContain(
      ".transcript-disclosure-chevron-native--expanded {\n  transform: rotate(180deg) scale(1.01);",
    );
  });

  it("exposes native work status meaning without relying on icon shape", () => {
    expect(timelineSource).toContain('warning ? "Tool warning" : "Tool call failed"');
    expect(timelineSource).toContain('aria-label="Tool call completed"');
  });

  it("keeps empty right-panel cards at the authority height", () => {
    const start = overrides.indexOf(".right-panel-empty-card {");
    const block = overrides.slice(start, overrides.indexOf("}", start));

    expect(block).toContain("height: 112px;");
    expect(block).toContain("min-height: 112px;");
    expect(block).toContain("max-height: 112px;");
    expect(block).toContain("box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.05);");
    expect(overrides).toContain(".right-panel-empty-card__title {");
    expect(overrides).toContain(".right-panel-empty-card__description {");
    expect(overrides).toContain("font-size: 14px;");
    expect(overrides).toContain("font-size: 12px;");
  });

  it("stretches assistant rows across the native list item before sizing review cards", () => {
    const start = overrides.indexOf(
      ".timeline-row-root--assistant > .transcript-assistant-group {",
    );
    const block = overrides.slice(start, overrides.indexOf("}", start));
    expect(block).toContain("width: 100%;");
    expect(block).toContain("min-width: 0;");
  });

  it("keeps shared user-row spacing in the native list-item measurement", () => {
    expect(overrides).toContain(".timeline-row-root--user {");
    expect(overrides).toContain(".timeline-row-root--user > .transcript-user-outer {");
  });

  it("retains the authority checkpoint border in light mode", () => {
    const start = overrides.indexOf(".theme-light .turn-diff-card {");
    const block = overrides.slice(start, overrides.indexOf("}", start));
    expect(block).toContain("border-color: rgba(228, 228, 231, 0.7);");
  });

  it("keeps the Lynx patch surface flush with the Web diff renderer", () => {
    const filesStart = overrides.indexOf(".diff-code-files {");
    const filesBlock = overrides.slice(filesStart, overrides.indexOf("}", filesStart));
    const fileStart = overrides.indexOf(".diff-code-file {");
    const fileBlock = overrides.slice(fileStart, overrides.indexOf("}", fileStart));
    const headerStart = overrides.indexOf(".diff-code-file__header {");
    const headerBlock = overrides.slice(headerStart, overrides.indexOf("}", headerStart));
    expect(filesBlock).toContain("gap: 8px;");
    expect(filesBlock).toContain("padding-bottom: 8px;");
    expect(fileBlock).toContain("border-width: 0;");
    expect(fileBlock).toContain("border-radius: 0;");
    expect(headerBlock).toContain("height: 33px;");
    expect(fileBlock).toContain("border-left-width: 0;");
    expect(overrides).toContain(".diff-code-line__number {\n  width: 20px;");
    expect(overrides).toContain(".diff-code-line__marker {\n  width: 14px;");
    expect(overrides).toContain(
      ".diff-code-line__content {\n  flex-grow: 1;\n  min-width: 0;\n  padding: 0 8px;",
    );
  });

  it("renders Markdown lists as vertical full-width text rows", () => {
    expect(markdownSource).toContain('className="md-list md-list-text"');
    expect(markdownSource).toContain("<Fragment key={`${key}-${j}`}>");
    expect(markdownSource).toContain(
      "renderInline(parseMarkdownInline(item.content), `${key}-${j}`, cwd, true)",
    );
    expect(markdownSource).toContain('{j < items.length - 1 ? "\\n" : ""}');
    expect(overrides).toContain(".md-list {\n  display: block;");
    expect(overrides).toContain("white-space: pre-wrap;");
    expect(overrides).toContain("line-height: 23px;");
    expect(overrides).not.toContain(".md-list-line {");
    expect(overrides).not.toContain(".md-list-item {");
    const inlineTextStart = hostElementsSource.indexOf("export function HostInlineText");
    const inlineTextBlock = hostElementsSource.slice(
      inlineTextStart,
      hostElementsSource.indexOf("export function HostButton", inlineTextStart),
    );
    expect(inlineTextBlock).toContain("<inline-text");
    expect(inlineTextBlock).toContain("bindtap={onClick}");
    expect(inlineTextBlock).toContain('"main-thread:bindmousedown": handleMouseDown');
  });

  it("stacks expanded work-group labels above their entries", () => {
    const start = overrides.indexOf(".transcript-work-group {");
    const block = overrides.slice(start, overrides.indexOf("}", start));
    expect(block).toContain("display: flex;");
    expect(block).toContain("flex-direction: column;");
    expect(block).toContain("width: 100%;");
    expect(block).toContain("min-width: 0;");
  });

  it("reanchors the native list after a turn fold changes row heights", () => {
    expect(timelineSource).toContain(
      "const pendingTurnFoldAnchorRef = useRef<string | null>(null);",
    );
    expect(timelineSource).toContain("pendingTurnFoldAnchorRef.current = `turn-fold:${turnId}`;");
    expect(timelineSource).toContain("const anchorRowId = pendingTurnFoldAnchorRef.current;");
    expect(timelineSource).toContain(
      "const rowIndex = rows.findIndex((row) => row.id === anchorRowId);",
    );
    expect(timelineSource).toContain("index: rowIndex + (!isWorking && !hasTopBanner ? 1 : 0),");
  });
});

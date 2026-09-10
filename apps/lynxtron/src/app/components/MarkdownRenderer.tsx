import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "@lynx-js/react";
import {
  parseMarkdownInline,
  resolveInlineCodeFileLinkMeta,
  resolveMarkdownFileLinkMeta,
  resolveMarkdownImageSource,
  serializeMarkdownTable,
  type MarkdownInlinePresentation,
  type MarkdownTablePresentation,
} from "@t3tools/client-runtime/presentation/markdown";
import { clientCapabilities, showNativeContextMenu } from "../platform/clientCapabilities.lynx";
import { getClientSettingsState } from "../state/prefsStore";
import { uiActions } from "../state/uiState";
import { HostInlineText, HostText, HostView } from "../../../../web/src/components/ui/hostElements";
import { resolveExternalWebLinkHost } from "../../../../web/src/components/chat/externalLinkContextMenu";
import {
  parseMarkdownBlocks,
  type ParsedMarkdownBlock,
} from "@t3tools/client-runtime/presentation/markdown-blocks";
import { copyMarkdownCode } from "./markdownClipboard";
import { markdownTableContentWidth } from "./markdownTableLayout";
import type { MessageCopyStatus } from "./messageCopy";
import type { ExpandedImagePreview } from "@t3tools/client-runtime/presentation/image-preview";
import type { ThreadId } from "@t3tools/contracts";
import { t3ClientActions } from "../state/t3Client";

// Simple markdown-to-Lynx-views renderer. Handles the most common
// formatting used in AI assistant responses.

function activateMarkdownLink(href: string, cwd: string | undefined): void {
  "background only";
  const fileLink = resolveMarkdownFileLinkMeta(href, cwd);
  if (fileLink?.workspaceRelativePath) {
    uiActions.openFileSurface(fileLink.workspaceRelativePath);
    return;
  }
  if (fileLink && clientCapabilities.navigation.canOpenPath()) {
    void clientCapabilities.navigation.openPath(fileLink.filePath).catch((cause) => {
      console.error("[lynx-markdown] failed to open file link", { href, cause });
    });
    return;
  }
  if (/^(?:https?:|mailto:)/i.test(href) && clientCapabilities.navigation.canOpenExternal()) {
    void clientCapabilities.navigation.openExternal(href).catch((cause) => {
      console.error("[lynx-markdown] failed to open external link", { href, cause });
    });
  }
}

async function showMarkdownFileLinkContextMenu(
  href: string,
  cwd: string | undefined,
): Promise<void> {
  const fileLink = resolveMarkdownFileLinkMeta(href, cwd);
  if (!fileLink) return;
  const selection = await showNativeContextMenu([
    { id: "open", label: "Open in editor" },
    { id: "copy-relative", label: "Copy relative path" },
    { id: "copy-full", label: "Copy full path" },
  ]);
  if (selection === "open") {
    activateMarkdownLink(href, cwd);
  } else if (selection === "copy-relative") {
    await clientCapabilities.clipboard.writeText(fileLink.displayPath);
  } else if (selection === "copy-full") {
    await clientCapabilities.clipboard.writeText(fileLink.targetPath);
  }
}

function fileLinkContextMenuHandler(
  href: string | null,
  cwd: string | undefined,
): (() => void) | undefined {
  if (!href || !resolveMarkdownFileLinkMeta(href, cwd)) return undefined;
  return () => {
    void showMarkdownFileLinkContextMenu(href, cwd).catch((cause) => {
      console.error("[lynx-markdown] failed to handle file link context menu", { href, cause });
    });
  };
}

async function showMarkdownExternalLinkContextMenu(href: string): Promise<void> {
  const selection = await showNativeContextMenu([
    { id: "open-external", label: "Open in system browser" },
    { id: "copy-link", label: "Copy Link" },
  ]);
  if (selection === "open-external") {
    await clientCapabilities.navigation.openExternal(href);
  } else if (selection === "copy-link") {
    await clientCapabilities.clipboard.writeText(href);
  }
}

function markdownLinkContextMenuHandler(
  href: string | null,
  cwd: string | undefined,
): (() => void) | undefined {
  const fileHandler = fileLinkContextMenuHandler(href, cwd);
  if (fileHandler) return fileHandler;
  if (!href || !resolveExternalWebLinkHost(href)) return undefined;
  return () => {
    void showMarkdownExternalLinkContextMenu(href).catch((cause) => {
      console.error("[lynx-markdown] failed to handle external link context menu", {
        href,
        cause,
      });
    });
  };
}

function inlinePresentationHref(
  span: MarkdownInlinePresentation,
  cwd: string | undefined,
): string | null {
  if (span.href) return span.href;
  return span.code ? (resolveInlineCodeFileLinkMeta(span.text, cwd)?.targetPath ?? null) : null;
}

function renderInline(
  spans: ReadonlyArray<MarkdownInlinePresentation>,
  key: string,
  cwd: string | undefined,
  inlineHost = false,
): ReactNode[] {
  return spans.map((span, index) => {
    const spanKey = `${key}-${index}`;
    const href = inlinePresentationHref(span, cwd);
    const handleTap = href
      ? () => {
          "background only";
          activateMarkdownLink(href, cwd);
        }
      : undefined;
    const handleContextMenu = markdownLinkContextMenuHandler(href, cwd);
    const Inline = inlineHost ? HostInlineText : HostText;
    if (span.code) {
      return (
        <Inline
          key={spanKey}
          className={`md-inline-code ${href ? "md-link" : ""}`}
          onClick={handleTap}
          onContextMenu={handleContextMenu}
        >
          {span.text}
        </Inline>
      );
    }
    return (
      <Inline
        key={spanKey}
        className={`md-inline${span.href ? " md-link" : ""}${
          span.strikethrough ? " md-strikethrough" : ""
        }`}
        style={
          {
            fontWeight: span.bold ? "700" : "400",
            fontStyle: span.italic ? "italic" : "normal",
          } as object
        }
        onClick={handleTap}
        onContextMenu={handleContextMenu}
      >
        {span.text}
      </Inline>
    );
  });
}

function renderInteractiveParagraph(text: string, key: string, cwd: string | undefined): ReactNode {
  const spans = parseMarkdownInline(text);
  if (!spans.some((span) => inlinePresentationHref(span, cwd))) {
    return <text className="md-paragraph">{renderInline(spans, key, cwd)}</text>;
  }
  return (
    <view className="md-paragraph md-paragraph--segments" data-markdown-interactive-paragraph>
      {spans.map((span, index) => {
        const spanKey = `${key}-${index}`;
        const href = inlinePresentationHref(span, cwd);
        const className = `${span.code ? "md-inline-code" : "md-inline"}${
          href ? " md-link" : ""
        }${span.strikethrough ? " md-strikethrough" : ""}`;
        const handleContextMenu = markdownLinkContextMenuHandler(href, cwd);
        const content = (
          <HostText
            key={spanKey}
            className={className}
            style={
              {
                fontWeight: span.bold ? "700" : "400",
                fontStyle: span.italic ? "italic" : "normal",
              } as object
            }
            onContextMenu={handleContextMenu}
          >
            {span.text}
          </HostText>
        );
        return href ? (
          <HostView
            key={spanKey}
            className="md-link-hit-target"
            onClick={() => activateMarkdownLink(href, cwd)}
            onContextMenu={handleContextMenu}
          >
            {content}
          </HostView>
        ) : (
          content
        );
      })}
    </view>
  );
}

function MarkdownCodeBlock({
  block,
  blockKey,
  onManualNavigation,
}: {
  block: ParsedMarkdownBlock;
  blockKey: string;
  onManualNavigation: (() => void) | undefined;
}) {
  const initialWrapped = getClientSettingsState().wordWrap;
  const [wrapped, setWrapped] = useState(initialWrapped);
  const [copyStatus, setCopyStatus] = useState<MessageCopyStatus | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setWrapped(initialWrapped);
    setCopyStatus(null);
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    return () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, [block.code, blockKey, initialWrapped]);
  const toggleWrapped = useCallback(() => {
    "background only";
    onManualNavigation?.();
    setWrapped((value) => !value);
  }, [onManualNavigation]);
  const handleCopy = useCallback(() => {
    "background only";
    if (copyStatus === "pending") return;
    setCopyStatus("pending");
    void copyMarkdownCode(block.code ?? "", clientCapabilities.clipboard)
      .then((didCopy) => {
        setCopyStatus(didCopy ? "copied" : "failed");
      })
      .catch(() => {
        setCopyStatus("failed");
      })
      .then(() => {
        resetTimerRef.current = setTimeout(() => {
          setCopyStatus(null);
          resetTimerRef.current = null;
        }, 1_000);
      });
  }, [block.code, copyStatus]);
  const copyLabel =
    copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy";

  return (
    <view
      key={blockKey}
      className="md-code-block"
      data-markdown-code-block="true"
      data-markdown-code-language={block.language ?? ""}
      data-markdown-code-title={block.title ?? ""}
      data-markdown-code-wrap={wrapped ? "true" : "false"}
    >
      <view className="md-code-header" data-markdown-code-header="true">
        <text className="md-code-lang">{block.title ?? block.language ?? "Code"}</text>
        <view className="md-code-actions">
          <view
            className="md-code-wrap"
            aria-label={wrapped ? "Disable line wrap" : "Wrap lines"}
            aria-pressed={wrapped ? "true" : "false"}
            bindtap={toggleWrapped}
          >
            <text className="md-code-copy-label">{wrapped ? "Unwrap" : "Wrap"}</text>
          </view>
          <view
            className="md-code-copy"
            data-markdown-code-copy-state={copyStatus ?? "idle"}
            aria-label={
              copyStatus === "failed"
                ? "Code copy failed"
                : copyStatus === "copied"
                  ? "Code copied"
                  : "Copy code"
            }
            aria-disabled={copyStatus === "pending" ? "true" : "false"}
            bindtap={copyStatus === "pending" ? undefined : handleCopy}
          >
            <text className="md-code-copy-label">{copyLabel}</text>
          </view>
        </view>
      </view>
      {wrapped ? (
        <view className="md-code-wrap-body">
          <text className="md-code-text md-code-text--wrapped" data-markdown-code-content="true">
            {block.code}
          </text>
        </view>
      ) : (
        <scroll-view className="md-code-scroll" scroll-orientation="horizontal">
          <text className="md-code-text whitespace-pre" data-markdown-code-content="true">
            {block.code}
          </text>
        </scroll-view>
      )}
    </view>
  );
}

function MarkdownDetailsBlock({
  block,
  blockKey,
  cwd,
  onManualNavigation,
  onImageExpand,
  threadId,
}: {
  readonly block: ParsedMarkdownBlock;
  readonly blockKey: string;
  readonly cwd: string | undefined;
  readonly onManualNavigation: (() => void) | undefined;
  readonly onImageExpand: ((preview: ExpandedImagePreview) => void) | undefined;
  readonly threadId: ThreadId | undefined;
}) {
  const [open, setOpen] = useState(block.open ?? false);
  useEffect(() => {
    setOpen(block.open ?? false);
  }, [block.open, blockKey]);
  return (
    <view
      className="md-details"
      data-markdown-details="true"
      data-markdown-details-open={open ? "true" : "false"}
    >
      <view
        className="md-details-summary"
        bindtap={() => {
          onManualNavigation?.();
          setOpen((value) => !value);
        }}
      >
        <text className={`md-details-chevron${open ? " md-details-chevron--open" : ""}`}>›</text>
        <text className="md-details-label">
          {renderInline(
            parseMarkdownInline(block.summary ?? "Details"),
            `${blockKey}-summary`,
            cwd,
          )}
        </text>
      </view>
      {open ? (
        <view className="md-details-content">
          {(block.children ?? []).map((child, index) =>
            renderBlock(
              child,
              index,
              cwd,
              `${blockKey}-detail`,
              onManualNavigation,
              onImageExpand,
              threadId,
            ),
          )}
        </view>
      ) : null}
    </view>
  );
}

function MarkdownTableBlock({
  table,
  blockKey,
  cwd,
  onManualNavigation,
}: {
  readonly table: MarkdownTablePresentation;
  readonly blockKey: string;
  readonly cwd: string | undefined;
  readonly onManualNavigation: (() => void) | undefined;
}) {
  const initialExpanded = getClientSettingsState().wordWrap;
  const [expanded, setExpanded] = useState(initialExpanded);
  const [copyStatus, setCopyStatus] = useState<MessageCopyStatus | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setExpanded(initialExpanded);
    setCopyStatus(null);
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    return () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, [blockKey, initialExpanded, table]);
  const handleToggleExpanded = useCallback(() => {
    "background only";
    onManualNavigation?.();
    setExpanded((value) => !value);
  }, [onManualNavigation]);
  const handleCopy = useCallback(() => {
    "background only";
    if (copyStatus === "pending") return;
    void (async () => {
      try {
        const selection = await showNativeContextMenu([
          { id: "markdown", label: "Copy as Markdown" },
          { id: "csv", label: "Copy as CSV" },
        ]);
        if (selection !== "markdown" && selection !== "csv") return;
        setCopyStatus("pending");
        const didCopy = await copyMarkdownCode(
          serializeMarkdownTable(table, selection),
          clientCapabilities.clipboard,
        );
        setCopyStatus(didCopy ? "copied" : "failed");
      } catch {
        setCopyStatus("failed");
      }
      resetTimerRef.current = setTimeout(() => {
        setCopyStatus(null);
        resetTimerRef.current = null;
      }, 1_000);
    })();
  }, [copyStatus, table]);
  const copyLabel =
    copyStatus === "copied" ? "Copied" : copyStatus === "failed" ? "Copy failed" : "Copy table";

  return (
    <view
      className="md-table-container"
      data-markdown-table="true"
      data-markdown-table-expanded={expanded ? "true" : "false"}
    >
      <scroll-view className="md-table-scroll" scroll-orientation="horizontal">
        <view
          className="md-table"
          style={{ width: `${markdownTableContentWidth(table.headers.length)}px` }}
        >
          <view className="md-table-row md-table-row--header">
            {table.headers.map((header, column) => (
              <text
                key={`${blockKey}-h${column}`}
                className="md-table-cell md-table-cell--header"
                style={{ textAlign: table.alignments[column] ?? "left" } as any}
                text-maxline={expanded ? undefined : "1"}
              >
                {renderInline(parseMarkdownInline(header), `${blockKey}-h${column}`, cwd)}
              </text>
            ))}
          </view>
          {table.rows.map((row, rowIndex) => (
            <view key={`${blockKey}-r${rowIndex}`} className="md-table-row">
              {row.map((cell, column) => (
                <text
                  key={`${blockKey}-r${rowIndex}c${column}`}
                  className="md-table-cell"
                  style={{ textAlign: table.alignments[column] ?? "left" } as any}
                  text-maxline={expanded ? undefined : "1"}
                >
                  {renderInline(
                    parseMarkdownInline(cell),
                    `${blockKey}-r${rowIndex}c${column}`,
                    cwd,
                  )}
                </text>
              ))}
            </view>
          ))}
        </view>
      </scroll-view>
      <view className="md-table-footer">
        <view
          className="md-table-expand"
          aria-label={expanded ? "Collapse table cells" : "Expand table cells"}
          aria-pressed={expanded ? "true" : "false"}
          bindtap={handleToggleExpanded}
        >
          <text className="md-table-action-label">{expanded ? "Collapse" : "Expand"}</text>
        </view>
        <view
          className="md-table-copy"
          data-markdown-table-copy-state={copyStatus ?? "idle"}
          aria-label={copyLabel}
          aria-disabled={copyStatus === "pending" ? "true" : "false"}
          bindtap={copyStatus === "pending" ? undefined : handleCopy}
        >
          <text className="md-table-action-label">{copyLabel}</text>
        </view>
      </view>
    </view>
  );
}

function MarkdownImageBlock({
  block,
  blockKey,
  cwd,
  onImageExpand,
  threadId,
}: {
  readonly block: ParsedMarkdownBlock;
  readonly blockKey: string;
  readonly cwd: string | undefined;
  readonly onImageExpand: ((preview: ExpandedImagePreview) => void) | undefined;
  readonly threadId: ThreadId | undefined;
}) {
  const href = block.href ?? "";
  const source = useMemo(() => resolveMarkdownImageSource(href, cwd), [cwd, href]);
  const [resolvedSrc, setResolvedSrc] = useState(source.kind === "direct" ? source.url : null);
  const [failed, setFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    setFailed(false);
    if (source.kind === "direct") {
      setResolvedSrc(source.url);
    } else if (source.kind === "workspace-file" && threadId) {
      setResolvedSrc(null);
      void t3ClientActions
        .createAssetUrl({ resource: { _tag: "workspace-file", threadId, path: source.path } })
        .then((result) => {
          if (!active) return;
          setResolvedSrc(result.url);
          refreshTimer = setTimeout(
            () => setRevision((value) => value + 1),
            Math.max(1_000, result.expiresAt - Date.now() - 5 * 60_000),
          );
        })
        .catch(() => {
          if (active) setFailed(true);
        });
    } else {
      setResolvedSrc(null);
    }
    return () => {
      active = false;
      if (refreshTimer !== null) clearTimeout(refreshTimer);
    };
  }, [blockKey, revision, source, threadId]);
  if (source.kind === "unsupported" || failed) {
    return (
      <view className="md-media-fallback" data-markdown-image-fallback="true">
        <text className="md-media-fallback-label">
          {failed ? `Unable to load ${block.alt || "image"}` : block.alt || "Image"}
        </text>
        <text className="md-media-fallback-path">{href}</text>
      </view>
    );
  }
  if (!resolvedSrc) {
    return (
      <view className="md-media-fallback" data-markdown-image-loading="true">
        <text className="md-media-fallback-label">Loading image…</text>
        <text className="md-media-fallback-path">{href}</text>
      </view>
    );
  }
  const openPreview = onImageExpand
    ? () =>
        onImageExpand({
          images: [{ src: resolvedSrc, name: block.alt || block.title || "Image" }],
          index: 0,
        })
    : undefined;
  return (
    <view
      className="md-image-frame"
      data-markdown-image="true"
      aria-label={openPreview ? `Preview ${block.alt || "image"}` : undefined}
      bindtap={openPreview}
    >
      <image
        className="md-image"
        src={resolvedSrc}
        mode="aspectFit"
        binderror={() => setFailed(true)}
      />
      {block.alt ? <text className="md-image-caption">{block.alt}</text> : null}
    </view>
  );
}

function renderBlock(
  block: ParsedMarkdownBlock,
  idx: number,
  cwd: string | undefined,
  keyPrefix = "b",
  onManualNavigation?: () => void,
  onImageExpand?: (preview: ExpandedImagePreview) => void,
  threadId?: ThreadId,
): ReactNode {
  const key = `${keyPrefix}${idx}`;
  switch (block.type) {
    case "empty":
      return <view key={key} className="md-spacer" />;

    case "heading": {
      const level = block.level ?? 1;
      const fontSize = [0, 22, 18, 16, 15, 14, 13][level] ?? 14;
      return (
        <text
          key={key}
          className={`md-heading md-h${level}`}
          style={{ fontSize, fontWeight: "700" } as any}
        >
          {renderInline(parseMarkdownInline(block.text ?? ""), key, cwd)}
        </text>
      );
    }

    case "paragraph":
      return <view key={key}>{renderInteractiveParagraph(block.text ?? "", key, cwd)}</view>;

    case "code":
      return (
        <MarkdownCodeBlock
          key={key}
          block={block}
          blockKey={key}
          onManualNavigation={onManualNavigation}
        />
      );

    case "list": {
      const items = block.items ?? [];
      return (
        <text key={key} className="md-list md-list-text">
          {items.map((item, j) => {
            const marker =
              item.taskChecked !== null
                ? item.taskChecked
                  ? "☑"
                  : "☐"
                : item.kind === "ordered"
                  ? `${item.ordinal ?? j + 1}.`
                  : "•";
            return (
              <Fragment key={`${key}-${j}`}>
                {`${"  ".repeat(item.depth)}${marker} `}
                {renderInline(parseMarkdownInline(item.content), `${key}-${j}`, cwd, true)}
                {j < items.length - 1 ? "\n" : ""}
              </Fragment>
            );
          })}
        </text>
      );
    }

    case "blockquote":
      return (
        <view
          key={key}
          className="md-blockquote"
          style={{ marginLeft: Math.max(0, (block.quoteDepth ?? 1) - 1) * 14 } as any}
        >
          {block.children?.length ? (
            block.children.map((child, index) =>
              renderBlock(
                child,
                index,
                cwd,
                `${key}-quote`,
                onManualNavigation,
                onImageExpand,
                threadId,
              ),
            )
          ) : (
            <text className="md-blockquote-text">
              {renderInline(parseMarkdownInline(block.text ?? ""), key, cwd)}
            </text>
          )}
        </view>
      );

    case "table": {
      const table = block.table;
      if (!table) return <view key={key} />;
      return (
        <MarkdownTableBlock
          key={key}
          table={table}
          blockKey={key}
          cwd={cwd}
          onManualNavigation={onManualNavigation}
        />
      );
    }

    case "image": {
      return (
        <MarkdownImageBlock
          key={key}
          block={block}
          blockKey={key}
          cwd={cwd}
          onImageExpand={onImageExpand}
          threadId={threadId}
        />
      );
    }

    case "details":
      return (
        <MarkdownDetailsBlock
          key={key}
          block={block}
          blockKey={key}
          cwd={cwd}
          onManualNavigation={onManualNavigation}
          onImageExpand={onImageExpand}
          threadId={threadId}
        />
      );

    case "hr":
      return <view key={key} className="md-hr" />;

    default:
      return <view key={key} />;
  }
}

interface MarkdownRendererProps {
  text: string;
  streaming?: boolean;
  cwd?: string | undefined;
  onManualNavigation?: (() => void) | undefined;
  onImageExpand?: ((preview: ExpandedImagePreview) => void) | undefined;
  threadId?: ThreadId | undefined;
}

export function InlineMarkdownRenderer({
  text,
  cwd,
  className,
  wrapCodeWords = false,
}: {
  text: string;
  cwd?: string | undefined;
  className?: string | undefined;
  wrapCodeWords?: boolean;
}) {
  const spans = useMemo(() => parseMarkdownInline(text), [text]);
  return (
    <view className={["inline-markdown-row", className].filter(Boolean).join(" ")}>
      {spans.flatMap((span, index) => {
        const href = inlinePresentationHref(span, cwd);
        return span.code ? (
          wrapCodeWords && span.text.includes(" ") ? (
            span.text.split(/(?=\s+\S+$)/u).map((part, partIndex) => (
              <view
                key={`inline-${index}-${partIndex}`}
                className={[
                  "inline-markdown-code",
                  partIndex > 0 ? "inline-markdown-code--continuation" : undefined,
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <text className="inline-markdown-code-label">{part.trim()}</text>
              </view>
            ))
          ) : (
            <HostView
              key={`inline-${index}`}
              className={`inline-markdown-code${href ? " md-link" : ""}`}
              onClick={href ? () => activateMarkdownLink(href, cwd) : undefined}
              onContextMenu={markdownLinkContextMenuHandler(href, cwd)}
            >
              <text className="inline-markdown-code-label">{span.text}</text>
            </HostView>
          )
        ) : href ? (
          <HostView
            key={`inline-${index}`}
            className="inline-markdown-link"
            onClick={() => activateMarkdownLink(href, cwd)}
            onContextMenu={markdownLinkContextMenuHandler(href, cwd)}
          >
            <HostText
              className={`inline-markdown-text md-link${
                span.strikethrough ? " md-strikethrough" : ""
              }`}
              style={
                {
                  fontWeight: span.bold ? "700" : "400",
                  fontStyle: span.italic ? "italic" : "normal",
                } as object
              }
            >
              {span.text}
            </HostText>
          </HostView>
        ) : (
          <text
            key={`inline-${index}`}
            className={`inline-markdown-text${span.strikethrough ? " md-strikethrough" : ""}`}
            style={
              {
                fontWeight: span.bold ? "700" : "400",
                fontStyle: span.italic ? "italic" : "normal",
              } as any
            }
          >
            {span.text}
          </text>
        );
      })}
    </view>
  );
}

export function MarkdownRenderer({
  text,
  streaming,
  cwd,
  onManualNavigation,
  onImageExpand,
  threadId,
}: MarkdownRendererProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);

  return (
    <view className="markdown-body">
      {blocks.map((block, idx) =>
        renderBlock(block, idx, cwd, "b", onManualNavigation, onImageExpand, threadId),
      )}
      {streaming ? <text className="md-cursor">▋</text> : null}
    </view>
  );
}

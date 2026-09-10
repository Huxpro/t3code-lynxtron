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
  resolveMarkdownFileLinkMeta,
  type MarkdownInlinePresentation,
} from "@t3tools/client-runtime/presentation/markdown";
import { clientCapabilities, showNativeContextMenu } from "../platform/clientCapabilities.lynx";
import { uiActions } from "../state/uiState";
import { HostInlineText, HostText, HostView } from "../../../../web/src/components/ui/hostElements";
import { resolveExternalWebLinkHost } from "../../../../web/src/components/chat/externalLinkContextMenu";
import {
  parseMarkdownBlocks,
  type ParsedMarkdownBlock,
} from "@t3tools/client-runtime/presentation/markdown-blocks";
import { copyMarkdownCode } from "./markdownClipboard";
import type { MessageCopyStatus } from "./messageCopy";

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

function renderInline(
  spans: ReadonlyArray<MarkdownInlinePresentation>,
  key: string,
  cwd: string | undefined,
  inlineHost = false,
): ReactNode[] {
  return spans.map((span, index) => {
    const spanKey = `${key}-${index}`;
    const handleTap = span.href
      ? () => {
          "background only";
          activateMarkdownLink(span.href!, cwd);
        }
      : undefined;
    const handleContextMenu = markdownLinkContextMenuHandler(span.href, cwd);
    const Inline = inlineHost ? HostInlineText : HostText;
    if (span.code) {
      return (
        <Inline
          key={spanKey}
          className={`md-inline-code ${span.href ? "md-link" : ""}`}
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
  if (!spans.some((span) => span.href)) {
    return <text className="md-paragraph">{renderInline(spans, key, cwd)}</text>;
  }
  return (
    <view className="md-paragraph md-paragraph--segments" data-markdown-interactive-paragraph>
      {spans.map((span, index) => {
        const spanKey = `${key}-${index}`;
        const className = `${span.code ? "md-inline-code" : "md-inline"}${
          span.href ? " md-link" : ""
        }${span.strikethrough ? " md-strikethrough" : ""}`;
        const handleContextMenu = markdownLinkContextMenuHandler(span.href, cwd);
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
        return span.href ? (
          <HostView
            key={spanKey}
            className="md-link-hit-target"
            onClick={() => activateMarkdownLink(span.href!, cwd)}
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

function MarkdownCodeBlock({ block, blockKey }: { block: ParsedMarkdownBlock; blockKey: string }) {
  const [copyStatus, setCopyStatus] = useState<MessageCopyStatus | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setCopyStatus(null);
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    return () => {
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, [block.code]);
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
    >
      <view className="md-code-header" data-markdown-code-header="true">
        <text className="md-code-lang">{block.title ?? block.language ?? "Code"}</text>
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
      <text className="md-code-text whitespace-pre" data-markdown-code-content="true">
        {block.code}
      </text>
    </view>
  );
}

function MarkdownDetailsBlock({
  block,
  blockKey,
  cwd,
}: {
  readonly block: ParsedMarkdownBlock;
  readonly blockKey: string;
  readonly cwd: string | undefined;
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
      <view className="md-details-summary" bindtap={() => setOpen((value) => !value)}>
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
            renderBlock(child, index, cwd, `${blockKey}-detail`),
          )}
        </view>
      ) : null}
    </view>
  );
}

function renderBlock(
  block: ParsedMarkdownBlock,
  idx: number,
  cwd: string | undefined,
  keyPrefix = "b",
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
      return <MarkdownCodeBlock key={key} block={block} blockKey={key} />;

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
            block.children.map((child, index) => renderBlock(child, index, cwd, `${key}-quote`))
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
        <view key={key} className="md-table">
          <view className="md-table-row md-table-row--header">
            {table.headers.map((header, column) => (
              <text
                key={`${key}-h${column}`}
                className="md-table-cell md-table-cell--header"
                style={{ textAlign: table.alignments[column] ?? "left" } as any}
              >
                {renderInline(parseMarkdownInline(header), `${key}-h${column}`, cwd)}
              </text>
            ))}
          </view>
          {table.rows.map((row, rowIndex) => (
            <view key={`${key}-r${rowIndex}`} className="md-table-row">
              {row.map((cell, column) => (
                <text
                  key={`${key}-r${rowIndex}c${column}`}
                  className="md-table-cell"
                  style={{ textAlign: table.alignments[column] ?? "left" } as any}
                >
                  {renderInline(parseMarkdownInline(cell), `${key}-r${rowIndex}c${column}`, cwd)}
                </text>
              ))}
            </view>
          ))}
        </view>
      );
    }

    case "image": {
      const href = block.href ?? "";
      const supportedSource = /^(?:https?:|data:image\/)/i.test(href);
      return supportedSource ? (
        <view key={key} className="md-image-frame" data-markdown-image="true">
          <image className="md-image" src={href} mode="aspectFit" />
          {block.alt ? <text className="md-image-caption">{block.alt}</text> : null}
        </view>
      ) : (
        <view key={key} className="md-media-fallback" data-markdown-image-fallback="true">
          <text className="md-media-fallback-label">{block.alt || "Image"}</text>
          <text className="md-media-fallback-path">{href}</text>
        </view>
      );
    }

    case "details":
      return <MarkdownDetailsBlock key={key} block={block} blockKey={key} cwd={cwd} />;

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
      {spans.flatMap((span, index) =>
        span.code ? (
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
            <view key={`inline-${index}`} className="inline-markdown-code">
              <text className="inline-markdown-code-label">{span.text}</text>
            </view>
          )
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
        ),
      )}
    </view>
  );
}

export function MarkdownRenderer({ text, streaming, cwd }: MarkdownRendererProps) {
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text]);

  return (
    <view className="markdown-body">
      {blocks.map((block, idx) => renderBlock(block, idx, cwd))}
      {streaming ? <text className="md-cursor">▋</text> : null}
    </view>
  );
}

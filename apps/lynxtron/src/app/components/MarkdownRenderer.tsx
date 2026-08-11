import { useCallback, useEffect, useMemo, useState, type ReactNode } from "@lynx-js/react";
import {
  parseMarkdownInline,
  resolveMarkdownFileLinkMeta,
  type MarkdownInlinePresentation,
} from "@t3tools/client-runtime/presentation/markdown";
import { clientCapabilities } from "../platform/clientCapabilities";
import { parseMarkdownBlocks, type ParsedMarkdownBlock } from "./markdownBlocks";
import { copyMarkdownCode } from "./markdownClipboard";

// Simple markdown-to-Lynx-views renderer. Handles the most common
// formatting used in AI assistant responses.

function activateMarkdownLink(href: string, cwd: string | undefined): void {
  "background only";
  const fileLink = resolveMarkdownFileLinkMeta(href, cwd);
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

function renderInline(
  spans: ReadonlyArray<MarkdownInlinePresentation>,
  key: string,
  cwd: string | undefined,
): ReactNode[] {
  return spans.map((span, index) => {
    const spanKey = `${key}-${index}`;
    const handleTap = span.href
      ? () => {
          "background only";
          activateMarkdownLink(span.href!, cwd);
        }
      : undefined;
    if (span.code) {
      return (
        <text
          key={spanKey}
          className={`md-inline-code ${span.href ? "md-link" : ""}`}
          bindtap={handleTap}
        >
          {span.text}
        </text>
      );
    }
    return (
      <text
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
        bindtap={handleTap}
      >
        {span.text}
      </text>
    );
  });
}

function MarkdownCodeBlock({ block, blockKey }: { block: ParsedMarkdownBlock; blockKey: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [block.code]);
  const handleCopy = useCallback(() => {
    "background only";
    void copyMarkdownCode(block.code ?? "", clientCapabilities.clipboard)
      .then((didCopy) => {
        if (didCopy) setCopied(true);
      })
      .catch((cause) => {
        console.error("[lynx-markdown] failed to copy code block", { cause });
      });
  }, [block.code]);

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
          data-markdown-code-copy-state={copied ? "copied" : "idle"}
          aria-label={copied ? "Code copied" : "Copy code"}
          bindtap={handleCopy}
        >
          <text className="md-code-copy-label">{copied ? "Copied" : "Copy"}</text>
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
  return (
    <view
      className="md-details"
      data-markdown-details="true"
      data-markdown-details-open={open ? "true" : "false"}
    >
      <view className="md-details-summary" bindtap={() => setOpen((value) => !value)}>
        <text className={`md-details-chevron${open ? " md-details-chevron--open" : ""}`}>›</text>
        <text className="md-details-label">
          {renderInline(parseMarkdownInline(block.summary ?? "Details"), `${blockKey}-summary`, cwd)}
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
      return (
        <text key={key} className="md-paragraph">
          {renderInline(parseMarkdownInline(block.text ?? ""), key, cwd)}
        </text>
      );

    case "code":
      return <MarkdownCodeBlock key={key} block={block} blockKey={key} />;

    case "list": {
      const items = block.items ?? [];
      return (
        <view key={key} className="md-list">
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
              <view key={`${key}-${j}`} className="md-list-item">
                <text className="md-list-bullet" style={{ marginLeft: item.depth * 18 } as any}>
                  {marker}
                </text>
                <text className="md-list-text">
                  {renderInline(parseMarkdownInline(item.content), `${key}-${j}`, cwd)}
                </text>
              </view>
            );
          })}
        </view>
      );
    }

    case "blockquote":
      return (
        <view
          key={key}
          className="md-blockquote"
          style={{ marginLeft: Math.max(0, (block.quoteDepth ?? 1) - 1) * 14 } as any}
        >
          <text className="md-blockquote-text">
            {renderInline(parseMarkdownInline(block.text ?? ""), key, cwd)}
          </text>
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
            className={`inline-markdown-text${
              span.strikethrough ? " md-strikethrough" : ""
            }`}
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

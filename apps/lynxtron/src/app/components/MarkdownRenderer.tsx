import { useCallback, useEffect, useMemo, useState, type ReactNode } from "@lynx-js/react";
import {
  parseMarkdownFenceInfo,
  parseMarkdownInline,
  parseMarkdownImage,
  parseMarkdownListItem,
  parseMarkdownTable,
  resolveMarkdownFileLinkMeta,
  type MarkdownInlinePresentation,
  type MarkdownImagePresentation,
  type MarkdownListItemPresentation,
  type MarkdownTablePresentation,
} from "@t3tools/client-runtime/presentation/markdown";
import { clientCapabilities } from "../platform/clientCapabilities";

// Simple markdown-to-Lynx-views renderer. Handles the most common
// formatting used in AI assistant responses.

interface ParsedBlock {
  type:
    | "heading"
    | "paragraph"
    | "image"
    | "code"
    | "list"
    | "blockquote"
    | "table"
    | "hr"
    | "empty";
  level?: number; // heading level
  items?: MarkdownListItemPresentation[]; // list items
  text?: string; // paragraph or blockquote text
  code?: string; // code block content
  language?: string; // code block language
  title?: string; // code block filename/title
  quoteDepth?: number;
  table?: MarkdownTablePresentation;
  image?: MarkdownImagePresentation;
}

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
  return spans.map((span, i) => {
    const spanKey = `${key}-${i}`;
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
    const fontWeight = span.bold ? "700" : "400";
    const fontStyle = span.italic ? "italic" : "normal";
    return (
      <text
        key={spanKey}
        className={`md-inline ${span.href ? "md-link" : ""}`}
        style={{ fontWeight, fontStyle } as any}
        bindtap={handleTap}
      >
        {span.text}
      </text>
    );
  });
}

function parseBlocks(text: string): ParsedBlock[] {
  const lines = text.split("\n");
  const blocks: ParsedBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i]!;

    // Empty line
    if (line.trim() === "") {
      blocks.push({ type: "empty" });
      i++;
      continue;
    }

    // Code block
    if (line.trim().startsWith("```")) {
      const fence = parseMarkdownFenceInfo(line.trim().slice(3));
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith("```")) {
        codeLines.push(lines[i]!);
        i++;
      }
      i++; // skip closing ```
      blocks.push({
        type: "code",
        language: fence.rawLanguage ? fence.language : undefined,
        title: fence.title ?? undefined,
        code: codeLines.join("\n"),
      });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1]!.length,
        text: headingMatch[2]!,
      });
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    // Blockquote, including nested quote markers.
    const quoteMatch = line.match(/^((?:>\s*)+)(.*)$/);
    if (quoteMatch) {
      const quoteDepth = quoteMatch[1]!.match(/>/g)?.length ?? 1;
      const quoteLines: string[] = [];
      while (i < lines.length) {
        const nestedMatch = lines[i]!.match(/^((?:>\s*)+)(.*)$/);
        const nestedDepth = nestedMatch?.[1]?.match(/>/g)?.length ?? 0;
        if (!nestedMatch || nestedDepth !== quoteDepth) break;
        quoteLines.push(nestedMatch[2] ?? "");
        i++;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join("\n"), quoteDepth });
      continue;
    }

    // GFM table
    const table = parseMarkdownTable(lines.slice(i));
    if (table) {
      blocks.push({ type: "table", table });
      i += table.rows.length + 2;
      continue;
    }

    const image = parseMarkdownImage(line);
    if (image) {
      blocks.push({ type: "image", image });
      i++;
      continue;
    }

    // List
    if (parseMarkdownListItem(line)) {
      const items: MarkdownListItemPresentation[] = [];
      while (i < lines.length) {
        const item = parseMarkdownListItem(lines[i]!);
        if (!item) break;
        items.push(item);
        i++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    // Paragraph (collect consecutive non-empty, non-special lines)
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i]!.trim() !== "" &&
      !lines[i]!.trim().startsWith("```") &&
      !lines[i]!.match(/^(#{1,6})\s/) &&
      !lines[i]!.match(/^((?:>\s*)+)(.*)$/) &&
      !parseMarkdownTable(lines.slice(i)) &&
      !parseMarkdownImage(lines[i]!) &&
      !parseMarkdownListItem(lines[i]!) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[i]!.trim())
    ) {
      paraLines.push(lines[i]!);
      i++;
    }
    blocks.push({ type: "paragraph", text: paraLines.join("\n") });
  }

  return blocks;
}

function MarkdownCodeBlock({ block, blockKey }: { block: ParsedBlock; blockKey: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => setCopied(false), [block.code]);
  const handleCopy = useCallback(() => {
    "background only";
    if (!clientCapabilities.clipboard.available()) return;
    void clientCapabilities.clipboard
      .writeText(block.code ?? "")
      .then(() => setCopied(true))
      .catch((cause) => {
        console.error("[lynx-markdown] failed to copy code block", { cause });
      });
  }, [block.code]);

  return (
    <view
      key={blockKey}
      className="md-code-block"
      data-code-length={String((block.code ?? "").length)}
      data-copy-state={copied ? "copied" : "idle"}
    >
      <view className="md-code-header">
        <text className="md-code-lang">{block.title ?? block.language ?? "Code"}</text>
        <text className="md-code-copy" bindtap={handleCopy}>
          {copied ? "Copied" : "Copy"}
        </text>
      </view>
      <text className="md-code-text">{block.code}</text>
    </view>
  );
}

function renderBlock(block: ParsedBlock, idx: number, cwd: string | undefined): ReactNode {
  const key = `b${idx}`;
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

    case "image": {
      const image = block.image;
      if (!image) return <view key={key} />;
      if (/^(?:https?:|data:)/i.test(image.src)) {
        return (
          <view key={key} className="md-image-block">
            <image className="md-image" src={image.src} mode="aspectFit" />
            {image.alt ? <text className="md-image-caption">{image.alt}</text> : null}
          </view>
        );
      }
      return (
        <view key={key} className="md-image-fallback">
          <text className="md-image-fallback-label">Image: {image.alt || "Untitled"}</text>
          <text className="md-image-fallback-source">{image.src}</text>
        </view>
      );
    }

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

export function MarkdownRenderer({ text, streaming, cwd }: MarkdownRendererProps) {
  const blocks = useMemo(() => parseBlocks(text), [text]);

  return (
    <view className="markdown-body">
      {blocks.map((block, idx) => renderBlock(block, idx, cwd))}
      {streaming ? <text className="md-cursor">▋</text> : null}
    </view>
  );
}

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "@lynx-js/react";
import {
  parseMarkdownFenceInfo,
  parseMarkdownInline,
  parseMarkdownListItem,
  resolveMarkdownFileLinkMeta,
  type MarkdownInlinePresentation,
  type MarkdownListItemPresentation,
} from "@t3tools/client-runtime/presentation/markdown";
import { clientCapabilities } from "../platform/clientCapabilities";

// Simple markdown-to-Lynx-views renderer. Handles the most common
// formatting used in AI assistant responses.

interface ParsedBlock {
  type: "heading" | "paragraph" | "code" | "list" | "blockquote" | "hr" | "empty";
  level?: number; // heading level
  items?: MarkdownListItemPresentation[]; // list items
  text?: string; // paragraph or blockquote text
  code?: string; // code block content
  language?: string; // code block language
  title?: string; // code block filename/title
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

    // Blockquote
    if (line.startsWith("> ")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i]!.startsWith("> ")) {
        quoteLines.push(lines[i]!.slice(2));
        i++;
      }
      blocks.push({ type: "blockquote", text: quoteLines.join("\n") });
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
      !lines[i]!.startsWith("> ") &&
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
    <view key={blockKey} className="md-code-block">
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
                <text className="md-list-bullet">{marker}</text>
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
        <view key={key} className="md-blockquote">
          <text className="md-blockquote-text">
            {renderInline(parseMarkdownInline(block.text ?? ""), key, cwd)}
          </text>
        </view>
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

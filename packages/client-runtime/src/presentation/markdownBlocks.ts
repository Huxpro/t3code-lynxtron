import {
  parseMarkdownFenceInfo,
  parseMarkdownListItem,
  parseMarkdownTable,
  type MarkdownListItemPresentation,
  type MarkdownTablePresentation,
} from "./markdown.ts";

export interface ParsedMarkdownBlock {
  type:
    | "heading"
    | "paragraph"
    | "code"
    | "list"
    | "blockquote"
    | "table"
    | "image"
    | "details"
    | "hr"
    | "empty";
  level?: number;
  items?: MarkdownListItemPresentation[];
  text?: string;
  code?: string;
  language?: string;
  title?: string;
  quoteDepth?: number;
  table?: MarkdownTablePresentation;
  href?: string;
  alt?: string;
  open?: boolean;
  summary?: string;
  children?: ParsedMarkdownBlock[];
}

interface MarkdownFence {
  readonly character: "`" | "~";
  readonly length: number;
  readonly info: string;
}

function parseMarkdownFence(line: string): MarkdownFence | null {
  const match = line.trim().match(/^(`{3,}|~{3,})(.*)$/);
  if (!match) return null;
  const marker = match[1]!;
  return {
    character: marker[0] as "`" | "~",
    length: marker.length,
    info: match[2]!.trim(),
  };
}

function closesMarkdownFence(line: string, opening: MarkdownFence): boolean {
  const match = line.trim().match(/^(`+|~+)\s*$/);
  if (!match) return false;
  const marker = match[1]!;
  return marker[0] === opening.character && marker.length >= opening.length;
}

const MARKDOWN_IMAGE_PATTERN = /!\[([^\]]*)]\((\S+?)(?:\s+["']([^"']*)["'])?\)/g;

function appendParagraphWithImages(blocks: ParsedMarkdownBlock[], text: string): void {
  let cursor = 0;
  for (const match of text.matchAll(MARKDOWN_IMAGE_PATTERN)) {
    const start = match.index ?? 0;
    const before = text.slice(cursor, start);
    if (before.length > 0) blocks.push({ type: "paragraph", text: before });
    blocks.push({
      type: "image",
      alt: match[1] ?? "",
      href: match[2]!,
      title: match[3],
    });
    cursor = start + match[0].length;
  }
  const after = text.slice(cursor);
  if (after.length > 0 || cursor === 0) blocks.push({ type: "paragraph", text: after });
}

export function shouldRenderBlockMarkdown(text: string): boolean {
  if (text.includes("\n")) return true;
  const trimmed = text.trim();
  return (
    parseMarkdownFence(trimmed) !== null ||
    /^(?:#{1,6}\s+|(?:>\s*)+|(?:[-+*]|\d+[.)])\s+|(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(trimmed) ||
    /!\[[^\]]*]\(\S+?(?:\s+["'][^"']*["'])?\)/.test(trimmed) ||
    /^<details(?:\s|>)/i.test(trimmed)
  );
}

export function parseMarkdownBlocks(text: string): ParsedMarkdownBlock[] {
  const lines = text.split("\n");
  const blocks: ParsedMarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]!;
    if (line.trim() === "") {
      blocks.push({ type: "empty" });
      index++;
      continue;
    }

    const openingFence = parseMarkdownFence(line);
    if (openingFence) {
      const fence = parseMarkdownFenceInfo(openingFence.info);
      const codeLines: string[] = [];
      index++;
      while (index < lines.length && !closesMarkdownFence(lines[index]!, openingFence)) {
        codeLines.push(lines[index]!);
        index++;
      }
      if (index < lines.length) index++;
      blocks.push({
        type: "code",
        language: fence.rawLanguage ? fence.language : undefined,
        title: fence.title ?? undefined,
        code: codeLines.join("\n"),
      });
      continue;
    }

    const setextLevel = lines[index + 1]?.trim().match(/^(=+|-+)$/)?.[1]?.[0];
    if (line.trim().length > 0 && setextLevel) {
      blocks.push({
        type: "heading",
        level: setextLevel === "=" ? 1 : 2,
        text: line.trim(),
      });
      index += 2;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})(?:\s+(.*?))?\s*#*\s*$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1]!.length,
        text: headingMatch[2]?.replace(/\s+#+\s*$/, "") ?? "",
      });
      index++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      index++;
      continue;
    }

    const imageMatch = line.trim().match(/^!\[([^\]]*)]\((\S+?)(?:\s+["']([^"']*)["'])?\)\s*$/);
    if (imageMatch) {
      blocks.push({
        type: "image",
        alt: imageMatch[1] ?? "",
        href: imageMatch[2]!,
        title: imageMatch[3],
      });
      index++;
      continue;
    }

    const inlineDetailsMatch = line
      .trim()
      .match(/^<details(\s+open)?\s*>\s*<summary>(.*?)<\/summary>\s*(.*?)\s*<\/details>\s*$/i);
    if (inlineDetailsMatch) {
      const body = inlineDetailsMatch[3] ?? "";
      blocks.push({
        type: "details",
        open: Boolean(inlineDetailsMatch[1]),
        summary: inlineDetailsMatch[2] || "Details",
        children: body ? parseMarkdownBlocks(body) : [],
      });
      index++;
      continue;
    }

    const detailsMatch = line.trim().match(/^<details(?:\s+open)?\s*>$/i);
    if (detailsMatch) {
      const open = /\sopen(?:\s|>)/i.test(line);
      const detailLines: string[] = [];
      let summary = "Details";
      index++;
      if (index < lines.length) {
        const summaryMatch = lines[index]!.trim().match(/^<summary>(.*)<\/summary>$/i);
        if (summaryMatch) {
          summary = summaryMatch[1] || "Details";
          index++;
        }
      }
      while (index < lines.length && !/^<\/details>\s*$/i.test(lines[index]!.trim())) {
        detailLines.push(lines[index]!);
        index++;
      }
      if (index < lines.length) index++;
      blocks.push({
        type: "details",
        open,
        summary,
        children: parseMarkdownBlocks(detailLines.join("\n")),
      });
      continue;
    }

    const quoteMatch = line.match(/^((?:>\s*)+)(.*)$/);
    if (quoteMatch) {
      const quoteDepth = quoteMatch[1]!.match(/>/g)?.length ?? 1;
      const quoteLines: string[] = [];
      while (index < lines.length) {
        const nestedMatch = lines[index]!.match(/^((?:>\s*)+)(.*)$/);
        const nestedDepth = nestedMatch?.[1]?.match(/>/g)?.length ?? 0;
        if (!nestedMatch || nestedDepth !== quoteDepth) break;
        quoteLines.push(nestedMatch[2] ?? "");
        index++;
      }
      const quoteText = quoteLines.join("\n");
      blocks.push({
        type: "blockquote",
        text: quoteText,
        quoteDepth,
        children: parseMarkdownBlocks(quoteText),
      });
      continue;
    }

    const table = parseMarkdownTable(lines.slice(index));
    if (table) {
      blocks.push({ type: "table", table });
      index += table.rows.length + 2;
      continue;
    }

    if (parseMarkdownListItem(line)) {
      const items: MarkdownListItemPresentation[] = [];
      while (index < lines.length) {
        const item = parseMarkdownListItem(lines[index]!);
        if (!item) break;
        index++;
        const continuationLines: string[] = [];
        while (
          index < lines.length &&
          lines[index]!.trim().length > 0 &&
          !parseMarkdownListItem(lines[index]!) &&
          /^\s+/.test(lines[index]!) &&
          !parseMarkdownFence(lines[index]!)
        ) {
          continuationLines.push(lines[index]!.trim());
          index++;
        }
        items.push({
          ...item,
          content: [item.content, ...continuationLines].join("\n"),
        });
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index]!.trim() !== "" &&
      !parseMarkdownFence(lines[index]!) &&
      !(lines[index + 1]?.trim().match(/^(=+|-+)$/) && lines[index]!.trim().length > 0) &&
      !lines[index]!.match(/^(#{1,6})(?:\s|$)/) &&
      !lines[index]!.match(/^((?:>\s*)+)(.*)$/) &&
      !lines[index]!.trim().match(/^!\[([^\]]*)]\((\S+?)(?:\s+["']([^"']*)["'])?\)\s*$/) &&
      !lines[index]!.trim().match(/^<details(?:\s+open)?\s*>/i) &&
      !parseMarkdownTable(lines.slice(index)) &&
      !parseMarkdownListItem(lines[index]!) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[index]!.trim())
    ) {
      paragraphLines.push(lines[index]!);
      index++;
    }
    appendParagraphWithImages(blocks, paragraphLines.join("\n"));
  }

  return blocks;
}

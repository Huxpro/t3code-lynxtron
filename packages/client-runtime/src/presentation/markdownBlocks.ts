import {
  normalizeMarkdownVisibleText,
  parseMarkdownFenceInfo,
  parseMarkdownImageTokens,
  parseMarkdownListItem,
  parseMarkdownTable,
  type MarkdownListItemPresentation,
  type MarkdownTablePresentation,
} from "./markdown.ts";

const DETAILS_OPEN_TAG_PATTERN = /^<details(?:\s+open(?:=(?:""|'open'|"open"|open))?)?\s*>$/i;
const DETAILS_OPEN_ATTRIBUTE_PATTERN = /\sopen(?:=(?:""|'open'|"open"|open))?(?=\s|>)/i;

function normalizeDetailsSummary(summary: string | undefined): string {
  if (!summary) return "Details";
  return normalizeMarkdownVisibleText(summary)
    .replace(/<\/?strong(?:\s[^>]*)?>/gi, "**")
    .replace(/<\/?em(?:\s[^>]*)?>/gi, "_")
    .replace(/<\/?del(?:\s[^>]*)?>/gi, "~~")
    .replace(/<\/?code(?:\s[^>]*)?>/gi, "`");
}

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

function appendParagraphWithImages(blocks: ParsedMarkdownBlock[], text: string): void {
  let cursor = 0;
  for (const image of parseMarkdownImageTokens(text)) {
    const before = text.slice(cursor, image.start);
    if (before.length > 0) blocks.push({ type: "paragraph", text: before });
    blocks.push({
      type: "image",
      alt: image.alt,
      href: image.href,
      title: image.title,
    });
    cursor = image.end;
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
    parseMarkdownImageTokens(trimmed).length > 0 ||
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

    const trimmedLine = line.trim();
    const [standaloneImage] = parseMarkdownImageTokens(trimmedLine);
    if (standaloneImage?.start === 0 && standaloneImage.end === trimmedLine.length) {
      blocks.push({
        type: "image",
        alt: standaloneImage.alt,
        href: standaloneImage.href,
        ...(standaloneImage.title !== undefined ? { title: standaloneImage.title } : {}),
      });
      index++;
      continue;
    }

    const inlineDetailsMatch = line
      .trim()
      .match(
        /^<details(\s+open(?:=(?:""|'open'|"open"|open))?)?\s*>\s*<summary>(.*?)<\/summary>\s*(.*?)\s*<\/details>\s*$/i,
      );
    if (inlineDetailsMatch) {
      const body = inlineDetailsMatch[3] ?? "";
      blocks.push({
        type: "details",
        open: Boolean(inlineDetailsMatch[1]),
        summary: normalizeDetailsSummary(inlineDetailsMatch[2]),
        children: body ? parseMarkdownBlocks(body) : [],
      });
      index++;
      continue;
    }

    const detailsMatch = line.trim().match(DETAILS_OPEN_TAG_PATTERN);
    if (detailsMatch) {
      const open = DETAILS_OPEN_ATTRIBUTE_PATTERN.test(line);
      const detailLines: string[] = [];
      let summary = "Details";
      index++;
      if (index < lines.length) {
        const summaryMatch = lines[index]!.trim().match(/^<summary>(.*)<\/summary>$/i);
        if (summaryMatch) {
          summary = normalizeDetailsSummary(summaryMatch[1]);
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
      !(() => {
        const trimmed = lines[index]!.trim();
        const [image] = parseMarkdownImageTokens(trimmed);
        return image?.start === 0 && image.end === trimmed.length;
      })() &&
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

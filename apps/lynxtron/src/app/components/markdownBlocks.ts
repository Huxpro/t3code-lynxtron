import {
  parseMarkdownFenceInfo,
  parseMarkdownListItem,
  parseMarkdownTable,
  type MarkdownListItemPresentation,
  type MarkdownTablePresentation,
} from "@t3tools/client-runtime/presentation/markdown";

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

export function shouldRenderBlockMarkdown(text: string): boolean {
  if (text.includes("\n")) return true;
  const trimmed = text.trim();
  return (
    parseMarkdownFence(trimmed) !== null ||
    /^(?:#{1,6}\s+|(?:>\s*)+|(?:[-+*]|\d+[.)])\s+|(?:-{3,}|\*{3,}|_{3,})\s*$)/.test(
      trimmed,
    ) ||
    /^!\[[^\]]*]\([^)]+\)$/.test(trimmed) ||
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

    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        level: headingMatch[1]!.length,
        text: headingMatch[2]!,
      });
      index++;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line.trim())) {
      blocks.push({ type: "hr" });
      index++;
      continue;
    }

    const imageMatch = line
      .trim()
      .match(/^!\[([^\]]*)]\((\S+?)(?:\s+["']([^"']*)["'])?\)\s*$/);
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
      blocks.push({ type: "blockquote", text: quoteLines.join("\n"), quoteDepth });
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
        items.push(item);
        index++;
      }
      blocks.push({ type: "list", items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (
      index < lines.length &&
      lines[index]!.trim() !== "" &&
      !parseMarkdownFence(lines[index]!) &&
      !lines[index]!.match(/^(#{1,6})\s/) &&
      !lines[index]!.match(/^((?:>\s*)+)(.*)$/) &&
      !lines[index]!.trim().match(/^!\[([^\]]*)]\((\S+?)(?:\s+["']([^"']*)["'])?\)\s*$/) &&
      !lines[index]!.trim().match(/^<details(?:\s+open)?\s*>$/i) &&
      !parseMarkdownTable(lines.slice(index)) &&
      !parseMarkdownListItem(lines[index]!) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[index]!.trim())
    ) {
      paragraphLines.push(lines[index]!);
      index++;
    }
    blocks.push({ type: "paragraph", text: paragraphLines.join("\n") });
  }

  return blocks;
}

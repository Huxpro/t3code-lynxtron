export interface CommandPaletteSearchQuery {
  readonly actionsOnly: boolean;
  readonly normalizedQuery: string;
}

export interface CommandPaletteThreadPresentationInput {
  readonly id: string;
  readonly title: string;
  readonly branch?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly latestUserMessageAt?: string | null;
}

export function projectCommandPaletteThread(input: {
  readonly thread: CommandPaletteThreadPresentationInput;
  readonly projectTitle?: string | null;
  readonly activeThreadId?: string | null;
  readonly now?: number;
  readonly formatTimestamp: (isoDate: string, nowMs: number) => string;
}) {
  const { thread } = input;
  const descriptionParts = [input.projectTitle?.trim() ?? ""];
  if (thread.branch) descriptionParts.push(`#${thread.branch}`);
  if (thread.id === input.activeThreadId) descriptionParts.push("Current thread");
  return {
    title: thread.title || "Untitled thread",
    description: descriptionParts.filter(Boolean).join(" · "),
    timestamp: input.formatTimestamp(
      thread.latestUserMessageAt ?? thread.updatedAt ?? thread.createdAt,
      input.now ?? Date.now(),
    ),
    searchTerms: [thread.title, input.projectTitle ?? "", thread.branch ?? ""],
  };
}

export function normalizeCommandPaletteSearchText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/gu, " ");
}

export function parseCommandPaletteSearchQuery(query: string): CommandPaletteSearchQuery {
  const actionsOnly = query.startsWith(">");
  return {
    actionsOnly,
    normalizedQuery: normalizeCommandPaletteSearchText(actionsOnly ? query.slice(1) : query),
  };
}

function rankSearchFieldMatch(field: string, normalizedQuery: string): number | null {
  const normalizedField = normalizeCommandPaletteSearchText(field);
  if (normalizedField.length === 0 || !normalizedField.includes(normalizedQuery)) {
    return null;
  }
  if (normalizedField === normalizedQuery) return 3;
  if (normalizedField.startsWith(normalizedQuery)) return 2;
  return 1;
}

/**
 * Rank renderer-owned command/search rows using the same title-first,
 * context-second policy on every client. Original order is the stable
 * tiebreaker.
 */
export function rankCommandPaletteSearchItems<T>(
  items: ReadonlyArray<T>,
  normalizedQuery: string,
  getSearchTerms: (item: T) => ReadonlyArray<string>,
): T[] {
  if (normalizedQuery.length === 0) return [...items];

  return items
    .flatMap((item, index) => {
      const terms = getSearchTerms(item);
      const matchingFieldIndex = terms.findIndex(
        (term) => rankSearchFieldMatch(term, normalizedQuery) !== null,
      );
      if (matchingFieldIndex < 0) return [];
      const fieldRank = rankSearchFieldMatch(terms[matchingFieldIndex]!, normalizedQuery) ?? 0;
      return [
        {
          item,
          index,
          rank: 1_000 - matchingFieldIndex * 100 + fieldRank,
        },
      ];
    })
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map((entry) => entry.item);
}

import {
  insertRankedSearchResult,
  normalizeSearchQuery,
  scoreQueryMatch,
} from "@t3tools/shared/searchRanking";

import type { ServerProviderSkill } from "@t3tools/contracts";

import { scoreProviderSkill } from "../../providerSkillSearch";

/**
 * Structural slash-menu item: Web's ComposerCommandMenu items and Lynx's
 * composer items both satisfy it, so both clients rank with one function.
 */
export type SlashSearchItem =
  | { readonly type: "slash-command"; readonly command: string; readonly description: string }
  | {
      readonly type: "provider-slash-command";
      readonly provider: string;
      readonly command: { readonly name: string };
      readonly description: string;
    }
  | {
      readonly type: "skill";
      readonly provider: string;
      readonly skill: ServerProviderSkill;
      readonly description: string;
    };

function scoreSlashCommandItem(item: SlashSearchItem, query: string): number | null {
  if (item.type === "skill") {
    const skillQuery =
      query === "skill" ? "" : query.startsWith("skill:") ? query.slice("skill:".length) : query;
    return skillQuery ? scoreProviderSkill(item.skill, skillQuery) : 0;
  }

  const primaryValue =
    item.type === "slash-command" ? item.command.toLowerCase() : item.command.name.toLowerCase();
  const description = item.description.toLowerCase();

  const scores = [
    scoreQueryMatch({
      value: primaryValue,
      query,
      exactBase: 0,
      prefixBase: 2,
      boundaryBase: 4,
      includesBase: 6,
      fuzzyBase: 100,
      boundaryMarkers: ["-", "_", "/"],
    }),
    scoreQueryMatch({
      value: description,
      query,
      exactBase: 20,
      prefixBase: 22,
      boundaryBase: 24,
      includesBase: 26,
    }),
  ].filter((score): score is number => score !== null);

  if (scores.length === 0) {
    return null;
  }

  return Math.min(...scores);
}

export function searchSlashCommandItems<T extends SlashSearchItem>(
  items: ReadonlyArray<T>,
  query: string,
): T[] {
  const normalizedQuery = normalizeSearchQuery(query, { trimLeadingPattern: /^\/+/ });
  if (!normalizedQuery) {
    return [...items];
  }

  const ranked: Array<{
    item: T;
    score: number;
    tieBreaker: string;
  }> = [];

  for (const item of items) {
    const score = scoreSlashCommandItem(item, normalizedQuery);
    if (score === null) {
      continue;
    }

    insertRankedSearchResult(
      ranked,
      {
        item,
        score,
        tieBreaker:
          item.type === "slash-command"
            ? `0\u0000${item.command}`
            : item.type === "provider-slash-command"
              ? `1\u0000${item.command.name}\u0000${item.provider}`
              : `2\u0000${item.skill.name}\u0000${item.provider}`,
      },
      Number.POSITIVE_INFINITY,
    );
  }

  return ranked.map((entry) => entry.item);
}

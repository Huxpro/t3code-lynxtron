import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";

export interface ComposerFileContext {
  readonly id: string;
  readonly path: string;
}

export type ComposerFileContextsByScopeKey = Readonly<
  Record<string, ReadonlyArray<ComposerFileContext>>
>;

export const MAX_FILE_CONTEXTS_PER_SCOPE = 20;
const VALID_SCOPE_KEY = /^(?:thread|project):.+/u;

export function composerFileContext(path: string): ComposerFileContext | null {
  const normalized = path.trim();
  return normalized ? { id: normalized, path: normalized } : null;
}

export function normalizeComposerFileContextsByScopeKey(
  value: unknown,
): ComposerFileContextsByScopeKey {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([scopeKey, contexts]) => {
      if (!VALID_SCOPE_KEY.test(scopeKey) || !Array.isArray(contexts)) return [];
      const normalized = contexts
        .map((context) =>
          typeof context === "object" && context !== null && "path" in context
            ? composerFileContext(String(context.path))
            : null,
        )
        .filter((context): context is ComposerFileContext => context !== null);
      const unique = [
        ...new Map(normalized.map((context) => [context.id, context])).values(),
      ].slice(-MAX_FILE_CONTEXTS_PER_SCOPE);
      return unique.length > 0 ? [[scopeKey, unique]] : [];
    }),
  );
}

export function appendFileContextsToPrompt(
  prompt: string,
  contexts: ReadonlyArray<ComposerFileContext>,
): string {
  const mentions = contexts.map((context) => serializeComposerFileLink(context.path)).join(" ");
  const trimmed = prompt.trim();
  if (!mentions) return trimmed;
  return trimmed ? `${trimmed} ${mentions}` : mentions;
}

export const BROWSER_TABS_STORAGE_KEY = "t3code:lynxtron-browser-tabs:v1";
const MAX_TABS_PER_THREAD = 20;

interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PersistedBrowserTab {
  readonly tabId: string;
  readonly url: string;
  readonly title: string;
}

type PersistedBrowserState = Record<string, ReadonlyArray<PersistedBrowserTab>>;

function safeString(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeUrl(value: unknown): string {
  const raw = safeString(value, 8_192);
  return /^https?:\/\/[^\s]+$/iu.test(raw) ? raw : "";
}

function readAll(storage: BrowserStorage): PersistedBrowserState {
  const raw = storage.getItem(BROWSER_TABS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([threadId, value]) => {
        if (!Array.isArray(value)) return [];
        const seen = new Set<string>();
        const tabs = value.slice(0, MAX_TABS_PER_THREAD).flatMap<PersistedBrowserTab>((entry) => {
          if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
          const candidate = entry as Record<string, unknown>;
          const tabId = safeString(candidate.tabId, 128);
          if (!tabId || seen.has(tabId)) return [];
          seen.add(tabId);
          const url = safeUrl(candidate.url);
          return [{ tabId, url, title: safeString(candidate.title, 200) || url || "Browser" }];
        });
        return tabs.length > 0 ? [[threadId, tabs]] : [];
      }),
    );
  } catch {
    return {};
  }
}

export function readBrowserTab(
  storage: BrowserStorage,
  threadId: string | null,
  tabId: string,
): PersistedBrowserTab {
  const fallback = { tabId, url: "", title: "Browser" };
  if (!threadId) return fallback;
  return readAll(storage)[threadId]?.find((tab) => tab.tabId === tabId) ?? fallback;
}

export function storeBrowserTab(
  storage: BrowserStorage,
  threadId: string | null,
  tab: PersistedBrowserTab,
): void {
  if (!threadId) return;
  const all = readAll(storage);
  const current = all[threadId] ?? [];
  const tabs = [tab, ...current.filter((entry) => entry.tabId !== tab.tabId)].slice(
    0,
    MAX_TABS_PER_THREAD,
  );
  storage.setItem(BROWSER_TABS_STORAGE_KEY, JSON.stringify({ ...all, [threadId]: tabs }));
}

export const __testing = { MAX_TABS_PER_THREAD };

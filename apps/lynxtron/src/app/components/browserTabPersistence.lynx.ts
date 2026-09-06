export const BROWSER_TABS_STORAGE_KEY = "t3code:lynxtron-browser-tabs:v1";
const MAX_TABS_PER_THREAD = 20;
const MAX_HISTORY_PER_THREAD = 12;

interface BrowserStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PersistedBrowserTab {
  readonly tabId: string;
  readonly url: string;
  readonly title: string;
  readonly faviconUrl?: string;
}

export interface PersistedBrowserHistoryEntry {
  readonly tabId: string;
  readonly url: string;
  readonly title: string;
}

export interface PersistedBrowserTabsState {
  readonly activeTabId: string;
  readonly tabs: ReadonlyArray<PersistedBrowserTab>;
  readonly recentHistory: ReadonlyArray<PersistedBrowserHistoryEntry>;
}

type PersistedBrowserState = Record<string, PersistedBrowserTabsState>;

function safeString(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function safeUrl(value: unknown): string | null {
  const raw = safeString(value, 8_192);
  if (!raw) return "";
  if (raw === "about:blank") return raw;
  return /^https?:\/\/[^\s]+$/iu.test(raw) ? raw : null;
}

function defaultTab(tabId: string): PersistedBrowserTab {
  return { tabId, url: "", title: "Browser", faviconUrl: "" };
}

function parseTab(value: unknown): PersistedBrowserTab | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  const tabId = safeString(candidate.tabId ?? candidate.id, 128);
  const url = safeUrl(candidate.url);
  if (!tabId || url === null) return null;
  return {
    tabId,
    url,
    title: safeString(candidate.title, 200) || url || "Browser",
    faviconUrl: safeUrl(candidate.faviconUrl) ?? "",
  };
}

function parseTabs(value: unknown): PersistedBrowserTab[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, MAX_TABS_PER_THREAD).flatMap((entry) => {
    const tab = parseTab(entry);
    if (!tab || seen.has(tab.tabId)) return [];
    seen.add(tab.tabId);
    return [tab];
  });
}

function parseHistory(value: unknown): PersistedBrowserHistoryEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, MAX_HISTORY_PER_THREAD).flatMap((entry) => {
    const tab = parseTab(entry);
    if (!tab || !tab.url || tab.url === "about:blank" || seen.has(tab.url)) return [];
    seen.add(tab.url);
    return [{ tabId: tab.tabId, url: tab.url, title: tab.title }];
  });
}

function parseThreadState(value: unknown): PersistedBrowserTabsState | null {
  const legacyTabs = Array.isArray(value) ? parseTabs(value) : null;
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  const tabs = legacyTabs ?? parseTabs(candidate?.tabs);
  if (tabs.length === 0) return null;
  const requestedActiveTabId = safeString(candidate?.activeTabId, 128);
  return {
    activeTabId: tabs.some((tab) => tab.tabId === requestedActiveTabId)
      ? requestedActiveTabId
      : tabs[0]!.tabId,
    tabs,
    recentHistory: parseHistory(candidate?.recentHistory),
  };
}

function readAll(storage: BrowserStorage): PersistedBrowserState {
  const raw = storage.getItem(BROWSER_TABS_STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const record = parsed as Record<string, unknown>;
    const source =
      record.state && typeof record.state === "object" && !Array.isArray(record.state)
        ? ((record.state as Record<string, unknown>).tabsByThreadId ?? {})
        : record;
    if (!source || typeof source !== "object" || Array.isArray(source)) return {};
    return Object.fromEntries(
      Object.entries(source).flatMap(([threadId, value]) => {
        const state = parseThreadState(value);
        return state ? [[threadId, state]] : [];
      }),
    );
  } catch {
    return {};
  }
}

export function readBrowserTabsState(
  storage: BrowserStorage,
  threadId: string | null,
  fallbackTabId: string,
): PersistedBrowserTabsState {
  const fallback = defaultTab(fallbackTabId);
  if (!threadId) return { activeTabId: fallbackTabId, tabs: [fallback], recentHistory: [] };
  return (
    readAll(storage)[threadId] ?? {
      activeTabId: fallbackTabId,
      tabs: [fallback],
      recentHistory: [],
    }
  );
}

export function storeBrowserTabsState(
  storage: BrowserStorage,
  threadId: string | null,
  state: PersistedBrowserTabsState,
): void {
  if (!threadId) return;
  const tabs = parseTabs(state.tabs);
  if (tabs.length === 0) return;
  const activeTabId = tabs.some((tab) => tab.tabId === state.activeTabId)
    ? state.activeTabId
    : tabs[0]!.tabId;
  const all = readAll(storage);
  storage.setItem(
    BROWSER_TABS_STORAGE_KEY,
    JSON.stringify({
      version: 2,
      state: {
        tabsByThreadId: {
          ...all,
          [threadId]: {
            activeTabId,
            tabs,
            recentHistory: parseHistory(state.recentHistory),
          },
        },
      },
    }),
  );
}

export function readBrowserTab(
  storage: BrowserStorage,
  threadId: string | null,
  tabId: string,
): PersistedBrowserTab {
  const tab =
    readBrowserTabsState(storage, threadId, tabId).tabs.find((tab) => tab.tabId === tabId) ??
    defaultTab(tabId);
  return tab.faviconUrl ? tab : { tabId: tab.tabId, url: tab.url, title: tab.title };
}

export function storeBrowserTab(
  storage: BrowserStorage,
  threadId: string | null,
  tab: PersistedBrowserTab,
  options: { readonly active?: boolean } = {},
): void {
  if (!threadId) return;
  const current = readBrowserTabsState(storage, threadId, tab.tabId);
  const recentHistory =
    tab.url && tab.url !== "about:blank"
      ? [
          { tabId: tab.tabId, url: tab.url, title: tab.title },
          ...current.recentHistory.filter((entry) => entry.url !== tab.url),
        ].slice(0, MAX_HISTORY_PER_THREAD)
      : current.recentHistory;
  storeBrowserTabsState(storage, threadId, {
    activeTabId: options.active === false ? current.activeTabId : tab.tabId,
    tabs: [tab, ...current.tabs.filter((entry) => entry.tabId !== tab.tabId)],
    recentHistory,
  });
}

export const __testing = { MAX_TABS_PER_THREAD, MAX_HISTORY_PER_THREAD };

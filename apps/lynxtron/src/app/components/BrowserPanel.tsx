import { useCallback, useEffect, useRef, useState } from "@lynx-js/react";
import { Icon } from "./Icon";
import {
  browserEventFailure,
  browserEventUrl,
  browserFailurePresentation,
  resolveBrowserNavigation,
  type BrowserLoadFailure,
} from "./browserPanel.logic";
import { readBrowserTab, storeBrowserTab } from "./browserTabPersistence.lynx";
import { clientCapabilities } from "../platform/clientCapabilities.lynx";

interface WebViewRef {
  invoke(input: {
    method: "eval" | "reload";
    params?: { readonly func: string };
    success?: (result: unknown) => void;
    fail?: (result: unknown) => void;
  }): { exec(): void };
}

export function BrowserPanel({
  width,
  height,
  tabId,
  threadId,
  active,
}: {
  readonly width: number;
  readonly height: number;
  readonly tabId: string;
  readonly threadId: string | null;
  readonly active: boolean;
}) {
  const initialTab = useRef(readBrowserTab(clientCapabilities.storage, threadId, tabId));
  const [url, setUrl] = useState(initialTab.current.url);
  const [draft, setDraft] = useState(initialTab.current.url);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<BrowserLoadFailure | null>(
    initialTab.current.lastError ?? null,
  );
  const webview = useRef<WebViewRef | null>(null);

  useEffect(() => {
    storeBrowserTab(
      clientCapabilities.storage,
      threadId,
      {
        tabId,
        url,
        title: url || "Browser",
        ...(error ? { lastError: error } : {}),
      },
      { active },
    );
  }, [active, error, tabId, threadId, url]);

  const invoke = useCallback((method: "eval" | "reload", func?: string) => {
    webview.current
      ?.invoke({
        method,
        ...(func ? { params: { func } } : {}),
        fail: (result) => console.warn(`[browser] ${method} failed`, result),
      })
      .exec();
  }, []);

  const navigate = useCallback((rawUrl: string) => {
    const result = resolveBrowserNavigation(rawUrl);
    if (!result.ok) {
      setError({ code: null, message: result.message });
      return;
    }
    setError(null);
    setLoading(true);
    setDraft(result.url);
    setUrl(result.url);
  }, []);

  const webviewWidth = Math.max(1, Math.round(width));
  const webviewHeight = Math.max(1, Math.round(height - 40));

  return (
    <view
      className={`browser-panel${active ? " browser-panel--active" : ""}`}
      data-browser-tab-id={tabId}
      data-browser-url={url}
      style={{ zIndex: active ? 1 : 0 }}
    >
      <view className="browser-panel__chrome" data-surface-subheader>
        <view
          className="browser-panel__nav"
          aria-label="Back"
          bindtap={() => invoke("eval", "window.history.back()")}
        >
          <Icon name="arrow-left" size={14} color="#818181" />
        </view>
        <view
          className="browser-panel__nav"
          aria-label="Forward"
          bindtap={() => invoke("eval", "window.history.forward()")}
        >
          <Icon name="chevron-right" size={14} color="#818181" />
        </view>
        <view className="browser-panel__nav" aria-label="Refresh" bindtap={() => invoke("reload")}>
          <Icon name="refresh-cw" size={14} color="#818181" />
        </view>
        <input
          className="browser-panel__address"
          {...({ value: draft } as object)}
          placeholder="Search or enter URL"
          bindinput={(event: { detail: { value: string } }) => setDraft(event.detail.value)}
          bindconfirm={() => navigate(draft)}
        />
      </view>
      {error ? (
        <BrowserUnreachable url={url || draft} failure={error} onReload={() => invoke("reload")} />
      ) : null}
      {!url ? (
        <view className="browser-panel__empty">
          <Icon name="globe" size={20} color="#818181" />
          <text className="browser-panel__empty-title">Open a local app or URL</text>
          <text className="browser-panel__empty-description">
            Enter an address above to start browsing.
          </text>
        </view>
      ) : (
        <x-webview
          id={`t3-browser-webview-${tabId}`}
          className="browser-panel__webview"
          src={url}
          use-osr={true}
          enable-debug={true}
          style={{ width: `${webviewWidth}px`, height: `${webviewHeight}px` }}
          ref={(element) => {
            webview.current = element as WebViewRef | null;
          }}
          bindload={() => {
            setLoading(false);
            setError(null);
          }}
          binderror={(event) => {
            const failure = browserEventFailure(event);
            if (!failure) return;
            setLoading(false);
            setError(failure);
          }}
          bindlocationchange={(event) => {
            const nextUrl = browserEventUrl(event);
            if (nextUrl) {
              setUrl(nextUrl);
              setDraft(nextUrl);
            }
          }}
          bindopenwindow={(event) => {
            const nextUrl = browserEventUrl(event);
            if (nextUrl) navigate(nextUrl);
          }}
        />
      )}
      {loading ? (
        <view className="browser-panel__loading">
          <text>Loading…</text>
        </view>
      ) : null}
    </view>
  );
}

function BrowserUnreachable({
  url,
  failure,
  onReload,
}: {
  readonly url: string;
  readonly failure: BrowserLoadFailure;
  readonly onReload: () => void;
}) {
  const presentation = browserFailurePresentation(url, failure);
  return (
    <view className="browser-panel__error">
      <Icon name="wifi-off" size={48} color="#818181" />
      <text className="browser-panel__error-title">This site can't be reached</text>
      <text className="browser-panel__error-description">
        <text className="browser-panel__error-host">{presentation.host}</text>
        {`: ${presentation.description}.`}
      </text>
      <text className="browser-panel__error-code">{presentation.errorLabel}</text>
      <view className="browser-panel__error-actions">
        <view className="browser-panel__error-reload" bindtap={onReload}>
          <text>Reload</text>
        </view>
      </view>
    </view>
  );
}

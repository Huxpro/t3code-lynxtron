import { useCallback, useRef, useState } from "@lynx-js/react";
import { Icon } from "./Icon";
import { browserEventError, browserEventUrl, resolveBrowserNavigation } from "./browserPanel.logic";

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
}: {
  readonly width: number;
  readonly height: number;
}) {
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const webview = useRef<WebViewRef | null>(null);

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
      setError(result.message);
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
    <view className="browser-panel" data-browser-url={url}>
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
        <view className="browser-panel__error">
          <text>{error}</text>
        </view>
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
          id="t3-browser-webview"
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
            setLoading(false);
            setError(browserEventError(event));
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

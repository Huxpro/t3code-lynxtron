import { describe, expect, it } from "vite-plus/test";

import { browserEventError, browserEventUrl, resolveBrowserNavigation } from "./browserPanel.logic";

describe("BrowserPanel URL contract", () => {
  it("shares preview URL normalization with the Electron browser", () => {
    expect(resolveBrowserNavigation("localhost:5173")).toEqual({
      ok: true,
      url: "http://localhost:5173/",
    });
    expect(resolveBrowserNavigation("example.com")).toEqual({
      ok: true,
      url: "https://example.com/",
    });
    expect(resolveBrowserNavigation("file:///tmp/private")).toEqual({
      ok: false,
      message: "Enter a valid HTTP or HTTPS URL.",
    });
  });

  it("accepts only typed WebView URL and error details", () => {
    expect(browserEventUrl({ detail: { url: "https://example.com/next" } })).toBe(
      "https://example.com/next",
    );
    expect(browserEventUrl({ detail: { url: 1 } })).toBeNull();
    expect(browserEventError({ detail: { errorMsg: "Connection refused" } })).toBe(
      "Connection refused",
    );
    expect(browserEventError(null)).toBe("The page could not be loaded.");
  });
});

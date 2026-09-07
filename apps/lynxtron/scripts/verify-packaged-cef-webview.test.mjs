import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./verify-packaged-cef-webview.mjs", import.meta.url), "utf8");

describe("packaged CEF WebView verifier", () => {
  it("owns its success server, app process, state, receipt, and cleanup", () => {
    expect(source).toContain("createServer((request, response) => {");
    expect(source).toContain('T3_LYNXTRON_CEF_WEBVIEW: "1"');
    expect(source).toContain("T3_LYNXTRON_BROWSER_PROBE_REPORT: receiptPath");
    expect(source).toContain("T3_LYNXTRON_BROWSER_PROBE_SUCCESS_URL: successUrl");
    expect(source).toContain('initialOverlay: "browser"');
    expect(source).toContain("Token: <redacted>");
    expect(source).toContain('child.kill("SIGTERM")');
    expect(source).toContain("server.close(resolve)");
    expect(source).toContain('receipt?.status === "pass"');
    expect(source).toContain('if (receipt?.status === "pass") break');
  });
});

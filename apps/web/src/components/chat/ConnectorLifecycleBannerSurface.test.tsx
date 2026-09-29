import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ConnectorLifecycleBannerSurface } from "./ConnectorLifecycleBannerSurface";

describe("ConnectorLifecycleBannerSurface", () => {
  it("renders a compact recoverable error with truthful semantics", () => {
    const markup = renderToStaticMarkup(
      <ConnectorLifecycleBannerSurface
        presentation={{
          visible: true,
          tone: "error",
          title: "Couldn’t connect to the local server",
          description: "Your work is safe. Retry to reconnect this workspace.",
          actionLabel: "Retry",
          action: "retry",
        }}
        onAction={vi.fn()}
      />,
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain('data-connector-lifecycle="error"');
    expect(markup).toContain("bg-destructive/8");
    expect(markup).toContain("Couldn’t connect to the local server");
    expect(markup).toContain(">Retry<");
  });

  it("stays hidden after the connector is ready", () => {
    const markup = renderToStaticMarkup(
      <ConnectorLifecycleBannerSurface
        presentation={{
          visible: false,
          tone: "neutral",
          title: "Connected",
          description: null,
          actionLabel: null,
          action: null,
        }}
      />,
    );

    expect(markup).toBe("");
  });
});

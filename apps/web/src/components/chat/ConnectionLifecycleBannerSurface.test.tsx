import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ConnectionLifecycleBannerSurface } from "./ConnectionLifecycleBannerSurface";

describe("ConnectionLifecycleBannerSurface", () => {
  it("renders actionable failure details with stable semantic hooks", () => {
    const markup = renderToStaticMarkup(
      <ConnectionLifecycleBannerSurface
        presentation={{
          phase: "error",
          visible: true,
          tone: "error",
          title: "T3 Code: Connection failed",
          description: "Server exited unexpectedly.",
          recovery: {
            primaryLabel: "Reconnect",
            primaryDisabled: false,
            secondaryLabel: "Connections",
          },
        }}
        onReconnect={vi.fn()}
        onOpenConnections={vi.fn()}
      />,
    );

    expect(markup).toContain("connection-lifecycle-banner-reference");
    expect(markup).toContain('data-connection-lifecycle-phase="error"');
    expect(markup).toContain("Server exited unexpectedly.");
    expect(markup).toContain("connection-lifecycle-reconnect");
    expect(markup).toContain("Connections");
  });

  it("renders nothing for ready state", () => {
    const markup = renderToStaticMarkup(
      <ConnectionLifecycleBannerSurface
        presentation={{
          phase: "ready",
          visible: false,
          tone: "default",
          title: "Connected to T3 Code",
          description: null,
          recovery: null,
        }}
        onReconnect={vi.fn()}
        onOpenConnections={vi.fn()}
      />,
    );

    expect(markup).toBe("");
  });
});

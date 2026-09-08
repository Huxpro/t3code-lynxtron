import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { SidebarUpdatePillSurface } from "./SidebarUpdatePillSurface";

describe("SidebarUpdatePillSurface", () => {
  it("keeps tone, progress, action, and dismiss anatomy in one shared surface", () => {
    const markup = renderToStaticMarkup(
      <SidebarUpdatePillSurface
        description="Claude can be updated from provider settings."
        dismissIcon={<span>Dismiss</span>}
        dismissLabel="Dismiss provider update notice"
        icon={<span>Warning</span>}
        onActivate={() => {}}
        onDismiss={() => {}}
        progressDurationMs={3000}
        title="Claude update available"
        tone="warning"
      />,
    );

    expect(markup).toContain('data-update-tone="warning"');
    expect(markup).toContain('data-update-title="Claude update available"');
    expect(markup).toContain('data-has-progress="true"');
    expect(markup).toContain('aria-label="Dismiss provider update notice"');
    expect(markup).toContain("sidebar-update-pill-surface__main");
    expect(markup).toContain("sidebar-update-pill-surface__dismiss");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { SidebarChromeFooterSurface, SidebarChromeHeaderSurface } from "./SidebarChromeSurface";

describe("SidebarChromeSurface", () => {
  it("keeps backdrop, trigger, and brand in canonical header order", () => {
    const markup = renderToStaticMarkup(
      <SidebarChromeHeaderSurface
        isElectron
        backdrop={<span>Backdrop</span>}
        trigger={<button type="button">Toggle</button>}
        brand={<a href="/">T3 Code</a>}
      />,
    );

    expect(markup.indexOf("Backdrop")).toBeLessThan(markup.indexOf("Toggle"));
    expect(markup.indexOf("Toggle")).toBeLessThan(markup.indexOf("T3 Code"));
    expect(markup).toContain('data-sidebar="header"');
    expect(markup).toContain("drag-region");
  });

  it("retains the canonical footer anatomy", () => {
    const markup = renderToStaticMarkup(
      <SidebarChromeFooterSurface>
        <button type="button">Settings</button>
      </SidebarChromeFooterSurface>,
    );

    expect(markup).toContain('data-sidebar="footer"');
    expect(markup).toContain("sidebar-footer");
    expect(markup).toContain("Settings");
  });
});

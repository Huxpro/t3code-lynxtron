import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";
import type { CSSProperties } from "react";

import { AppSidebarComposition } from "./AppSidebarComposition";
import { AppShellSurface } from "./AppShellSurface";

describe("AppShellSurface", () => {
  it("keeps sidebar, main content, and global control in canonical order", () => {
    const markup = renderToStaticMarkup(
      <AppShellSurface
        sidebar={<aside>Sidebar</aside>}
        main={<main>Conversation</main>}
        globalControl={<button type="button">Toggle sidebar</button>}
      />,
    );

    expect(markup.indexOf("Sidebar")).toBeLessThan(markup.indexOf("Conversation"));
    expect(markup.indexOf("Conversation")).toBeLessThan(markup.indexOf("Toggle sidebar"));
  });

  it("keeps the provider and app-shell composition physically shared", () => {
    const markup = renderToStaticMarkup(
      <AppSidebarComposition
        providerClassName="shell-provider"
        providerStyle={{ "--sidebar-width": "16rem" } as CSSProperties}
        sidebarContent={<span>Projects</span>}
        renderSidebar={(content) => <aside>Sidebar{content}</aside>}
        main={<main>Conversation</main>}
        globalControl={<button type="button">Toggle sidebar</button>}
      />,
    );

    expect(markup).toContain('data-slot="sidebar-wrapper"');
    expect(markup.indexOf("Sidebar")).toBeLessThan(markup.indexOf("Conversation"));
    expect(markup.indexOf("Conversation")).toBeLessThan(markup.indexOf("Toggle sidebar"));
  });
});

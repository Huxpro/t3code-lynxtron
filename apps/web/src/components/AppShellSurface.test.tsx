import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

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
});

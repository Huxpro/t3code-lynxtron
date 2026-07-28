import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { SidebarProjectsSurface } from "./SidebarProjectsSurface";

const noop = vi.fn();

describe("SidebarProjectsSurface", () => {
  it("keeps search, notices, project controls, and project rows in canonical order", () => {
    const markup = renderToStaticMarkup(
      <SidebarProjectsSurface
        searchControl={<button type="button">Search</button>}
        beforeProjects={<p>Connection notice</p>}
        projectControls={<button type="button">Add project</button>}
        rows={[]}
        onToggleProject={noop}
        onCreateThread={noop}
        onSelectThread={noop}
        onRenameThread={noop}
        onArchiveThread={noop}
        onDeleteThread={noop}
      >
        <p>Project rows</p>
      </SidebarProjectsSurface>,
    );

    expect(markup.indexOf("Search")).toBeLessThan(markup.indexOf("Connection notice"));
    expect(markup.indexOf("Connection notice")).toBeLessThan(markup.indexOf("Projects"));
    expect(markup.indexOf("Projects")).toBeLessThan(markup.indexOf("Add project"));
    expect(markup.indexOf("Add project")).toBeLessThan(markup.indexOf("Project rows"));
    expect(markup).toContain('data-sidebar="content"');
    expect(markup).toContain("sidebar-content-scroll");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  FileTreeChildrenSurface,
  FileTreeDirectoryRowSurface,
  FileTreeFileRowSurface,
} from "./FileTreeSurface";

describe("FileTreeDirectoryRowSurface", () => {
  it("renders chevron, folder icon, name, and trailing stats with indentation", () => {
    const markup = renderToStaticMarkup(
      <FileTreeDirectoryRowSurface
        name="components"
        depth={2}
        expanded
        chevron={<span data-chevron />}
        folderIcon={<span data-folder-icon />}
        onToggle={vi.fn()}
        trailing={<span data-stats />}
      />,
    );
    expect(markup).toContain("data-chevron");
    expect(markup).toContain("data-folder-icon");
    expect(markup).toContain("components");
    expect(markup).toContain("data-stats");
    expect(markup).toContain("padding-left:36px");
    expect(markup).toContain("rotate-90");
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("file-tree-row__name");
    expect(markup).toContain("file-tree-row__stat");
  });

  it("omits the rotation when collapsed", () => {
    const markup = renderToStaticMarkup(
      <FileTreeDirectoryRowSurface
        name="src"
        depth={0}
        expanded={false}
        chevron={<span data-chevron />}
        onToggle={vi.fn()}
      />,
    );
    expect(markup).toContain("padding-left:8px");
    expect(markup).not.toContain("rotate-90");
    expect(markup).toContain('aria-expanded="false"');
  });
});

describe("FileTreeFileRowSurface", () => {
  it("renders as a button with icon, name, and stats when selectable", () => {
    const markup = renderToStaticMarkup(
      <FileTreeFileRowSurface
        name="index.ts"
        depth={1}
        fileIcon={<span data-file-icon />}
        trailing={<span data-stats />}
        onSelect={vi.fn()}
      />,
    );
    expect(markup).toContain("<button");
    expect(markup).toContain("data-file-icon");
    expect(markup).toContain("index.ts");
    expect(markup).toContain("data-stats");
    expect(markup).toContain("padding-left:22px");
    expect(markup).toContain("file-tree-row__name");
    expect(markup).toContain("file-tree-row__stat");
  });

  it("renders a plain row without a select handler", () => {
    const markup = renderToStaticMarkup(<FileTreeFileRowSurface name="README.md" depth={0} />);
    expect(markup).not.toContain("<button");
    expect(markup).toContain("README.md");
  });

  it("applies the selected treatment and leading spacer", () => {
    const markup = renderToStaticMarkup(
      <FileTreeFileRowSurface
        name="picked.ts"
        depth={0}
        showLeadingSpacer
        selected
        onSelect={vi.fn()}
      />,
    );
    expect(markup).toContain("bg-accent");
    expect(markup).toContain("size-3.5 shrink-0");
  });
});

describe("FileTreeChildrenSurface", () => {
  it("wraps children in the gap container", () => {
    const markup = renderToStaticMarkup(
      <FileTreeChildrenSurface>
        <span data-child />
      </FileTreeChildrenSurface>,
    );
    expect(markup).toContain("data-child");
    expect(markup).toContain("gap-0.5");
  });
});

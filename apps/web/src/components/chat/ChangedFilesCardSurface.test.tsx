import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ChangedFilesCardSurface } from "./ChangedFilesCardSurface";

const renderCard = ({
  expanded,
  compactPreviewVisible,
  compact = false,
}: {
  readonly expanded: boolean;
  readonly compactPreviewVisible: boolean;
  readonly compact?: boolean;
}) =>
  renderToStaticMarkup(
    <ChangedFilesCardSurface
      turnId="turn-1"
      fileCount={2}
      expanded={expanded}
      compactPreviewVisible={compactPreviewVisible}
      compact={compact}
      stat={<span data-stat>+4 −1</span>}
      toggleIcon={<span data-toggle>Toggle</span>}
      foldersControl={<button data-folders>Folders</button>}
      openDiffControl={<button data-open-diff>Open diff</button>}
      previewScopes={[{ key: "src", label: "src", fileCount: 2 }]}
      previewFiles={[
        {
          key: "src/a.ts",
          name: "a.ts",
          icon: <span data-file-icon>File</span>,
          onSelect: vi.fn(),
        },
      ]}
      expandedBody={<div data-expanded-body>Expanded files</div>}
      onExpandedChange={vi.fn()}
      onShowAll={vi.fn()}
    />,
  );

describe("ChangedFilesCardSurface", () => {
  it("never renders an empty checkpoint shell", () => {
    const markup = renderToStaticMarkup(
      <ChangedFilesCardSurface
        turnId="turn-empty"
        fileCount={0}
        expanded={false}
        compactPreviewVisible={false}
        toggleIcon={<span>Toggle</span>}
        openDiffControl={<button>Open diff</button>}
        previewScopes={[]}
        previewFiles={[]}
        onExpandedChange={() => undefined}
        onShowAll={() => undefined}
      />,
    );
    expect(markup).toBe("");
  });

  it("renders collapsed, preview, and expanded content through one card root", () => {
    const collapsed = renderCard({ expanded: false, compactPreviewVisible: false });
    const preview = renderCard({ expanded: false, compactPreviewVisible: true });
    const expanded = renderCard({ expanded: true, compactPreviewVisible: false });

    for (const [markup, state] of [
      [collapsed, "collapsed"],
      [preview, "preview"],
      [expanded, "expanded"],
    ] as const) {
      expect(markup).toContain('data-review-checkpoint-card="true"');
      expect(markup).toContain(`data-changed-files-state="${state}"`);
      expect(markup).toContain(`turn-diff-card--${state}`);
      expect(markup).toContain('data-review-turn-id="turn-1"');
      expect(markup).toContain('data-review-file-count="2"');
      expect(markup).toContain('data-open-diff="true"');
      expect(markup).toContain('class="turn-diff-card__status ');
      expect(markup).toContain("turn-diff-card__hint");
    }

    expect(collapsed).not.toContain("a.ts");
    expect(collapsed).not.toContain("Expanded files");
    expect(preview).toContain("a.ts");
    expect(preview).toContain("Show all 2 files");
    expect(preview).toContain("turn-diff-card__preview-scopes");
    expect(preview).toContain("turn-diff-card__preview-files");
    expect(preview).toContain("turn-diff-card__preview-show-all");
    expect(expanded).toContain("Expanded files");
    expect(expanded).toContain('data-folders="true"');
    expect(expanded).not.toContain("Show all 2 files");
  });

  it("keeps the expanded header in normal flow with its body", () => {
    const expanded = renderCard({ expanded: true, compactPreviewVisible: false });

    expect(expanded.indexOf("2 changed files")).toBeLessThan(expanded.indexOf("Expanded files"));
    expect(expanded).not.toMatch(/\bsticky\b/);
    expect(expanded).not.toMatch(/\btop-2\b/);
  });

  it("removes secondary header copy in compact chat columns", () => {
    const compact = renderCard({ expanded: false, compactPreviewVisible: true, compact: true });

    expect(compact).toContain('data-changed-files-compact="true"');
    expect(compact).toContain("turn-diff-card--compact");
    expect(compact).not.toContain("Show files");
  });
});

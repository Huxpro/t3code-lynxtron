import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { RightPanelEmptySurface, RightPanelTabSurface } from "./RightPanelSurface";

describe("RightPanelTabSurface", () => {
  it("renders the tab anatomy: icon, truncated title, close affordance", () => {
    const markup = renderToStaticMarkup(
      <RightPanelTabSurface
        icon={<span data-tab-icon />}
        title="Diff"
        active
        onActivate={vi.fn()}
        onClose={vi.fn()}
        closeIcon={<span data-close-icon />}
      />,
    );
    expect(markup).toContain("data-tab-icon");
    expect(markup).toContain("Diff");
    expect(markup).toContain('aria-label="Close Diff"');
    expect(markup).toContain("data-close-icon");
    expect(markup).toContain("bg-accent text-foreground");
    expect(markup).toContain('data-active-tab="true"');
  });

  it("uses the inactive treatment and hover-revealed close by default", () => {
    const markup = renderToStaticMarkup(
      <RightPanelTabSurface
        icon={<span data-tab-icon />}
        title="Files"
        active={false}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        closeIcon={<span data-close-icon />}
      />,
    );
    expect(markup).toContain("text-muted-foreground");
    expect(markup).toContain("opacity-0 group-hover:opacity-100");
  });

  it("keeps the close affordance visible for hoverless platforms", () => {
    const markup = renderToStaticMarkup(
      <RightPanelTabSurface
        icon={<span data-tab-icon />}
        title="Files"
        active={false}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        closeIcon={<span data-close-icon />}
        closeVisible
      />,
    );
    expect(markup).not.toContain("opacity-0 group-hover:opacity-100");
  });

  it("renders the pending dot behind the close affordance when pending", () => {
    const markup = renderToStaticMarkup(
      <RightPanelTabSurface
        icon={<span data-tab-icon />}
        title="Browser"
        active={false}
        pending
        onActivate={vi.fn()}
        onClose={vi.fn()}
        closeIcon={<span data-close-icon />}
        pendingCloseIcon={<span data-pending-close />}
      />,
    );
    expect(markup).toContain("size-2 rounded-full bg-current");
    expect(markup).toContain("data-pending-close");
    expect(markup).not.toContain("data-close-icon");
  });

  it("wraps the activate button when the host provides a wrapper", () => {
    const markup = renderToStaticMarkup(
      <RightPanelTabSurface
        icon={<span data-tab-icon />}
        title="Diff"
        active
        onActivate={vi.fn()}
        onClose={vi.fn()}
        closeIcon={<span data-close-icon />}
        renderActivateWrapper={(button) => <div data-tooltip-wrap>{button}</div>}
      />,
    );
    expect(markup).toContain("data-tooltip-wrap");
  });
});

describe("RightPanelEmptySurface", () => {
  const actions = [
    {
      key: "files",
      icon: <span data-icon-files />,
      label: "Files",
      description: "Browse and read workspace files.",
      onSelect: vi.fn(),
    },
    {
      key: "browser",
      icon: <span data-icon-browser />,
      label: "Browser",
      description: "Open a local app or URL.",
      disabled: true,
      onSelect: vi.fn(),
    },
  ];

  it("renders the canonical empty copy and one card per action", () => {
    const markup = renderToStaticMarkup(<RightPanelEmptySurface actions={actions} />);
    expect(markup).toContain("Open a surface");
    expect(markup).toContain("Choose what to show in the right panel.");
    expect(markup).toContain("Files");
    expect(markup).toContain("Browse and read workspace files.");
    expect(markup).toContain("Browser");
    expect(markup).toContain("right-panel-empty-grid");
    expect(markup).toContain("right-panel-empty-row");
    expect(markup).toContain("right-panel-empty-card");
  });

  it("marks disabled cards with aria-disabled and the muted treatment", () => {
    const markup = renderToStaticMarkup(<RightPanelEmptySurface actions={actions} />);
    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain("opacity-40");
  });

  it("routes disabled cards through the host wrapper", () => {
    const markup = renderToStaticMarkup(
      <RightPanelEmptySurface
        actions={actions}
        renderDisabledWrapper={(_action, card) => <div data-disabled-wrap>{card}</div>}
      />,
    );
    expect(markup).toContain("data-disabled-wrap");
    expect(markup.match(/data-disabled-wrap/g)).toHaveLength(1);
  });
});

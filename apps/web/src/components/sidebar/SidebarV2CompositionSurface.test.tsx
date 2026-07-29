import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { SidebarV2CompositionSurface } from "./SidebarV2CompositionSurface";

vi.mock("./SidebarChrome", () => ({
  SidebarChromeHeader: () => <div data-testid="chrome-header" />,
  SidebarChromeFooter: () => <div data-testid="chrome-footer" />,
}));

vi.mock("./SidebarV2ControlsSurface", () => ({
  SidebarV2ControlsSurface: () => <div data-testid="sidebar-v2-controls" />,
  SidebarV2EmptyStateSurface: ({
    hasProjects,
    scopedDisplayName,
  }: {
    readonly hasProjects: boolean;
    readonly scopedDisplayName: string | null;
  }) => (
    <div data-testid="sidebar-v2-empty">
      {hasProjects ? `No threads in ${scopedDisplayName ?? "all projects"}` : "No projects yet"}
    </div>
  ),
}));

vi.mock("../ui/sidebar", () => ({
  SidebarContent: ({
    children,
    fixedHeader,
  }: {
    readonly children: ReactNode;
    readonly fixedHeader?: ReactNode;
  }) => (
    <div data-testid="sidebar-content">
      {fixedHeader}
      {children}
    </div>
  ),
  SidebarGroup: ({ children }: { readonly children: ReactNode }) => (
    <div data-testid="sidebar-group">{children}</div>
  ),
}));

vi.mock("../ui/tooltip", () => ({
  TooltipProvider: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
}));

const controls = {
  commandPaletteShortcutLabel: null,
  newThreadShortcutLabel: null,
  newThreadDisabled: false,
  onNewThreadClick: vi.fn(),
  projectScopeOptions: [],
  projectScopeKey: null,
  onProjectScopeKeyChange: vi.fn(),
  projectScopeMenuOpen: false,
  onProjectScopeMenuOpenChange: vi.fn(),
  scopedFavicon: null,
  scopedDisplayName: null,
  onNewProjectClick: vi.fn(),
} as const;

describe("SidebarV2CompositionSurface", () => {
  it("owns the complete chrome, controls, list, and footer order", () => {
    const markup = renderToStaticMarkup(
      <SidebarV2CompositionSurface
        isElectron
        controls={controls}
        rows={<li>Shared row</li>}
        rowCount={1}
        hasProjects
        scopedDisplayName={null}
        onAddProjectClick={vi.fn()}
      />,
    );

    expect(markup.indexOf("chrome-header")).toBeLessThan(markup.indexOf("sidebar-v2-controls"));
    expect(markup.indexOf("sidebar-v2-controls")).toBeLessThan(
      markup.indexOf("sidebar-v2-thread-list"),
    );
    expect(markup.indexOf("Shared row")).toBeLessThan(markup.indexOf("chrome-footer"));
    expect(markup).not.toContain("sidebar-v2-empty");
  });

  it("places the shared scoped empty state inside the list composition", () => {
    const markup = renderToStaticMarkup(
      <SidebarV2CompositionSurface
        isElectron={false}
        controls={controls}
        rows={null}
        rowCount={0}
        hasProjects
        scopedDisplayName="Lynxtron"
        onAddProjectClick={vi.fn()}
      />,
    );

    expect(markup).toContain("No threads in Lynxtron");
    expect(markup.indexOf("sidebar-v2-thread-list")).toBeLessThan(
      markup.indexOf("sidebar-v2-empty"),
    );
  });
});

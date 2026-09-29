import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { WelcomeWorkspace } from "./WelcomeWorkspace";

describe("WelcomeWorkspace", () => {
  it("renders the complete no-project workspace anatomy", () => {
    const markup = renderToStaticMarkup(
      <WelcomeWorkspace
        isDark={false}
        onCreateProject={vi.fn()}
        onExploreProjects={vi.fn()}
        onOpenConnections={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    for (const copy of [
      "What are you working on?",
      "Guide my next build",
      "Explore my projects",
      "Ship faster",
      "Work across devices",
      "What do you want to build?",
      "Choose a project",
    ]) {
      expect(markup).toContain(copy);
    }
    expect(markup).toContain('aria-label="Switch to dark theme"');
    expect(markup).toContain('aria-label="Start building"');
  });

  it("shows the inverse theme action in dark mode", () => {
    const markup = renderToStaticMarkup(
      <WelcomeWorkspace
        isDark
        onCreateProject={vi.fn()}
        onExploreProjects={vi.fn()}
        onOpenConnections={vi.fn()}
        onToggleTheme={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-label="Switch to light theme"');
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  AccessListRowSurface,
  ArchivedThreadsSurface,
  BetaSettingsSurface,
  ProviderInstanceCardSurface,
  SourceControlItemRowSurface,
  SourceControlMarkSurface,
  StatusDotSurface,
} from "./SettingsSurfaces";

describe("ArchivedThreadsSurface", () => {
  it("renders the empty section when no groups exist", () => {
    const markup = renderToStaticMarkup(
      <ArchivedThreadsSurface
        groups={[]}
        emptyTitle="No archived threads"
        emptyDescription="Archived threads will appear here."
      />,
    );
    expect(markup).toContain("Archived threads");
    expect(markup).toContain("No archived threads");
    expect(markup).toContain("Archived threads will appear here.");
  });

  it("renders project groups with thread rows and actions", () => {
    const markup = renderToStaticMarkup(
      <ArchivedThreadsSurface
        groups={[
          {
            key: "project-1",
            title: "t3code",
            threads: [
              {
                id: "thread-1",
                title: "Investigate scroll anchor",
                description: "Archived 2h · Created 5h",
                action: <button data-action>Unarchive</button>,
              },
            ],
          },
        ]}
        emptyTitle="No archived threads"
        emptyDescription="Archived threads will appear here."
      />,
    );
    expect(markup).toContain("t3code");
    expect(markup).toContain("Investigate scroll anchor");
    expect(markup).toContain("Archived 2h · Created 5h");
    expect(markup).toContain("data-action");
    expect(markup).not.toContain("No archived threads");
  });
});

describe("BetaSettingsSurface", () => {
  it("renders the Sidebar v2 row with its control and optional auto-settle slot", () => {
    const markup = renderToStaticMarkup(
      <BetaSettingsSurface
        sidebarV2Control={<button data-v2-toggle />}
        autoSettleControls={<div data-auto-settle />}
      />,
    );
    expect(markup).toContain("Beta features");
    expect(markup).toContain("Sidebar v2");
    expect(markup).toContain("data-v2-toggle");
    expect(markup).toContain("data-auto-settle");
  });

  it("renders the honest-gap status note when provided", () => {
    const markup = renderToStaticMarkup(
      <BetaSettingsSurface
        sidebarV2Control={<button data-v2-toggle />}
        sidebarV2Status="The Lynx Sidebar v2 renderer has not moved yet."
      />,
    );
    expect(markup).toContain("The Lynx Sidebar v2 renderer has not moved yet.");
    expect(markup).not.toContain("data-auto-settle");
  });
});

describe("SourceControlMarkSurface", () => {
  it("renders a bare status dot per tone when no icon is present", () => {
    const success = renderToStaticMarkup(<StatusDotSurface tone="success" />);
    const warning = renderToStaticMarkup(<SourceControlMarkSurface tone="warning" />);
    const muted = renderToStaticMarkup(<SourceControlMarkSurface tone="muted" />);
    expect(success).toContain("bg-success");
    expect(warning).toContain("bg-warning");
    expect(muted).toContain("bg-muted-foreground/35");
  });

  it("overlays the dot on the icon when present", () => {
    const markup = renderToStaticMarkup(
      <SourceControlMarkSurface tone="success" icon={<span data-vcs-icon />} />,
    );
    expect(markup).toContain("data-vcs-icon");
    expect(markup).toContain("bg-success");
    expect(markup).toContain("ring-2");
  });
});

describe("SourceControlItemRowSurface", () => {
  it("renders mark, label, version, badge, summary, and control in order", () => {
    const markup = renderToStaticMarkup(
      <SourceControlItemRowSurface
        mark={<span data-mark />}
        label="GitHub"
        version="2.81.0"
        badge={<span data-badge>Not authenticated</span>}
        summary="Detected CLI"
        control={<button data-control>Enable</button>}
      />,
    );
    for (const part of ["data-mark", "GitHub", "2.81.0", "data-badge", "Detected CLI"]) {
      expect(markup).toContain(part);
    }
    expect(markup).toContain("data-control");
    expect(markup.indexOf("data-mark")).toBeLessThan(markup.indexOf("GitHub"));
    expect(markup.indexOf("GitHub")).toBeLessThan(markup.indexOf("Detected CLI"));
  });

  it("applies the muted treatment and omits the control container without a control", () => {
    const markup = renderToStaticMarkup(
      <SourceControlItemRowSurface
        mark={<span data-mark />}
        label="GitLab"
        summary="Coming Soon"
        muted
      />,
    );
    expect(markup).toContain("opacity-80");
    expect(markup).toContain("source-control-item");
  });
});

describe("AccessListRowSurface", () => {
  it("renders status dot, primary label, trailing chip, description, and control", () => {
    const markup = renderToStaticMarkup(
      <AccessListRowSurface
        statusDot={<span data-dot />}
        primaryLabel="MacBook Pro"
        primaryTrailing={<span data-trailing>This device</span>}
        description="Connected · macOS · 4 scopes"
        control={<button data-revoke>Revoke</button>}
      />,
    );
    for (const part of ["data-dot", "MacBook Pro", "data-trailing", "Connected", "data-revoke"]) {
      expect(markup).toContain(part);
    }
    expect(markup).toContain("access-list-row");
    expect(markup.indexOf("data-dot")).toBeLessThan(markup.indexOf("MacBook Pro"));
  });
});

describe("ProviderInstanceCardSurface", () => {
  it("renders the full header anatomy with an accessible expand button", () => {
    const onToggle = vi.fn();
    const markup = renderToStaticMarkup(
      <ProviderInstanceCardSurface
        icon={<span data-provider-icon />}
        title="Claude Code"
        instanceIdChip={<code data-chip>claude-personal</code>}
        badge={<span data-badge>Coming Soon</span>}
        version={<code data-version>1.2.3</code>}
        titleTrailing={<button data-delete>Delete</button>}
        summaryHeadline="Authenticated as theo"
        summaryDetail="default instance"
        expanded
        onToggleExpanded={onToggle}
        toggleAriaLabel="Toggle Claude Code details"
        expandChevron={<span data-chevron />}
        toggle={<button data-toggle />}
        body={<div data-body />}
      />,
    );
    for (const part of [
      "data-provider-icon",
      "Claude Code",
      "data-chip",
      "data-badge",
      "data-version",
      "data-delete",
      "Authenticated as theo",
      "- default instance",
      "data-chevron",
      "data-toggle",
      "data-body",
    ]) {
      expect(markup).toContain(part);
    }
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain('aria-label="Toggle Claude Code details"');
    expect(markup).toContain("provider-instance-card");
  });

  it("keeps expansion rendering with the host (no body when omitted)", () => {
    const markup = renderToStaticMarkup(
      <ProviderInstanceCardSurface
        title="Codex"
        summaryHeadline="Ready"
        expanded={false}
        onToggleExpanded={vi.fn()}
        toggleAriaLabel="Toggle Codex details"
        expandChevron={<span data-chevron />}
        toggle={<button data-toggle />}
      />,
    );
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("data-body");
    expect(markup).not.toContain("- ");
  });
});

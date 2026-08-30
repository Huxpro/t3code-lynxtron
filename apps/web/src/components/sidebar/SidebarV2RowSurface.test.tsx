import { cloneElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { SidebarV2RowSurface, type SidebarV2RowSurfaceProps } from "./SidebarV2RowSurface";

vi.mock("../ui/tooltip", () => ({
  Tooltip: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
  TooltipTrigger: ({
    children,
    render,
  }: {
    readonly children: ReactNode;
    readonly render?: ReactElement<{ readonly children?: ReactNode }>;
  }) => (isValidElement(render) ? cloneElement(render, { children }) : <>{children}</>),
}));

const noop = vi.fn();

const baseProps: SidebarV2RowSurfaceProps = {
  threadId: "thread-1",
  variant: "card",
  variantAction: "settle",
  isActive: false,
  isSelected: false,
  shouldRecede: false,
  isInFlight: false,
  isUnread: false,
  isWoke: false,
  settlementSupported: true,
  snoozeSupported: false,
  snoozeMenuOpen: false,
  snoozeWakeLabelText: null,
  projectTitle: "t3code",
  threadTitle: "Port Lynxtron",
  branch: "feature/lynx",
  threadTimeLabel: "2m",
  settledTimeLabel: "5m",
  topStatus: null,
  jumpLabel: null,
  favicon: <span data-favicon>T3</span>,
  title: <span data-thread-title>Port Lynxtron</span>,
  isRegeneratingTitle: false,
  terminalStatusIcon: null,
  prBadge: <span data-pr-badge>#42</span>,
  diff: { insertions: 12, deletions: 3 },
  remoteIndicator: <span data-remote>Remote</span>,
  providerIndicator: <span data-provider>Codex</span>,
  detailsTooltip: <span data-tooltip>Details</span>,
  cardActionControl: null,
  settleIcon: <span>Settle icon</span>,
  unsettleIcon: <span>Unsettle icon</span>,
  unsnoozeIcon: <span>Wake icon</span>,
  wokeIcon: <span>Woke icon</span>,
  onClick: noop,
  onDoubleClick: noop,
  onKeyDown: noop,
  onContextMenu: noop,
  onSettleClick: noop,
  onUnsettleClick: noop,
  onUnsnoozeClick: noop,
};

describe("SidebarV2RowSurface", () => {
  it("keeps the Web card hierarchy and action placement in one shared composition", () => {
    const markup = renderToStaticMarkup(<SidebarV2RowSurface {...baseProps} />);

    expect(markup).toContain('data-testid="sidebar-v2-row-card"');
    expect(markup).toContain('data-thread-id="thread-1"');
    expect(markup).toContain('data-thread-active="false"');
    expect(markup.indexOf("t3code")).toBeLessThan(markup.indexOf("Port Lynxtron"));
    expect(markup.indexOf("Port Lynxtron")).toBeLessThan(markup.indexOf("feature/lynx"));
    expect(markup.indexOf("feature/lynx")).toBeLessThan(markup.indexOf("#42"));
    expect(markup).toContain("+12");
    expect(markup).toContain("−3");
    expect(markup).toContain('aria-label="Settle thread"');
  });

  it("keeps the slim wake action and timing slot inside the shared row", () => {
    const markup = renderToStaticMarkup(
      <SidebarV2RowSurface
        {...baseProps}
        variant="slim"
        variantAction="unsnooze"
        settlementSupported={false}
        snoozeSupported
        snoozeWakeLabelText="2h"
      />,
    );

    expect(markup).toContain('data-testid="sidebar-v2-row-slim"');
    expect(markup).toContain("2h");
    expect(markup).toContain('aria-label="Wake thread now"');
    expect(markup).not.toContain('aria-label="Settle thread"');
  });

  it("keeps a supplied card action visible without settlement support", () => {
    const markup = renderToStaticMarkup(
      <SidebarV2RowSurface
        {...baseProps}
        settlementSupported={false}
        cardActionControl={<button aria-label="Thread actions">Actions</button>}
      />,
    );

    expect(markup).toContain("sidebar-v2-row-actions");
    expect(markup).toContain('aria-label="Thread actions"');
    expect(markup).not.toContain('aria-label="Settle thread"');
    expect(markup).toMatch(
      /<div class="sidebar-v2-row-actions[^"]*"><button aria-label="Thread actions">/u,
    );
    expect(markup).not.toMatch(/<span class="sidebar-v2-row-actions/u);
  });

  it("keeps the Electron action label when a native hover makes actions visible", () => {
    const markup = renderToStaticMarkup(
      <SidebarV2RowSurface
        {...baseProps}
        cardActionsVisible
        cardActionControl={<button aria-label="Thread actions">Actions</button>}
      />,
    );

    expect(markup).toMatch(/sidebar-v2-row-status[^"]*opacity-0/u);
    expect(markup).toMatch(/sidebar-v2-row-actions[^"]*opacity-100/u);
    expect(markup).toContain(">Settle</button>");
  });

  it("projects active project-card status and diff metadata without changing its hierarchy", () => {
    const markup = renderToStaticMarkup(
      <SidebarV2RowSurface
        {...baseProps}
        isActive
        topStatus={{
          label: "Working",
          className: "text-blue-500",
          icon: <span data-working-icon>Working icon</span>,
          workingDuration: <span data-working-duration>12s</span>,
        }}
      />,
    );

    expect(markup).toContain('data-thread-active="true"');
    expect(markup).toContain("sidebar-v2-row-card--active");
    expect(markup).toContain('data-sidebar-diff="true"');
    expect(markup).toContain('data-sidebar-diff-insertions="12"');
    expect(markup).toContain('data-sidebar-diff-deletions="3"');
    expect(markup.indexOf("t3code")).toBeLessThan(markup.indexOf("Working"));
    expect(markup.indexOf("Working")).toBeLessThan(markup.indexOf("Port Lynxtron"));
    expect(markup.indexOf("Port Lynxtron")).toBeLessThan(markup.indexOf("feature/lynx"));
    expect(markup).toContain("sidebar-v2-row-status");
    expect(markup).toContain("sidebar-v2-row-status-content");
    expect(markup).toContain("whitespace-nowrap");
    expect(markup).toContain("sidebar-v2-row-actions");
  });

  it("keeps the project-card branch row stable when optional metadata is absent", () => {
    const markup = renderToStaticMarkup(
      <SidebarV2RowSurface
        {...baseProps}
        branch={null}
        diff={null}
        prBadge={null}
        remoteIndicator={null}
        providerIndicator={null}
      />,
    );

    expect(markup).toContain('data-testid="sidebar-v2-row-card"');
    expect(markup).toContain("sidebar-v2-row-card");
    expect(markup).not.toContain("feature/lynx");
    expect(markup).not.toContain('data-sidebar-diff="true"');
  });
});

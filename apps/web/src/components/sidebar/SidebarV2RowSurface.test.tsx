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
  showSnoozeButton: false,
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
  prBadge: <span data-pr-badge>#42</span>,
  diff: { insertions: 12, deletions: 3 },
  remoteIndicator: <span data-remote>Remote</span>,
  providerIndicator: <span data-provider>Codex</span>,
  detailsTooltip: <span data-tooltip>Details</span>,
  snoozeControl: null,
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
});

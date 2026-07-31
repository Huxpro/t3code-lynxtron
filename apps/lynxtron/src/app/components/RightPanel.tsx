import { useCallback, useState } from "@lynx-js/react";
import {
  RightPanelEmptySurface,
  RightPanelTabSurface,
  type RightPanelActionItem,
} from "../../../../web/src/components/RightPanelSurface";
import type { ActivePlanState, LatestProposedPlanState } from "../bridge";
import {
  uiActions,
  useRightPanelState,
  type RightPanelKind,
  type RightPanelSurface,
} from "../state/uiState";
import { PlanPanel } from "./PlanPanel";
import { DiffPanel } from "./DiffPanel";
import { FilesPanel } from "./FilesPanel";

interface RightPanelProps {
  activePlan: ActivePlanState | null;
  activeProposedPlan: LatestProposedPlanState | null;
}

type AddableKind = RightPanelKind | "browser" | "terminal";

const SURFACE_ICONS: Record<RightPanelKind, string> = {
  plan: "📋",
  diff: "Δ",
  files: "📁",
};

const ADDABLE_ICONS: Record<AddableKind, string> = {
  ...SURFACE_ICONS,
  browser: "🌐",
  terminal: ">_",
};

/**
 * Add-surface catalog, converged on the Web four-entry anatomy. Browser and
 * Terminal stay registered placeholders (disabled with an honest reason);
 * Plan opens through the proposed-plan product flow, not this menu.
 */
const ADDABLE_SURFACES: ReadonlyArray<{
  readonly kind: AddableKind;
  readonly label: string;
  readonly description: string;
  readonly disabled: boolean;
  readonly disabledReason: string | null;
}> = [
  {
    kind: "browser",
    label: "Browser",
    description: "Open a local app or URL.",
    disabled: true,
    disabledReason: "Embedded browser previews are a registered placeholder on Lynxtron.",
  },
  {
    kind: "terminal",
    label: "Terminal",
    description: "Start a shell in this workspace.",
    disabled: true,
    disabledReason: "Terminal emulation is a registered placeholder on Lynxtron.",
  },
  {
    kind: "files",
    label: "Files",
    description: "Browse and read workspace files.",
    disabled: false,
    disabledReason: null,
  },
  {
    kind: "diff",
    label: "Diff",
    description: "Review changes in this thread.",
    disabled: false,
    disabledReason: null,
  },
];

function renderSurface(surface: RightPanelSurface, props: RightPanelProps) {
  switch (surface.kind) {
    case "plan":
      return (
        <PlanPanel activePlan={props.activePlan} activeProposedPlan={props.activeProposedPlan} />
      );
    case "diff":
      return <DiffPanel />;
    case "files":
      return <FilesPanel />;
  }
}

export function RightPanel({ activePlan, activeProposedPlan }: RightPanelProps) {
  const state = useRightPanelState();
  const [showAddMenu, setShowAddMenu] = useState(false);

  const handleTabClick = useCallback((surface: RightPanelSurface) => {
    uiActions.activateRightPanelSurface(surface.id);
  }, []);

  const handleCloseTab = useCallback((surface: RightPanelSurface) => {
    uiActions.closeRightPanelSurface(surface.id);
  }, []);

  const handleAddSurface = useCallback((kind: RightPanelKind) => {
    uiActions.openRightPanelSurface(kind);
    setShowAddMenu(false);
  }, []);

  const handleToggleAddMenu = useCallback(() => {
    setShowAddMenu((v) => !v);
  }, []);

  const handleClose = useCallback(() => {
    uiActions.closeRightPanel();
  }, []);

  if (!state.isOpen) return null;

  const activeSurface = state.surfaces.find((s) => s.id === state.activeSurfaceId) ?? null;
  const hasActiveSurface = activeSurface !== null;

  const emptyActions: ReadonlyArray<RightPanelActionItem> = ADDABLE_SURFACES.map((item) => ({
    key: item.kind,
    icon: <text className="right-panel__empty-card-icon">{ADDABLE_ICONS[item.kind]}</text>,
    label: item.label,
    description: item.disabled && item.disabledReason ? item.disabledReason : item.description,
    disabled: item.disabled,
    onSelect: () => {
      if (item.kind === "files" || item.kind === "diff" || item.kind === "plan") {
        handleAddSurface(item.kind);
      }
    },
  }));

  return (
    <view className="right-panel">
      {/* Tab bar */}
      <view className="right-panel__tabs">
        <scroll-view className="right-panel__tab-scroll" scroll-orientation="horizontal">
          <view className="right-panel__tab-list">
            {state.surfaces.map((surface) => (
              <RightPanelTabSurface
                key={surface.id}
                icon={<text className="right-panel__tab-icon">{SURFACE_ICONS[surface.kind]}</text>}
                title={surface.label}
                active={surface.id === state.activeSurfaceId}
                onActivate={() => handleTabClick(surface)}
                onClose={() => handleCloseTab(surface)}
                closeIcon={<text className="right-panel__tab-close-glyph">×</text>}
                closeVisible
              />
            ))}
          </view>
        </scroll-view>
        {/* Add surface button */}
        <view className="right-panel__add-btn-wrapper">
          <view
            className={`right-panel__add-btn${showAddMenu ? " right-panel__add-btn--active" : ""}`}
            bindtap={handleToggleAddMenu}
          >
            <text className="right-panel__add-btn-text">+</text>
          </view>
          {showAddMenu ? (
            <view className="right-panel__add-menu">
              {ADDABLE_SURFACES.map((item) => (
                <view
                  key={item.kind}
                  className={`right-panel__add-item${item.disabled ? " right-panel__add-item--disabled" : ""}`}
                  {...(item.disabled
                    ? {}
                    : {
                        bindtap: () => {
                          if (
                            item.kind === "files" ||
                            item.kind === "diff" ||
                            item.kind === "plan"
                          ) {
                            handleAddSurface(item.kind);
                          }
                        },
                      })}
                >
                  <text className="right-panel__add-item-icon">{ADDABLE_ICONS[item.kind]}</text>
                  <text className="right-panel__add-item-label">{item.label}</text>
                </view>
              ))}
            </view>
          ) : null}
        </view>
        <view className="right-panel__close" bindtap={handleClose}>
          <text className="right-panel__close-text">×</text>
        </view>
      </view>

      {/* Content */}
      <view className="right-panel__content">
        {hasActiveSurface ? (
          renderSurface(activeSurface, { activePlan, activeProposedPlan })
        ) : (
          <RightPanelEmptySurface actions={emptyActions} />
        )}
      </view>
    </view>
  );
}

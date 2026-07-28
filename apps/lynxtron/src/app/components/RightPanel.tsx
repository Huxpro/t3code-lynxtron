import { useCallback, useState } from "@lynx-js/react";
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

const ADDABLE_SURFACES: Array<{ kind: RightPanelKind; label: string; icon: string }> = [
  { kind: "plan", label: "Plan", icon: "📋" },
  { kind: "diff", label: "Diff", icon: "Δ" },
  { kind: "files", label: "Files", icon: "📁" },
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

  return (
    <view className="right-panel">
      {/* Tab bar */}
      <view className="right-panel__tabs">
        <scroll-view className="right-panel__tab-scroll" scroll-orientation="horizontal">
          <view className="right-panel__tab-list">
            {state.surfaces.map((surface) => {
              const isActive = surface.id === state.activeSurfaceId;
              return (
                <view
                  key={surface.id}
                  className={`right-panel__tab${isActive ? " right-panel__tab--active" : ""}`}
                >
                  <view className="right-panel__tab-inner" bindtap={() => handleTabClick(surface)}>
                    <text
                      className={`right-panel__tab-label${isActive ? " right-panel__tab-label--active" : ""}`}
                    >
                      {surface.label}
                    </text>
                  </view>
                  <view className="right-panel__tab-close" bindtap={() => handleCloseTab(surface)}>
                    <text className="right-panel__tab-close-text">×</text>
                  </view>
                </view>
              );
            })}
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
                  className="right-panel__add-item"
                  bindtap={() => handleAddSurface(item.kind)}
                >
                  <text className="right-panel__add-item-icon">{item.icon}</text>
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
          /* Empty state */
          <view className="right-panel__empty-state">
            <text className="right-panel__empty-state-title">Open a surface</text>
            <text className="right-panel__empty-state-desc">
              Choose what to show in the right panel.
            </text>
            <view className="right-panel__empty-grid">
              {ADDABLE_SURFACES.map((item) => (
                <view
                  key={item.kind}
                  className="right-panel__empty-card"
                  bindtap={() => handleAddSurface(item.kind)}
                >
                  <text className="right-panel__empty-card-icon">{item.icon}</text>
                  <text className="right-panel__empty-card-label">{item.label}</text>
                  <text className="right-panel__empty-card-desc">
                    {item.kind === "plan"
                      ? "View plan steps and proposed plans."
                      : item.kind === "diff"
                        ? "Review changes in this thread."
                        : "Browse and read workspace files."}
                  </text>
                </view>
              ))}
            </view>
          </view>
        )}
      </view>
    </view>
  );
}

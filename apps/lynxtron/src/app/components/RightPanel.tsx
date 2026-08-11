import { useCallback, useState } from "@lynx-js/react";
import { useMediaQuery } from "../../../../web/src/hooks/useMediaQuery";
import {
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY,
  RIGHT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_WIDTH_STORAGE_KEY,
  resolveRightPanelMaximumWidth,
} from "../../../../web/src/rightPanelLayout";
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
import { useViewportSnapshot } from "../../../../web/src/hooks/useViewportSnapshot";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { Icon, type IconName } from "./Icon";

interface RightPanelContentProps {
  activePlan: ActivePlanState | null;
  activeProposedPlan: LatestProposedPlanState | null;
}

interface RightPanelProps extends RightPanelContentProps {
  maximized?: boolean;
  onMaximizedChange?: (maximized: boolean) => void;
}

type AddableKind = RightPanelKind | "browser" | "terminal";

const SURFACE_ICONS: Record<RightPanelKind, IconName> = {
  plan: "clipboard-list",
  diff: "file-diff",
  files: "files",
};

const ADDABLE_ICONS: Record<AddableKind, IconName> = {
  ...SURFACE_ICONS,
  browser: "globe",
  terminal: "terminal-square",
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

function renderSurface(surface: RightPanelSurface, props: RightPanelContentProps) {
  switch (surface.kind) {
    case "plan":
      return (
        <PlanPanel activePlan={props.activePlan} activeProposedPlan={props.activeProposedPlan} />
      );
    case "diff":
      return <DiffPanel turnId={surface.turnId} filePath={surface.filePath} />;
    case "files":
      return <FilesPanel />;
  }
}

export function RightPanel({
  activePlan,
  activeProposedPlan,
  maximized = false,
  onMaximizedChange = () => undefined,
}: RightPanelProps) {
  const state = useRightPanelState();
  const sheet = useMediaQuery(RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY);
  const viewport = useViewportSnapshot();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const resize = useResizableWidth({
    storageKey: RIGHT_PANEL_WIDTH_STORAGE_KEY,
    defaultWidth: RIGHT_PANEL_DEFAULT_WIDTH,
    minWidth: RIGHT_PANEL_MIN_WIDTH,
    maxWidth: resolveRightPanelMaximumWidth(viewport.width),
    edge: "left",
    target: "right-panel",
  });

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
    icon: <Icon name={ADDABLE_ICONS[item.kind]} size={20} color="#818181" />,
    label: item.label,
    description: item.disabled && item.disabledReason ? item.disabledReason : item.description,
    disabled: item.disabled,
    onSelect: () => {
      if (item.kind === "files" || item.kind === "diff" || item.kind === "plan") {
        handleAddSurface(item.kind);
      }
    },
  }));

  const panel = (
    <view
      main-thread:ref={resize.targetRef}
      className={`right-panel${sheet ? " right-panel--sheet" : ""}${
        maximized ? " right-panel--maximized" : ""
      }`}
      style={sheet || maximized ? undefined : { width: `${resize.width}px` }}
      data-right-panel-open="true"
      data-right-panel-mode={sheet ? "sheet" : "inline"}
      data-right-panel-active-kind={activeSurface?.kind ?? "empty"}
      data-right-panel-width={String(resize.width)}
      data-right-panel-maximized={maximized ? "true" : "false"}
    >
      {!sheet ? (
        <>
          <view
            {...resize.handlers}
            className="right-panel__resize-handle"
            aria-label="Resize right panel"
          />
        </>
      ) : null}
      {/* Tab bar */}
      <view className="right-panel__tabs lynx-titlebar-drag-region">
        <scroll-view className="right-panel__tab-scroll" scroll-orientation="horizontal">
          <view className="right-panel__tab-list">
            {state.surfaces.map((surface) => (
              <RightPanelTabSurface
                key={surface.id}
                icon={
                  <Icon
                    name={SURFACE_ICONS[surface.kind]}
                    size={14}
                    color="#818181"
                    className="right-panel__tab-icon"
                  />
                }
                title={surface.label}
                active={surface.id === state.activeSurfaceId}
                onActivate={() => handleTabClick(surface)}
                onClose={() => handleCloseTab(surface)}
                closeIcon={<Icon name="x" size={14} color="#818181" />}
                closeVisible
              />
            ))}
          </view>
        </scroll-view>
        {/* Add surface button */}
        <view className="right-panel__add-btn-wrapper">
          <view
            className={`right-panel__add-btn lynx-titlebar-no-drag${
              showAddMenu ? " right-panel__add-btn--active" : ""
            }`}
            bindtap={handleToggleAddMenu}
          >
            <Icon name="plus" size={16} color="#818181" />
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
                  <Icon
                    name={ADDABLE_ICONS[item.kind]}
                    size={14}
                    color="#818181"
                    className="right-panel__add-item-icon"
                  />
                  <text className="right-panel__add-item-label">{item.label}</text>
                </view>
              ))}
            </view>
          ) : null}
        </view>
        <view className="right-panel__layout-controls lynx-titlebar-no-drag">
          <view
            className={`right-panel__layout-control${
              sheet ? " right-panel__layout-control--disabled" : ""
            }`}
            aria-label={maximized ? "Restore panel size" : "Maximize panel"}
            aria-disabled={sheet ? "true" : "false"}
            bindtap={sheet ? undefined : () => onMaximizedChange(!maximized)}
          >
            <Icon
              name={maximized ? "minimize-2" : "maximize-2"}
              size={14}
              color="#818181"
            />
          </view>
          <view
            className="right-panel__layout-control right-panel__layout-control--disabled"
            aria-label="Terminal drawer unavailable"
            aria-disabled="true"
          >
            <Icon name="panel-bottom" size={14} color="#818181" />
          </view>
          <view
            className="right-panel__layout-control"
            aria-label="Toggle right panel"
            bindtap={handleClose}
          >
            <Icon name="panel-right" size={14} color="#818181" />
          </view>
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

  return sheet ? (
    <>
      <view className="right-panel-sheet-scrim" bindtap={handleClose} />
      {panel}
    </>
  ) : (
    panel
  );
}

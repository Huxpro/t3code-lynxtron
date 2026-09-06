import { useCallback, useState } from "@lynx-js/react";
import { useMediaQuery } from "../../../../web/src/hooks/useMediaQuery";
import {
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY,
  RIGHT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_WIDTH_STORAGE_KEY,
  resolveRightPanelMaximumWidth,
  resolveRightPanelSheetWidth,
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
import { FilePanel, FilesPanel } from "./FilesPanel";
import { useViewportSnapshot } from "../../../../web/src/hooks/useViewportSnapshot";
import { useResizableWidth } from "../hooks/useResizableWidth";
import { Icon, type IconName } from "./Icon";
import { closeTerminalSession, TerminalPanel } from "./TerminalPanel";
import { BrowserPanel } from "./BrowserPanel";
import { useT3ClientState } from "../state/t3Client";
import { clientCapabilities, showNativeContextMenu } from "../platform/clientCapabilities.lynx";

interface RightPanelContentProps {
  activeThreadId: string | null;
  activePlan: ActivePlanState | null;
  activeProposedPlan: LatestProposedPlanState | null;
  terminalHeight: number;
  terminalWidth: number;
}

interface RightPanelProps {
  activePlan: ActivePlanState | null;
  activeProposedPlan: LatestProposedPlanState | null;
  maximized?: boolean;
  onMaximizedChange?: (maximized: boolean) => void;
}

type AddableKind = RightPanelKind;

const SURFACE_ICONS: Record<RightPanelKind, IconName> = {
  plan: "clipboard-list",
  diff: "file-diff",
  files: "files",
  file: "file-json",
  terminal: "terminal-square",
  browser: "globe",
};

const ADDABLE_ICONS: Record<AddableKind, IconName> = {
  ...SURFACE_ICONS,
  browser: "globe",
  terminal: "terminal-square",
};

/**
 * Add-surface catalog, converged on the Web four-entry anatomy. Plan opens
 * through the proposed-plan product flow, not this menu.
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
    disabled: false,
    disabledReason: null,
  },
  {
    kind: "terminal",
    label: "Terminal",
    description: "Start a shell in this workspace.",
    disabled: false,
    disabledReason: null,
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
    case "file":
      return <FilePanel path={surface.path} />;
    case "terminal":
      return (
        <TerminalPanel
          key={props.activeThreadId ?? "no-thread"}
          width={props.terminalWidth}
          height={props.terminalHeight}
        />
      );
    case "browser":
      return null;
  }
}

export function RightPanel({
  activePlan,
  activeProposedPlan,
  maximized = false,
  onMaximizedChange = () => undefined,
}: RightPanelProps) {
  const { activeThreadId } = useT3ClientState();
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
    testProbe: viewport.testResize,
  });

  const handleTabClick = useCallback((surface: RightPanelSurface) => {
    uiActions.activateRightPanelSurface(surface.id);
  }, []);

  const handleCloseTab = useCallback(
    (surface: RightPanelSurface) => {
      if (surface.kind === "terminal") closeTerminalSession(activeThreadId);
      uiActions.closeRightPanelSurface(surface.id);
    },
    [activeThreadId],
  );

  const closeRemovedTerminal = useCallback(
    (removed: ReadonlyArray<RightPanelSurface>) => {
      if (removed.some((surface) => surface.kind === "terminal")) {
        closeTerminalSession(activeThreadId);
      }
    },
    [activeThreadId],
  );

  const handleTabContextMenu = useCallback(
    async (surface: RightPanelSurface, event?: unknown) => {
      const surfaceIndex = state.surfaces.findIndex((entry) => entry.id === surface.id);
      if (surfaceIndex < 0) return;
      const anchor = event as { readonly x?: unknown; readonly y?: unknown } | undefined;
      const position =
        typeof anchor?.x === "number" && typeof anchor.y === "number"
          ? { x: anchor.x, y: anchor.y }
          : undefined;
      const selection = await showNativeContextMenu(
        [
          ...(surface.kind === "file" ? [{ id: "copy-path", label: "Copy path" }] : []),
          { id: "close", label: "Close" },
          {
            id: "close-others",
            label: "Close others",
            disabled: state.surfaces.length <= 1,
          },
          {
            id: "close-to-right",
            label: "Close to the right",
            disabled: surfaceIndex >= state.surfaces.length - 1,
          },
          { id: "close-all", label: "Close all", disabled: state.surfaces.length === 0 },
        ],
        position,
      );
      if (selection === "copy-path" && surface.kind === "file") {
        await clientCapabilities.clipboard.writeText(surface.path);
      } else if (selection === "close") {
        handleCloseTab(surface);
      } else if (selection === "close-others") {
        closeRemovedTerminal(state.surfaces.filter((entry) => entry.id !== surface.id));
        uiActions.closeOtherRightPanelSurfaces(surface.id);
      } else if (selection === "close-to-right") {
        closeRemovedTerminal(state.surfaces.slice(surfaceIndex + 1));
        uiActions.closeRightPanelSurfacesToRight(surface.id);
      } else if (selection === "close-all") {
        closeRemovedTerminal(state.surfaces);
        uiActions.closeAllRightPanelSurfaces();
      }
    },
    [closeRemovedTerminal, handleCloseTab, state.surfaces],
  );

  const handleAddSurface = useCallback((kind: Exclude<RightPanelKind, "file">) => {
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
  const terminalWidth = sheet
    ? resolveRightPanelSheetWidth(viewport.width)
    : maximized
      ? viewport.width
      : resize.width;
  const terminalHeight = Math.max(1, viewport.height - 52);

  const emptyActions: ReadonlyArray<RightPanelActionItem> = ADDABLE_SURFACES.map((item) => ({
    key: item.kind,
    icon: <Icon name={ADDABLE_ICONS[item.kind]} size={20} color="#818181" />,
    label: item.label,
    description: item.disabled && item.disabledReason ? item.disabledReason : item.description,
    disabled: item.disabled,
    onSelect: () => {
      if (
        item.kind === "browser" ||
        item.kind === "files" ||
        item.kind === "diff" ||
        item.kind === "plan" ||
        item.kind === "terminal"
      ) {
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
      style={
        sheet
          ? { width: `${resolveRightPanelSheetWidth(viewport.width)}px` }
          : maximized
            ? undefined
            : { width: `${resize.width}px` }
      }
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
            {...resize.dragHandlers}
            main-thread:ref={resize.handleRef}
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
                onAuxClick={() => handleCloseTab(surface)}
                onContextMenu={(event) => {
                  void handleTabContextMenu(surface, event).catch(() => undefined);
                }}
                closeIcon={<Icon name="x" size={14} color="#818181" />}
                closeVisible
              />
            ))}
          </view>
        </scroll-view>
        {/* Add surface button */}
        <view className="right-panel__add-btn-wrapper" data-floating-anchor="right-panel-add-menu">
          <view
            className={`right-panel__add-btn lynx-titlebar-no-drag${
              showAddMenu ? " right-panel__add-btn--active" : ""
            }`}
            bindtap={handleToggleAddMenu}
          >
            <Icon name="plus" size={16} color="#818181" />
          </view>
          {showAddMenu ? (
            <>
              <view
                className="right-panel__add-menu-dismiss"
                bindtap={() => setShowAddMenu(false)}
              />
              <view
                className="right-panel__add-menu"
                data-floating-popup="right-panel-add-menu"
                catchtap={() => undefined}
              >
                {ADDABLE_SURFACES.map((item) => (
                  <view
                    key={item.kind}
                    className={`right-panel__add-item${item.disabled ? " right-panel__add-item--disabled" : ""}`}
                    data-right-panel-add-kind={item.kind}
                    {...(item.disabled
                      ? {}
                      : {
                          bindtap: () => {
                            if (
                              item.kind === "browser" ||
                              item.kind === "files" ||
                              item.kind === "diff" ||
                              item.kind === "plan" ||
                              item.kind === "terminal"
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
            </>
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
            <Icon name={maximized ? "minimize-2" : "maximize-2"} size={14} color="#818181" />
          </view>
          <view
            className={`right-panel__layout-control${
              activeSurface?.kind === "terminal" ? " right-panel__layout-control--active" : ""
            }`}
            aria-label="Open terminal panel"
            aria-pressed={activeSurface?.kind === "terminal" ? "true" : "false"}
            bindtap={() => handleAddSurface("terminal")}
          >
            <Icon name="panel-bottom" size={14} color="#818181" />
          </view>
          <view
            className="right-panel__layout-control right-panel__layout-control--close"
            aria-label="Toggle right panel"
            bindtap={handleClose}
          >
            <Icon name="panel-right" size={14} color="#818181" />
          </view>
        </view>
      </view>

      {/* Content */}
      <view className="right-panel__content">
        {state.surfaces
          .filter(
            (surface): surface is Extract<RightPanelSurface, { kind: "browser" }> =>
              surface.kind === "browser",
          )
          .map((surface) => (
            <BrowserPanel
              key={surface.tabId}
              tabId={surface.tabId}
              active={surface.id === state.activeSurfaceId}
              width={terminalWidth}
              height={terminalHeight}
            />
          ))}
        {hasActiveSurface ? (
          activeSurface.kind === "browser" ? null : (
            renderSurface(activeSurface, {
              activeThreadId: activeThreadId ?? null,
              activePlan,
              activeProposedPlan,
              terminalHeight,
              terminalWidth,
            })
          )
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

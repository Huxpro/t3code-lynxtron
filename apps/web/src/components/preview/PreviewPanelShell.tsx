import { type ReactNode, useEffect, useState } from "react";

import { isElectron } from "~/env";
import { useResizableWidth } from "~/hooks/useResizableWidth";
import { cn } from "~/lib/utils";
import {
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
  RIGHT_PANEL_WIDTH_STORAGE_KEY,
  resolveRightPanelMaximumWidth,
} from "~/rightPanelLayout";

import { RightPanelResizeHandle } from "./RightPanelResizeHandle";

export type PreviewPanelMode = "inline" | "sheet" | "sidebar" | "embedded";

export function getPreviewPanelMaxWidth(viewportWidth: number): number {
  return resolveRightPanelMaximumWidth(viewportWidth);
}

/**
 * Shell for the preview panel. In inline mode the panel is user-resizable
 * via a drag handle on the left edge; width persists per browser. In
 * sheet/sidebar modes the parent owns the size.
 */
export function PreviewPanelShell(props: {
  mode: PreviewPanelMode;
  maximized?: boolean;
  children: ReactNode;
}) {
  const useDragRegion = isElectron && props.mode !== "sheet" && props.mode !== "embedded";
  const isInline = props.mode === "inline";
  const maxWidth = useViewportClampedMaxWidth();
  const { width, handlers } = useResizableWidth({
    storageKey: RIGHT_PANEL_WIDTH_STORAGE_KEY,
    defaultWidth: RIGHT_PANEL_DEFAULT_WIDTH,
    minWidth: RIGHT_PANEL_MIN_WIDTH,
    maxWidth,
    edge: "left",
  });

  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col self-stretch bg-background",
        isInline
          ? props.maximized
            ? "flex-1 border-l border-border"
            : "shrink-0 border-l border-border"
          : "w-full",
      )}
      style={isInline && !props.maximized ? { width: `${width}px` } : undefined}
      data-preview-panel-mode={props.mode}
      data-preview-panel-maximized={props.maximized ? "true" : "false"}
    >
      {isInline && !props.maximized ? <RightPanelResizeHandle handlers={handlers} /> : null}
      {useDragRegion ? <div className="electron-drag-region h-0 w-full" aria-hidden /> : null}
      {props.children}
    </div>
  );
}

/**
 * Track viewport width to derive a sensible upper bound for the panel.
 * Resize-aware so dragging the OS window narrower re-clamps the stored
 * width on the next render (the hook's clamp picks this up automatically).
 */
function useViewportClampedMaxWidth(): number {
  const [vw, setVw] = useState(() => (typeof window === "undefined" ? 1280 : window.innerWidth));
  useEffect(() => {
    if (typeof window === "undefined") return;
    let frame = 0;
    const onResize = () => {
      // Coalesce rapid resize events into one rAF tick.
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        setVw(window.innerWidth);
      });
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);
  return getPreviewPanelMaxWidth(vw);
}

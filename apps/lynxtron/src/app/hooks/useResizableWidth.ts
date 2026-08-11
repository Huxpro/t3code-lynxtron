import {
  clampResizableWidth,
  type ResizableWidthEdge,
} from "@t3tools/client-runtime/presentation/resizable-width";
import { runOnBackground, useCallback, useEffect, useMainThreadRef, useState } from "@lynx-js/react";
import type { MainThread } from "@lynx-js/types";

import { clientCapabilities } from "../platform/clientCapabilities";
import { resolveMainThreadResizeWidth } from "./resizeFrame";

interface UseResizableWidthOptions {
  readonly storageKey: string;
  readonly defaultWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly edge: ResizableWidthEdge;
  readonly value?: number;
  readonly onResize?: (width: number) => void;
  readonly target: "sidebar" | "right-panel";
}

interface MainThreadResizeState {
  readonly active: boolean;
  readonly startX: number;
  readonly startWidth: number;
  readonly width: number;
}

function mainThreadPointerX(event: MainThread.MouseEvent | MainThread.TouchEvent): number | null {
  "main thread";
  const touch =
    "touches" in event ? (event.touches[0] ?? event.changedTouches[0]) : undefined;
  const detailX =
    event.detail &&
    typeof event.detail === "object" &&
    "x" in event.detail
      ? event.detail.x
      : undefined;
  const value =
    touch?.clientX ??
    touch?.pageX ??
    ("clientX" in event ? event.clientX : undefined) ??
    ("pageX" in event ? event.pageX : undefined) ??
    ("x" in event ? event.x : undefined) ??
    detailX;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function setMainThreadResizeWidth(
  target: "sidebar" | "right-panel",
  width: number,
  targetRef: { current: MainThread.Element | null },
): void {
  "main thread";
  const value = `${width}px`;
  if (target === "right-panel") {
    targetRef.current?.setStyleProperty("width", value);
    targetRef.current?.setAttribute("data-right-panel-width", String(width));
    return;
  }
  const wrapper = lynx.querySelector('[data-slot="sidebar-wrapper"]');
  wrapper?.setStyleProperty("--sidebar-width", value);
  wrapper?.setAttribute("data-sidebar-width", String(width));
  wrapper?.querySelector(".sidebar-gap")?.setStyleProperty("width", value);
  wrapper?.querySelector(".sidebar-container")?.setStyleProperty("width", value);
  wrapper?.querySelector(".sidebar-inner")?.setStyleProperty("width", value);
}

export function useResizableWidth(options: UseResizableWidthOptions) {
  const bounds = {
    defaultWidth: options.defaultWidth,
    minWidth: options.minWidth,
    maxWidth: options.maxWidth,
  };
  const [internalWidth, setInternalWidth] = useState(() => {
    const raw = clientCapabilities.storage.getItem(options.storageKey);
    const parsed = raw === null ? null : Number(JSON.parse(raw));
    return clampResizableWidth(parsed ?? options.defaultWidth, bounds);
  });
  const width = options.value ?? internalWidth;
  const targetRef = useMainThreadRef<MainThread.Element>(null);
  const dragRef = useMainThreadRef<MainThreadResizeState>({
    active: false,
    startX: 0,
    startWidth: width,
    width,
  });

  useEffect(() => {
    const next = clampResizableWidth(width, bounds);
    if (options.value === undefined) setInternalWidth(next);
    options.onResize?.(next);
  }, [options.defaultWidth, options.maxWidth, options.minWidth]);

  const commitWidth = useCallback(
    (nextWidth: number) => {
      "background only";
      clientCapabilities.storage.setItem(options.storageKey, JSON.stringify(nextWidth));
      if (options.value === undefined) setInternalWidth(nextWidth);
      options.onResize?.(nextWidth);
    },
    [options.onResize, options.storageKey, options.value],
  );

  const start = (event: MainThread.MouseEvent | MainThread.TouchEvent) => {
    "main thread";
    const clientX = mainThreadPointerX(event);
    if (clientX === null) return;
    dragRef.current = {
      active: true,
      startX: clientX,
      startWidth: width,
      width,
    };
    event.stopPropagation();
  };

  const finish = (event: MainThread.MouseEvent | MainThread.TouchEvent) => {
    "main thread";
    const current = dragRef.current;
    if (!current.active) return;
    const clientX = mainThreadPointerX(event);
    const nextWidth =
      clientX === null
        ? current.width
        : resolveMainThreadResizeWidth(
            current.startX,
            current.startWidth,
            clientX,
            options.edge,
            options,
          );
    setMainThreadResizeWidth(options.target, nextWidth, targetRef);
    dragRef.current = {
      active: false,
      startX: current.startX,
      startWidth: current.startWidth,
      width: nextWidth,
    };
    event.stopPropagation();
    runOnBackground(commitWidth)(nextWidth);
  };

  const move = (event: MainThread.MouseEvent | MainThread.TouchEvent) => {
    "main thread";
    const current = dragRef.current;
    if (!current.active) return;
    if ("buttons" in event && event.buttons === 0) {
      finish(event);
      return;
    }
    const clientX = mainThreadPointerX(event);
    if (clientX === null) return;
    const nextWidth = resolveMainThreadResizeWidth(
      current.startX,
      current.startWidth,
      clientX,
      options.edge,
      options,
    );
    if (nextWidth === current.width) return;
    dragRef.current = { ...current, width: nextWidth };
    setMainThreadResizeWidth(options.target, nextWidth, targetRef);
    event.stopPropagation();
  };

  const cancel = (event: MainThread.MouseEvent | MainThread.TouchEvent) => {
    "main thread";
    const current = dragRef.current;
    if (!current.active) return;
    setMainThreadResizeWidth(options.target, current.startWidth, targetRef);
    dragRef.current = {
      active: false,
      startX: current.startX,
      startWidth: current.startWidth,
      width: current.startWidth,
    };
    event.stopPropagation();
  };

  return {
    width: clampResizableWidth(width, bounds),
    targetRef,
    handlers: {
      "main-thread:bindmousedown": start,
      "main-thread:bindtouchstart": start,
      "main-thread:global-bindmousemove": move,
      "main-thread:global-bindtouchmove": move,
      "main-thread:global-bindmouseup": finish,
      "main-thread:global-bindtouchend": finish,
      "main-thread:global-bindtouchcancel": cancel,
    },
  };
}

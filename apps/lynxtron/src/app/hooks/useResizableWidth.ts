import { clampResizableWidth, type ResizableWidthEdge } from "@t3tools/lynx-logic/resizableWidth";
import {
  runOnBackground,
  runOnMainThread,
  useCallback,
  useEffect,
  useMainThreadRef,
  useState,
} from "@lynx-js/react";
import type { MainThread } from "@lynx-js/types";

import { clientCapabilities } from "../platform/clientCapabilities";
import { resolveMainThreadResizeWidth } from "./resizeFrame" with { runtime: "shared" };
import { pointerClientX } from "./resizePointer" with { runtime: "shared" };

interface UseResizableWidthOptions {
  readonly storageKey: string;
  readonly defaultWidth: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly edge: ResizableWidthEdge;
  readonly value?: number | undefined;
  readonly onResize?: ((width: number) => void) | undefined;
  readonly target: "sidebar" | "right-panel";
  readonly testProbe?: boolean | undefined;
}

interface MainThreadResizeState {
  readonly active: boolean;
  readonly startX: number;
  readonly startWidth: number;
  readonly width: number;
}

interface MainThreadSidebarTargets {
  readonly wrapper: MainThread.Element | null;
  readonly gap: MainThread.Element | null;
  readonly container: MainThread.Element | null;
}

interface ResizeTestEvent {
  readonly target?: unknown;
  readonly startX?: unknown;
  readonly endX?: unknown;
}

interface GlobalEventEmitterLike {
  addListener?: (eventName: string, listener: (value: unknown) => void) => void;
}

declare const lynx: {
  getJSModule?: (name: string) => GlobalEventEmitterLike | undefined;
  querySelector(selector: string): MainThread.Element | null;
};

const T3_RESIZE_TEST_EVENT = "t3:resize-test";
let resizeTestBridgeInstalled = false;

function installResizeTestBridge(): void {
  "background only";
  if (resizeTestBridgeInstalled) return;
  let emitter: GlobalEventEmitterLike | undefined;
  try {
    emitter = typeof lynx !== "undefined" ? lynx.getJSModule?.("GlobalEventEmitter") : undefined;
  } catch {
    emitter = undefined;
  }
  if (!emitter?.addListener) return;
  resizeTestBridgeInstalled = true;
  emitter.addListener(T3_RESIZE_TEST_EVENT, (value: unknown) => {
    const input = typeof value === "object" && value !== null ? (value as ResizeTestEvent) : null;
    if (
      (input?.target !== "sidebar" && input?.target !== "right-panel") ||
      typeof input.startX !== "number" ||
      typeof input.endX !== "number"
    ) {
      return;
    }
    const probe = (
      globalThis as {
        __T3_LYNXTRON_MTS_RESIZE_PROBE__?: Partial<
          Record<"sidebar" | "right-panel", (startX: number, endX: number) => Promise<void>>
        >;
      }
    ).__T3_LYNXTRON_MTS_RESIZE_PROBE__?.[input.target];
    void probe?.(input.startX, input.endX);
  });
}

export function useResizableWidth(options: UseResizableWidthOptions) {
  const bounds = {
    defaultWidth: options.defaultWidth,
    minWidth: options.minWidth,
    maxWidth: options.maxWidth,
  };
  const edge = options.edge;
  const minWidth = options.minWidth;
  const maxWidth = options.maxWidth;
  const target = options.target;
  const [internalWidth, setInternalWidth] = useState(() => {
    const raw = clientCapabilities.storage.getItem(options.storageKey);
    const parsed = raw === null ? null : Number(JSON.parse(raw));
    return clampResizableWidth(parsed ?? options.defaultWidth, bounds);
  });
  const width = options.value ?? internalWidth;
  const targetRef = useMainThreadRef<MainThread.Element>(null);
  const handleRef = useMainThreadRef<MainThread.Element>(null);
  const sidebarTargetsRef = useMainThreadRef<MainThreadSidebarTargets>({
    wrapper: null,
    gap: null,
    container: null,
  });
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
    const clientX = pointerClientX(event);
    if (clientX === null) return;
    dragRef.current = {
      active: true,
      startX: clientX,
      startWidth: width,
      width,
    };
    if (target === "sidebar") {
      sidebarTargetsRef.current = {
        wrapper: lynx.querySelector('[data-slot="sidebar-wrapper"]'),
        gap: lynx.querySelector(".sidebar-gap"),
        container: lynx.querySelector(".sidebar-container"),
      };
      sidebarTargetsRef.current.gap?.setStyleProperty("transition-duration", "0ms");
      sidebarTargetsRef.current.container?.setStyleProperty("transition-duration", "0ms");
    }
    handleRef.current?.setAttribute("hit-slop", "2000px");
    event.stopPropagation?.();
  };

  const finish = (event: MainThread.MouseEvent | MainThread.TouchEvent) => {
    "main thread";
    const current = dragRef.current;
    if (!current.active) return;
    const clientX = pointerClientX(event);
    const nextWidth =
      clientX === null
        ? current.width
        : resolveMainThreadResizeWidth(current.startX, current.startWidth, clientX, edge, {
            minWidth,
            maxWidth,
          });
    const value = `${nextWidth}px`;
    if (target === "right-panel") {
      targetRef.current?.setStyleProperty("width", value);
      targetRef.current?.setAttribute("data-right-panel-width", `${nextWidth}`);
    } else {
      const targets = sidebarTargetsRef.current;
      targets.wrapper?.setStyleProperty("--sidebar-width", value);
      targets.wrapper?.setAttribute("data-sidebar-width", `${nextWidth}`);
      targets.gap?.setStyleProperty("width", value);
      targets.container?.setStyleProperty("width", value);
      targets.gap?.setStyleProperty("transition-duration", "200ms");
      targets.container?.setStyleProperty("transition-duration", "200ms");
    }
    handleRef.current?.setAttribute("hit-slop", "0px");
    dragRef.current = {
      active: false,
      startX: current.startX,
      startWidth: current.startWidth,
      width: nextWidth,
    };
    event.stopPropagation?.();
    runOnBackground(commitWidth)(nextWidth);
  };

  const move = (event: MainThread.MouseEvent | MainThread.TouchEvent) => {
    "main thread";
    const current = dragRef.current;
    if (!current.active) return;
    const clientX = pointerClientX(event);
    if (clientX === null) return;
    const nextWidth = resolveMainThreadResizeWidth(
      current.startX,
      current.startWidth,
      clientX,
      edge,
      { minWidth, maxWidth },
    );
    if (nextWidth === current.width) return;
    dragRef.current = { ...current, width: nextWidth };
    const value = `${nextWidth}px`;
    if (target === "right-panel") {
      targetRef.current?.setStyleProperty("width", value);
    } else {
      const targets = sidebarTargetsRef.current;
      targets.wrapper?.setStyleProperty("--sidebar-width", value);
      targets.gap?.setStyleProperty("width", value);
      targets.container?.setStyleProperty("width", value);
    }
    event.stopPropagation?.();
  };

  const cancel = (event: MainThread.MouseEvent | MainThread.TouchEvent) => {
    "main thread";
    const current = dragRef.current;
    if (!current.active) return;
    const value = `${current.startWidth}px`;
    if (target === "right-panel") {
      targetRef.current?.setStyleProperty("width", value);
      targetRef.current?.setAttribute("data-right-panel-width", `${current.startWidth}`);
    } else {
      const targets = sidebarTargetsRef.current;
      targets.wrapper?.setStyleProperty("--sidebar-width", value);
      targets.wrapper?.setAttribute("data-sidebar-width", `${current.startWidth}`);
      targets.gap?.setStyleProperty("width", value);
      targets.container?.setStyleProperty("width", value);
      targets.gap?.setStyleProperty("transition-duration", "200ms");
      targets.container?.setStyleProperty("transition-duration", "200ms");
    }
    handleRef.current?.setAttribute("hit-slop", "0px");
    dragRef.current = {
      active: false,
      startX: current.startX,
      startWidth: current.startWidth,
      width: current.startWidth,
    };
    event.stopPropagation?.();
  };

  useEffect(() => {
    if (!options.testProbe) return;
    installResizeTestBridge();
    const targetGlobal = globalThis as {
      __T3_LYNXTRON_MTS_RESIZE_PROBE__?: Partial<
        Record<"sidebar" | "right-panel", (startX: number, endX: number) => Promise<void>>
      >;
    };
    const probes = targetGlobal.__T3_LYNXTRON_MTS_RESIZE_PROBE__ ?? {};
    const probe = async (startX: number, endX: number) => {
      await runOnMainThread(start)({ buttons: 1, clientX: startX } as MainThread.MouseEvent);
      await runOnMainThread(move)({ buttons: 1, clientX: endX } as MainThread.MouseEvent);
      await runOnMainThread(finish)({ buttons: 0, clientX: endX } as MainThread.MouseEvent);
    };
    probes[options.target] = probe;
    targetGlobal.__T3_LYNXTRON_MTS_RESIZE_PROBE__ = probes;
    return () => {
      if (probes[options.target] === probe) delete probes[options.target];
      if (Object.keys(probes).length === 0) {
        delete targetGlobal.__T3_LYNXTRON_MTS_RESIZE_PROBE__;
      }
    };
  }, [options.target, options.testProbe, start, move, finish]);

  return {
    width: clampResizableWidth(width, bounds),
    targetRef,
    handleRef,
    handlers: {
      "main-thread:bindmousedown": start,
      "main-thread:bindtouchstart": start,
    },
    dragHandlers: {
      "main-thread:bindmousemove": move,
      "main-thread:bindtouchmove": move,
      "main-thread:bindmouseup": finish,
      "main-thread:bindtouchend": finish,
      "main-thread:bindtouchcancel": cancel,
    },
  };
}

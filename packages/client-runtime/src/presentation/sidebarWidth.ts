import {
  beginResizableWidth,
  moveResizableWidth,
  type ResizableWidthState,
} from "./resizableWidth.ts";

export const THREAD_SIDEBAR_WIDTH_STORAGE_KEY = "chat_thread_sidebar_width";
export const THREAD_SIDEBAR_DEFAULT_WIDTH = 16 * 16;
export const THREAD_SIDEBAR_MIN_WIDTH = 13 * 16;
export const THREAD_MAIN_CONTENT_MIN_WIDTH = 40 * 16;
export const THREAD_MOBILE_SIDEBAR_BREAKPOINT = 768;
export const THREAD_MOBILE_SIDEBAR_MAX_WIDTH = 340;
export const THREAD_MOBILE_SIDEBAR_VIEWPORT_INSET = 24;

export function isThreadMobileSidebarViewport(viewportWidth: number): boolean {
  return Math.floor(viewportWidth) < THREAD_MOBILE_SIDEBAR_BREAKPOINT;
}

export function resolveThreadMobileSidebarWidth(viewportWidth: number): number {
  return Math.min(
    THREAD_MOBILE_SIDEBAR_MAX_WIDTH,
    Math.max(0, Math.floor(viewportWidth) - THREAD_MOBILE_SIDEBAR_VIEWPORT_INSET),
  );
}

export function resolveThreadSidebarMaximumWidth(viewportWidth: number): number {
  return Math.max(
    THREAD_SIDEBAR_MIN_WIDTH,
    Math.floor(viewportWidth) - THREAD_MAIN_CONTENT_MIN_WIDTH,
  );
}

export function resolveResponsiveThreadSidebarMaximumWidth(
  sidebarWidth: number,
  viewportWidth: number,
): number {
  if (isThreadMobileSidebarViewport(viewportWidth)) {
    return Math.max(
      THREAD_SIDEBAR_MIN_WIDTH,
      Number.isFinite(sidebarWidth) ? sidebarWidth : THREAD_SIDEBAR_DEFAULT_WIDTH,
    );
  }
  return resolveThreadSidebarMaximumWidth(viewportWidth);
}

export function clampThreadSidebarWidth(width: number, viewportWidth: number): number {
  const finiteWidth = Number.isFinite(width) ? width : THREAD_SIDEBAR_DEFAULT_WIDTH;
  return Math.max(
    THREAD_SIDEBAR_MIN_WIDTH,
    Math.min(finiteWidth, resolveThreadSidebarMaximumWidth(viewportWidth)),
  );
}

export function resolveInitialThreadSidebarWidth(
  storedWidth: number | null,
  viewportWidth: number,
): number {
  return clampThreadSidebarWidth(storedWidth ?? THREAD_SIDEBAR_DEFAULT_WIDTH, viewportWidth);
}

export function resolveResponsiveThreadSidebarWidth(
  storedWidth: number | null,
  viewportWidth: number,
): number {
  if (isThreadMobileSidebarViewport(viewportWidth)) {
    return Number.isFinite(storedWidth) ? (storedWidth as number) : THREAD_SIDEBAR_DEFAULT_WIDTH;
  }
  return resolveInitialThreadSidebarWidth(storedWidth, viewportWidth);
}

export type SidebarResizeState = ResizableWidthState;

export function beginSidebarResize(startX: number, width: number): SidebarResizeState {
  return beginResizableWidth(startX, width);
}

export function moveSidebarResize(
  state: SidebarResizeState,
  clientX: number,
  viewportWidth: number,
): SidebarResizeState {
  return moveResizableWidth(state, clientX, "right", {
    defaultWidth: THREAD_SIDEBAR_DEFAULT_WIDTH,
    minWidth: THREAD_SIDEBAR_MIN_WIDTH,
    maxWidth: resolveThreadSidebarMaximumWidth(viewportWidth),
  });
}

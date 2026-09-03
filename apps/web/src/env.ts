/**
 * True when running inside the Electron preload bridge, false in a regular browser.
 * The preload script sets window.desktopBridge via contextBridge before any web-app
 * code executes, so this is reliable at module load time.
 */
export const isElectron = typeof window !== "undefined" && window.desktopBridge !== undefined;

export const isDesktopVisualHost =
  isElectron || (typeof window !== "undefined" && window.__T3_WORKBENCH_DESKTOP_VISUAL__ === true);

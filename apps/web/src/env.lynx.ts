/**
 * Lynx has no Electron preload bridge, but it is a desktop client: upstream
 * modules read `isElectron` to tell the desktop shell from a browser tab
 * (the `isDesktop` / `isWeb` shortcut context, desktop-only settings).
 */
export const isElectron = true;

export const isDesktopVisualHost = false;

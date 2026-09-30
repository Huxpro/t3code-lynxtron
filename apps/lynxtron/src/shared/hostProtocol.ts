/**
 * Host capabilities the Lynx renderer asks the Lynxtron main process for over
 * `lynxBridge` (renderer: `NativeModules.bridge.call`; main:
 * `lynxBridge.handle`). They live in main because the preload's Lynx
 * background realm exposes only `contextBridge` from `lynxtron`.
 */
export const T3_HOST_METHODS = {
  writeClipboardText: "t3:host.writeClipboardText",
  openExternal: "t3:host.openExternal",
  openPath: "t3:host.openPath",
} as const;

/** Every host method replies with this; `error` is set when it failed. */
export interface HostReply {
  readonly error?: string;
}

export function isHostReply(value: unknown): value is HostReply {
  return (
    typeof value === "object" &&
    value !== null &&
    (!("error" in value) || typeof (value as { error: unknown }).error === "string")
  );
}

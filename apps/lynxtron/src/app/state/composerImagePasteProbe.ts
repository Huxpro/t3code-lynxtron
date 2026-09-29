import { T3_COMPOSER_IMAGE_PASTE_TEST_METHOD } from "../../shared/composerImagePasteProtocol.ts";
import { callBridge, type BridgeCallModule } from "./mainConnectorTransport";

declare const NativeModules:
  | {
      bridge?: BridgeCallModule;
    }
  | undefined;

/**
 * Probe-only: asks main to run Edit > Paste with `dataUrl` as the clipboard
 * image. Main only registers the method for probe launches.
 */
export function requestComposerImagePasteProbe(dataUrl: string): boolean {
  const bridge = typeof NativeModules === "undefined" ? undefined : NativeModules?.bridge;
  if (!bridge) return false;
  void callBridge(bridge, T3_COMPOSER_IMAGE_PASTE_TEST_METHOD, { dataUrl }).catch((error) =>
    console.error(`[lynx-composer] image paste probe failed: ${String(error)}`),
  );
  return true;
}

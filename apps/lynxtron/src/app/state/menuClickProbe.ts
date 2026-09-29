import { T3_MENU_CLICK_FOR_TEST_METHOD } from "../../shared/viewportProtocol.ts";
import { callBridge, type BridgeCallModule } from "./mainConnectorTransport";

declare const NativeModules:
  | {
      bridge?: BridgeCallModule;
    }
  | undefined;

/**
 * Probe-only: asks main to click an application menu item, exercising the
 * accelerator's real dispatch path without physical keyboard input.
 */
export function requestMenuClickProbe(id: string): boolean {
  const bridge = typeof NativeModules === "undefined" ? undefined : NativeModules?.bridge;
  if (!bridge) return false;
  void callBridge(bridge, T3_MENU_CLICK_FOR_TEST_METHOD, { id }).catch((error) =>
    console.error(`[lynx-probe] menu click probe failed: ${String(error)}`),
  );
  return true;
}

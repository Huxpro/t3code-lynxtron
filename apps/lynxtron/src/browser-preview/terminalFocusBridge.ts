import {
  isTerminalReturnFocusParams,
  T3_TERMINAL_RETURN_FOCUS_METHOD,
} from "../shared/terminalKeyboardProtocol.ts";

export function handleBrowserPreviewTerminalFocus(method: string, data: unknown): boolean | null {
  if (method !== T3_TERMINAL_RETURN_FOCUS_METHOD) return null;
  if (!isTerminalReturnFocusParams(data)) {
    throw new Error("Malformed terminal focus handshake");
  }
  return false;
}

import {
  parseClipboardWriteTextInput,
  T3_CLIPBOARD_WRITE_TEXT_METHOD,
  parseNativeConfirmInput,
  T3_CONFIRM_METHOD,
} from "../../shared/capabilityProtocol.ts";

export interface CapabilityBridgeHost {
  handle(method: string, handler: (params: unknown) => void): void;
  removeHandler(method: string): void;
}

export function startConfirmCapabilityHost(
  bridge: CapabilityBridgeHost,
  confirm: (input: ReturnType<typeof parseNativeConfirmInput>) => Promise<boolean>,
): { readonly dispose: () => void } {
  bridge.handle(T3_CONFIRM_METHOD, (params) => confirm(parseNativeConfirmInput(params)));
  return { dispose: () => bridge.removeHandler(T3_CONFIRM_METHOD) };
}

/**
 * Probe runs answer native confirmations from a comma-separated queue
 * ("confirm" or "cancel") and log each prompt instead of showing a dialog.
 */
export function createProbeConfirm(
  answers: string,
  log: (line: string) => void,
): (input: ReturnType<typeof parseNativeConfirmInput>) => Promise<boolean> {
  const queue = answers
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return async (input) => {
    const answer = queue.shift() ?? "cancel";
    log(`[confirm-probe] ${JSON.stringify({ ...input, answer })}`);
    return answer === "confirm";
  };
}

export function startClipboardCapabilityHost(
  bridge: CapabilityBridgeHost,
  writeText: (value: string) => void,
): { readonly dispose: () => void } {
  bridge.handle(T3_CLIPBOARD_WRITE_TEXT_METHOD, (params) => {
    writeText(parseClipboardWriteTextInput(params).value);
  });
  return {
    dispose: () => bridge.removeHandler(T3_CLIPBOARD_WRITE_TEXT_METHOD),
  };
}

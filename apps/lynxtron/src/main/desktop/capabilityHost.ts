import {
  parseClipboardWriteTextInput,
  T3_CLIPBOARD_WRITE_TEXT_METHOD,
} from "../../shared/capabilityProtocol.ts";

export interface CapabilityBridgeHost {
  handle(method: string, handler: (params: unknown) => void): void;
  removeHandler(method: string): void;
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

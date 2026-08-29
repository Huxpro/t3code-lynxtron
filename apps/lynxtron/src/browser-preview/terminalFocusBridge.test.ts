import { assert, describe, it } from "vite-plus/test";

import { T3_TERMINAL_RETURN_FOCUS_METHOD } from "../shared/terminalKeyboardProtocol.ts";
import { handleBrowserPreviewTerminalFocus } from "./terminalFocusBridge.ts";

describe("browser preview terminal focus bridge", () => {
  it("accepts the Native focus handshake as an explicit unsupported no-op", () => {
    assert.isFalse(
      handleBrowserPreviewTerminalFocus(T3_TERMINAL_RETURN_FOCUS_METHOD, { focused: true }),
    );
    assert.isFalse(
      handleBrowserPreviewTerminalFocus(T3_TERMINAL_RETURN_FOCUS_METHOD, { focused: false }),
    );
  });

  it("leaves unrelated methods to the connector host", () => {
    assert.isNull(handleBrowserPreviewTerminalFocus("t3:connector.ready", {}));
  });

  it("rejects malformed focus packets", () => {
    assert.throws(
      () => handleBrowserPreviewTerminalFocus(T3_TERMINAL_RETURN_FOCUS_METHOD, {}),
      /Malformed terminal focus handshake/,
    );
  });
});

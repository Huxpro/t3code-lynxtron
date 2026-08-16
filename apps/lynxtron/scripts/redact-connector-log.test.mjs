import { describe, expect, it } from "vite-plus/test";

import { redactConnectorLog } from "./redact-connector-log.mjs";

describe("redactConnectorLog", () => {
  it("removes websocket tickets without changing ordinary diagnostics", () => {
    expect(
      redactConnectorLog(
        "[connector] socketUrl ws://127.0.0.1:1234/ws?wsTicket=secret.ticket-value",
      ),
    ).toBe("[connector] socketUrl ws://127.0.0.1:1234/ws?wsTicket=<redacted>");
    expect(redactConnectorLog("[connector] 10 models")).toBe("[connector] 10 models");
  });
});

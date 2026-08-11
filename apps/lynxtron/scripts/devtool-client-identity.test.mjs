import { describe, expect, it } from "vitest";

import {
  parseListeningTcpPorts,
  selectLatestDevToolSession,
  selectOwnedDevToolClient,
} from "./devtool-client-identity.mjs";

describe("Lynx DevTool client identity", () => {
  it("parses only listening TCP names from lsof field output", () => {
    expect([...parseListeningTcpPorts("p42\nn*:8903\nn127.0.0.1:57021\n")]).toEqual([8903, 57021]);
  });

  it("selects the app client owned by the recorded process port", () => {
    const selected = selectOwnedDevToolClient({
      appName: "@t3tools/lynxtron",
      clients: [
        { id: "localhost:8901", info: { App: "@synara/lynx" }, port: 8901 },
        { id: "localhost:8903", info: { App: "@t3tools/lynxtron" }, port: 8903 },
        { id: "localhost:8904", info: { App: "@t3tools/lynxtron" }, port: 8904 },
      ],
      ownedPorts: new Set([57021, 8903]),
    });
    expect(selected.id).toBe("localhost:8903");
  });

  it("derives the port from older DevTool client ids", () => {
    const selected = selectOwnedDevToolClient({
      appName: "@t3tools/lynxtron",
      clientId: "localhost:8903",
      clients: [{ id: "localhost:8903", info: { App: "@t3tools/lynxtron" } }],
      ownedPorts: new Set([8903]),
    });
    expect(selected.port).toBe(8903);
  });

  it("rejects an ambiguous app-name-only selection", () => {
    expect(() =>
      selectOwnedDevToolClient({
        appName: "@t3tools/lynxtron",
        clients: [
          { id: "localhost:8903", info: { App: "@t3tools/lynxtron" }, port: 8903 },
          { id: "localhost:8904", info: { App: "@t3tools/lynxtron" }, port: 8904 },
        ],
      }),
    ).toThrow("found 2");
  });

  it("selects the newest session deterministically", () => {
    expect(
      selectLatestDevToolSession([
        { session_id: 2, url: "old.bundle" },
        { session_id: 7, url: "current.bundle" },
      ]).url,
    ).toBe("current.bundle");
  });
});

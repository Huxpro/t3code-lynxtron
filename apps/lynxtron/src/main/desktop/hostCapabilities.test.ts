import { assert, describe, it } from "vite-plus/test";

import { T3_HOST_METHODS, type HostReply } from "../../shared/hostProtocol.ts";
import { registerHostCapabilities } from "./hostCapabilities.ts";

function setup(
  overrides: { openExternal?: () => Promise<void>; openPath?: () => Promise<string> } = {},
) {
  const handlers = new Map<string, (params: unknown) => Promise<HostReply>>();
  const calls: string[] = [];
  registerHostCapabilities({
    clipboard: { writeText: (text) => void calls.push(`clipboard:${text}`) },
    shell: {
      openExternal: overrides.openExternal ?? (async (url) => void calls.push(`external:${url}`)),
      openPath: overrides.openPath ?? (async (path) => (calls.push(`path:${path}`), "")),
    },
    registerHandler: (method, handler) => void handlers.set(method, handler),
  });
  const call = (method: string, params: unknown) => handlers.get(method)!(params);
  return { calls, call };
}

describe("registerHostCapabilities", () => {
  it("writes the clipboard and opens targets from main", async () => {
    const { calls, call } = setup();
    assert.deepEqual(await call(T3_HOST_METHODS.writeClipboardText, { text: "hi" }), {});
    assert.deepEqual(await call(T3_HOST_METHODS.openExternal, { url: "https://t3.codes" }), {});
    assert.deepEqual(await call(T3_HOST_METHODS.openPath, { path: "/tmp" }), {});
    assert.deepEqual(calls, ["clipboard:hi", "external:https://t3.codes", "path:/tmp"]);
  });

  it("reports failures and malformed params as errors", async () => {
    const { call } = setup({
      openExternal: async () => {
        throw new Error("no opener");
      },
      openPath: async () => "not found",
    });
    assert.deepEqual(await call(T3_HOST_METHODS.openExternal, { url: "x" }), {
      error: "no opener",
    });
    assert.deepEqual(await call(T3_HOST_METHODS.openPath, { path: "/nope" }), {
      error: "not found",
    });
    assert.deepEqual(await call(T3_HOST_METHODS.writeClipboardText, {}), {
      error: "text is required",
    });
  });
});

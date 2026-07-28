import { createRequire } from "node:module";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";

const require = createRequire(import.meta.url);
const baseDir = mkdtempSync(join(tmpdir(), "t3code-lynxtron-settings-"));
const previousBaseDir = process.env.T3_LYNXTRON_BASE_DIR;
const previousServerStdio = process.env.T3_LYNXTRON_SERVER_STDIO;
process.env.T3_LYNXTRON_BASE_DIR = baseDir;
process.env.T3_LYNXTRON_SERVER_STDIO = "ignore";

const { T3Connector } = require("../dist/desktop/connector.bundle.cjs");
let configEventCount = 0;
const connector = new T3Connector({
  onStatus: () => {},
  onConfig: () => {
    configEventCount += 1;
  },
  onShell: () => {},
  onThread: () => {},
  onLog: () => {},
});

try {
  const connected = await connector.connect();
  if (connected.status !== "ready" || !connected.config) {
    throw new Error(`Connector did not become ready: ${connected.status}`);
  }

  const original = connected.config.settings.enableAssistantStreaming;
  const updated = await connector.updateServerSettings({
    patch: { enableAssistantStreaming: !original },
  });
  if (updated.settings.enableAssistantStreaming !== !original) {
    throw new Error("server.updateSettings did not return the toggled canonical setting");
  }

  const restored = await connector.updateServerSettings({
    patch: { enableAssistantStreaming: original },
  });
  if (restored.settings.enableAssistantStreaming !== original) {
    throw new Error("server.updateSettings did not restore the canonical setting");
  }
  if (configEventCount < 3) {
    throw new Error(`Expected initial/update/restore config events, received ${configEventCount}`);
  }

  console.log(
    JSON.stringify({
      ok: true,
      status: connected.status,
      original,
      toggled: updated.settings.enableAssistantStreaming,
      restored: restored.settings.enableAssistantStreaming,
      configEventCount,
    }),
  );
} finally {
  connector.dispose();
  await new Promise((resolve) => setTimeout(resolve, 500));
  if (previousBaseDir === undefined) {
    delete process.env.T3_LYNXTRON_BASE_DIR;
  } else {
    process.env.T3_LYNXTRON_BASE_DIR = previousBaseDir;
  }
  if (previousServerStdio === undefined) {
    delete process.env.T3_LYNXTRON_SERVER_STDIO;
  } else {
    process.env.T3_LYNXTRON_SERVER_STDIO = previousServerStdio;
  }
  const expectedPrefix = `${tmpdir()}${sep}t3code-lynxtron-settings-`;
  if (!baseDir.startsWith(expectedPrefix)) {
    throw new Error(`Refusing to clean unexpected smoke directory: ${baseDir}`);
  }
  rmSync(baseDir, { recursive: true, force: true });
}

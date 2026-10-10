import { assert, describe, it } from "vite-plus/test";
import {
  DEFAULT_SERVER_SETTINGS,
  EnvironmentId,
  type ServerConfig,
  type ServerSettingsPatch,
} from "@t3tools/contracts";
import * as Duration from "effect/Duration";

import {
  classifyConnectorFailure,
  classifyConnectorSequence,
  decodeConnectorCommandParams,
  decodeConnectorCommandResult,
  decodeConnectorServerConfig,
  encodeConnectorCommandParams,
  encodeConnectorCommandResult,
  encodeConnectorServerConfig,
  isConnectorCommandName,
  isConnectorEventEnvelope,
  isConnectorSyncReply,
  projectRepoContext,
  resolveConnectorAssetUrl,
} from "./connectorProtocol.ts";

function serverConfig(settings = DEFAULT_SERVER_SETTINGS): ServerConfig {
  return {
    environment: {
      environmentId: EnvironmentId.make("connector-protocol-test"),
      label: "Connector Protocol Test",
      platform: { os: "darwin", arch: "arm64" },
      serverVersion: "0.0.0-test",
      capabilities: { repositoryIdentity: true },
    },
    auth: {
      policy: "loopback-browser",
      bootstrapMethods: ["one-time-token"],
      sessionMethods: ["browser-session-cookie"],
      sessionCookieName: "t3_test_session",
    },
    cwd: "/tmp/connector-protocol-test",
    keybindingsConfigPath: "/tmp/connector-protocol-test/keybindings.json",
    keybindings: [],
    issues: [],
    providers: [],
    availableEditors: [],
    observability: {
      logsDirectoryPath: "/tmp/connector-protocol-test/logs",
      localTracingEnabled: false,
      otlpTracesEnabled: false,
      otlpLogsEnabled: false,
      otlpMetricsEnabled: false,
    },
    settings,
  };
}

describe("project repo context", () => {
  it("preserves non-repository, branch, and detached repository states", () => {
    assert.deepEqual(projectRepoContext({ isRepo: false, refName: null }), {
      isRepo: false,
      branch: null,
    });
    assert.deepEqual(projectRepoContext({ isRepo: true, refName: "main" }), {
      isRepo: true,
      branch: "main",
    });
    assert.deepEqual(projectRepoContext({ isRepo: true, refName: null }), {
      isRepo: true,
      branch: null,
    });
  });
});

describe("connector protocol schema codecs", () => {
  it("round-trips duration-bearing settings through JSON-safe command params", () => {
    const patch: ServerSettingsPatch = {
      backgroundActivity: {
        overrides: {
          providerHealthRefreshInterval: Duration.seconds(90),
        },
      },
    };

    const encoded = encodeConnectorCommandParams("updateServerSettings", { patch }) as {
      patch: {
        backgroundActivity?: {
          overrides?: { providerHealthRefreshInterval?: number };
        };
      };
    };
    assert.equal(
      encoded.patch.backgroundActivity?.overrides?.providerHealthRefreshInterval,
      90_000,
    );

    const decoded = decodeConnectorCommandParams(
      "updateServerSettings",
      structuredClone(encoded),
    ) as { patch: ServerSettingsPatch };
    assert.isTrue(
      Duration.isDuration(
        decoded.patch.backgroundActivity?.overrides?.providerHealthRefreshInterval,
      ),
    );
    assert.equal(
      Duration.toMillis(
        decoded.patch.backgroundActivity!.overrides!.providerHealthRefreshInterval!,
      ),
      90_000,
    );
  });

  it("round-trips duration-bearing config snapshots and command results", () => {
    const config = serverConfig({
      ...DEFAULT_SERVER_SETTINGS,
      backgroundActivity: {
        schemaVersion: 1,
        profile: "custom",
        baseProfile: "balanced",
        overrides: {
          providerHealthRefreshInterval: Duration.seconds(90),
        },
      },
    });

    const encoded = encodeConnectorServerConfig(config);
    assert.equal(encoded.settings.automaticGitFetchInterval, 30_000);
    assert.equal(
      encoded.settings.backgroundActivity?.overrides?.providerHealthRefreshInterval,
      90_000,
    );

    const decoded = decodeConnectorServerConfig(structuredClone(encoded));
    assert.equal(Duration.toMillis(decoded.settings.automaticGitFetchInterval), 30_000);
    assert.equal(
      Duration.toMillis(
        decoded.settings.backgroundActivity.overrides.providerHealthRefreshInterval!,
      ),
      90_000,
    );

    const result = decodeConnectorCommandResult(
      "updateServerSettings",
      structuredClone(encodeConnectorCommandResult("updateServerSettings", config)),
    ) as ServerConfig;
    assert.equal(
      Duration.toMillis(
        result.settings.backgroundActivity.overrides.providerHealthRefreshInterval!,
      ),
      90_000,
    );
  });
});

describe("connector protocol sequence classification", () => {
  it("applies the next in-order event", () => {
    assert.equal(classifyConnectorSequence(41, 42), "apply");
  });

  it("applies the first event after a fresh sync", () => {
    assert.equal(classifyConnectorSequence(0, 1), "apply");
  });

  it("drops duplicate and stale events", () => {
    assert.equal(classifyConnectorSequence(42, 42), "duplicate");
    assert.equal(classifyConnectorSequence(42, 7), "duplicate");
  });

  it("flags skipped sequences as a gap", () => {
    assert.equal(classifyConnectorSequence(41, 43), "gap");
    assert.equal(classifyConnectorSequence(0, 9), "gap");
  });
});

describe("connector protocol guards", () => {
  it("resolves signed asset paths to renderer-loadable HTTP URLs", () => {
    assert.deepEqual(
      resolveConnectorAssetUrl("ws://127.0.0.1:4567/ws?ticket=secret", {
        relativeUrl: "/api/assets/signed/favicon.png",
        expiresAt: 123,
      }),
      { url: "http://127.0.0.1:4567/api/assets/signed/favicon.png", expiresAt: 123 },
    );
  });

  it("accepts only allowlisted command names", () => {
    assert.isTrue(isConnectorCommandName("sendPrompt"));
    assert.isTrue(isConnectorCommandName("reconnect"));
    assert.isTrue(isConnectorCommandName("createAssetUrl"));
    assert.isTrue(isConnectorCommandName("respondToApproval"));
    assert.isTrue(isConnectorCommandName("respondToUserInput"));
    assert.isTrue(isConnectorCommandName("readProjectBranch"));
    assert.isTrue(isConnectorCommandName("readVcsStatus"));
    assert.isTrue(isConnectorCommandName("initializeRepository"));
    assert.isTrue(isConnectorCommandName("publishRepository"));
    assert.isTrue(isConnectorCommandName("updateProject"));
    assert.isTrue(isConnectorCommandName("deleteProject"));
    assert.isTrue(isConnectorCommandName("updateProjectScripts"));
    assert.isTrue(isConnectorCommandName("upsertKeybinding"));
    assert.isTrue(isConnectorCommandName("removeKeybinding"));
    assert.isTrue(isConnectorCommandName("openInEditor"));
    assert.isTrue(isConnectorCommandName("searchProjectEntries"));
    assert.isTrue(isConnectorCommandName("refreshProviders"));
    assert.isTrue(isConnectorCommandName("updateProvider"));
    assert.isTrue(isConnectorCommandName("revokeOtherClientSessions"));
    assert.isTrue(isConnectorCommandName("openTerminal"));
    assert.isTrue(isConnectorCommandName("writeTerminal"));
    assert.isTrue(isConnectorCommandName("resizeTerminal"));
    assert.isTrue(isConnectorCommandName("closeTerminal"));
    assert.isFalse(isConnectorCommandName("dispose"));
    assert.isFalse(isConnectorCommandName("connect"));
    assert.isFalse(isConnectorCommandName("__proto__"));
    assert.isFalse(isConnectorCommandName(42));
  });

  it("validates sequenced envelopes", () => {
    assert.isTrue(isConnectorEventEnvelope({ seq: 1, kind: "status", payload: {} }));
    assert.isTrue(isConnectorEventEnvelope({ seq: 9, kind: "thread", threadId: "t", payload: {} }));
    assert.isTrue(
      isConnectorEventEnvelope({
        seq: 10,
        kind: "terminal",
        threadId: "t",
        terminalId: "term-1",
        payload: {},
      }),
    );
    assert.isFalse(isConnectorEventEnvelope({ seq: 0, kind: "status", payload: {} }));
    assert.isFalse(isConnectorEventEnvelope({ seq: 1.5, kind: "status", payload: {} }));
    assert.isFalse(isConnectorEventEnvelope({ seq: 1, kind: "everything", payload: {} }));
    assert.isFalse(isConnectorEventEnvelope(null));
    assert.isFalse(isConnectorEventEnvelope("t3:connector-event"));
  });

  it("validates sync replies", () => {
    const snapshot = {
      status: { status: "ready" },
      config: null,
      access: { pairingLinks: [], clientSessions: [] },
      shell: { projects: [], threads: [] },
      threads: {},
      terminals: {},
    };
    assert.isTrue(isConnectorSyncReply({ seq: 0, snapshot }));
    assert.isTrue(isConnectorSyncReply({ seq: 12, snapshot }));
    assert.isFalse(isConnectorSyncReply({ seq: -1, snapshot }));
    assert.isFalse(isConnectorSyncReply({ snapshot }));
    assert.isFalse(isConnectorSyncReply({ seq: 1, snapshot: null }));
    // The main process's reply carries its status alone.
    assert.isTrue(isConnectorSyncReply({ seq: 1, snapshot: { status: { status: "ready" } } }));
    assert.isFalse(isConnectorSyncReply({ seq: 1, snapshot: { shell: snapshot.shell } }));
    assert.isFalse(isConnectorSyncReply(null));
  });
});

describe("classifyConnectorFailure", () => {
  it.each([
    ['token exchange failed (401): {"code":"auth_invalid"}', "pairing"],
    [
      "This device's session with the remote environment expired or was revoked. Pair this device again.",
      "pairing",
    ],
    ["environment identity mismatch (expected a, received b)", "pairing"],
    ["ws ticket failed (401): denied", "authentication"],
    ["connect ECONNREFUSED 127.0.0.1:5173", "transport"],
    ["t3 server did not become ready", "server-readiness"],
    ["Server exited (code=1 signal=null).", "server-readiness"],
    ["shell subscription failed to decode the snapshot", "product-sync"],
    ["Something else entirely", null],
    [undefined, null],
  ] as const)("classifies %s as %s", (detail, layer) => {
    assert.equal(classifyConnectorFailure(detail), layer);
  });
});

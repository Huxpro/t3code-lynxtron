import { assert, describe, it } from "vite-plus/test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { resolveConnectorLaunchTarget, targetResolvesPathsLocally } from "./connector";

describe("connector launch target", () => {
  it("keeps the existing owned local-server mode by default", () => {
    assert.deepEqual(resolveConnectorLaunchTarget({ T3_LYNXTRON_BASE_DIR: " /tmp/t3-owned " }), {
      kind: "owned-local",
      baseDir: "/tmp/t3-owned",
    });
  });

  it("attaches to a direct pairing URL instead of owning another server", () => {
    assert.deepEqual(
      resolveConnectorLaunchTarget({
        T3_LYNXTRON_BASE_DIR: "/tmp/ignored-owned-state",
        T3_LYNXTRON_PAIRING_URL: "http://127.0.0.1:45679/pair#token=pairing-secret",
      }),
      {
        kind: "existing-environment",
        source: "explicit-pairing-url",
        httpBaseUrl: "http://127.0.0.1:45679/",
        wsBaseUrl: "ws://127.0.0.1:45679/",
        credential: "pairing-secret",
      },
    );
  });

  it("resolves hosted pairing links through the shared remote contract", () => {
    assert.deepEqual(
      resolveConnectorLaunchTarget({
        T3_LYNXTRON_PAIRING_URL:
          "https://app.t3.codes/pair?host=https%3A%2F%2Fdesktop.example%3A44342%2F#token=pairing-secret",
      }),
      {
        kind: "existing-environment",
        source: "explicit-pairing-url",
        httpBaseUrl: "https://desktop.example:44342/",
        wsBaseUrl: "wss://desktop.example:44342/",
        credential: "pairing-secret",
      },
    );
  });

  it("keeps an explicit isolated base directory ahead of desktop auto-discovery", () => {
    assert.deepEqual(
      resolveConnectorLaunchTarget({ T3_LYNXTRON_BASE_DIR: "/tmp/isolated" }, () => ({
        version: 1,
        ownerPid: 101,
        environmentId: "desktop",
        httpBaseUrl: "http://127.0.0.1:45679/",
        wsBaseUrl: "ws://127.0.0.1:45679/",
        bootstrapCredential: "desktop-secret",
        publishedAt: "2026-08-24T01:00:00Z",
      })),
      { kind: "owned-local", baseDir: "/tmp/isolated" },
    );
  });

  it("attaches to the newest live desktop environment by default", () => {
    assert.deepEqual(
      resolveConnectorLaunchTarget({}, () => ({
        version: 1,
        ownerPid: 101,
        environmentId: "desktop-environment",
        httpBaseUrl: "http://127.0.0.1:45679/",
        wsBaseUrl: "ws://127.0.0.1:45679/",
        bootstrapCredential: "desktop-secret",
        publishedAt: "2026-08-24T01:00:00Z",
      })),
      {
        kind: "existing-environment",
        source: "desktop-rendezvous",
        httpBaseUrl: "http://127.0.0.1:45679/",
        wsBaseUrl: "ws://127.0.0.1:45679/",
        credential: "desktop-secret",
        expectedEnvironmentId: "desktop-environment",
      },
    );
  });

  it("keeps an explicit pairing URL ahead of desktop auto-discovery", () => {
    const target = resolveConnectorLaunchTarget(
      { T3_LYNXTRON_PAIRING_URL: "http://127.0.0.1:4777/pair#token=explicit" },
      () => {
        throw new Error("desktop discovery must not run");
      },
    );
    assert.deepEqual(target, {
      kind: "existing-environment",
      source: "explicit-pairing-url",
      httpBaseUrl: "http://127.0.0.1:4777/",
      wsBaseUrl: "ws://127.0.0.1:4777/",
      credential: "explicit",
    });
  });

  it("keeps external-environment ownership out of the connector lifecycle", () => {
    const source = readFileSync(path.join(import.meta.dirname, "connector.ts"), "utf8");
    const existingConnect = source.slice(
      source.indexOf("private async connectExistingEnvironment"),
      source.indexOf("  private async exchangeCredential"),
    );
    const dispose = source.slice(source.indexOf("dispose(): void"));

    assert.notInclude(existingConnect, "spawn(");
    assert.include(existingConnect, "this.ownsServer = false;");
    assert.include(existingConnect, "target.expectedEnvironmentId");
    assert.include(existingConnect, "throw new Error(REMOTE_SESSION_EXPIRED_MESSAGE);");
    assert.include(dispose, 'this.child?.kill("SIGKILL")');
  });
});

describe("what the main process leaves to the renderer", () => {
  it("opens no connection to the server beyond its HTTP requests", () => {
    const source = readFileSync(path.join(import.meta.dirname, "connector.ts"), "utf8");
    const imports = [...source.matchAll(/from "([^"]+)"/gu)].map((match) => match[1]);

    assert.deepEqual(
      imports.filter((name) => !name?.startsWith("node:")),
      ["@t3tools/shared/remote", "./localEnvironmentRendezvous.ts", "./serverPaths"],
    );
  });
});

describe("targetResolvesPathsLocally", () => {
  const pairing = (httpBaseUrl: string) =>
    ({
      kind: "existing-environment",
      httpBaseUrl,
      wsBaseUrl: httpBaseUrl.replace(/^http/u, "ws"),
      credential: "c",
      source: "explicit-pairing-url",
    }) as const;

  it("treats owned servers, the desktop rendezvous, and loopback pairing as local", () => {
    assert.isTrue(targetResolvesPathsLocally({ kind: "owned-local", baseDir: "/tmp/t3" }));
    assert.isTrue(
      targetResolvesPathsLocally({
        ...pairing("http://192.168.1.20:3773"),
        source: "desktop-rendezvous",
      }),
    );
    assert.isTrue(targetResolvesPathsLocally(pairing("http://127.0.0.1:3773")));
    assert.isTrue(targetResolvesPathsLocally(pairing("http://localhost:3773")));
  });

  it("never resolves a remote environment's paths on this machine", () => {
    assert.isFalse(targetResolvesPathsLocally(pairing("http://192.168.1.20:3773")));
    assert.isFalse(targetResolvesPathsLocally(pairing("https://box.tailnet.ts.net")));
    assert.isFalse(targetResolvesPathsLocally(pairing("not a url")));
  });
});

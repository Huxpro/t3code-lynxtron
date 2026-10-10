import {
  AVAILABLE_CONNECTION_STATE,
  PrimaryConnectionTarget,
} from "@t3tools/client-runtime/connection";
import type { EnvironmentCatalogState } from "@t3tools/client-runtime/state/connections";
import { EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { assert, describe, it } from "vite-plus/test";

import { summarizeUpstreamShadow } from "./upstreamShadow.ts";

const now = new Date("2026-10-09T00:00:00.000Z");
const environmentId = EnvironmentId.make("environment-1");

function catalogWithPrimary(): EnvironmentCatalogState {
  return {
    isReady: true,
    entries: new Map([
      [
        environmentId,
        {
          target: new PrimaryConnectionTarget({
            environmentId,
            label: "Local",
            httpBaseUrl: "http://127.0.0.1:4100",
            wsBaseUrl: "ws://127.0.0.1:4100",
          }),
          profile: Option.none(),
          enabled: true,
        },
      ],
    ]),
  };
}

describe("summarizeUpstreamShadow", () => {
  it("says it is starting before the catalog has loaded", () => {
    const summary = summarizeUpstreamShadow(
      { catalog: AsyncResult.initial(), connection: null, shell: null },
      now,
    );
    assert.equal(summary.phase, "starting");
    assert.equal(summary.environmentId, null);
    assert.equal(summary.projects, null);
    assert.equal(summary.updatedAt, "2026-10-09T00:00:00.000Z");
  });

  it("reports a runtime that failed to build, with its cause", () => {
    const summary = summarizeUpstreamShadow(
      { catalog: AsyncResult.fail(new Error("layer exploded")), connection: null, shell: null },
      now,
    );
    assert.equal(summary.phase, "failed");
    assert.match(summary.error ?? "", /layer exploded/);
  });

  it("reports the primary environment's phase, shell status and last failure", () => {
    const summary = summarizeUpstreamShadow(
      {
        catalog: AsyncResult.success(catalogWithPrimary()),
        connection: AsyncResult.success({ ...AVAILABLE_CONNECTION_STATE, phase: "backoff" }),
        shell: { snapshot: Option.none(), status: "empty", error: Option.some("no shell yet") },
      },
      now,
    );
    assert.equal(summary.phase, "backoff");
    assert.equal(summary.environmentId, "environment-1");
    assert.equal(summary.shell, "empty");
    assert.equal(summary.threads, null);
    assert.deepEqual(summary.threadIds, []);
    assert.equal(summary.error, "no shell yet");
    assert.doesNotThrow(() => JSON.stringify(summary));
  });
});

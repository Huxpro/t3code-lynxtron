import { assert, describe, it } from "vite-plus/test";

import {
  parseLocalEnvironmentRendezvous,
  selectNewestLiveLocalEnvironmentRendezvous,
} from "./localEnvironmentRendezvous.ts";

const descriptor = (ownerPid: number, publishedAt: string) => ({
  version: 1 as const,
  ownerPid,
  environmentId: `environment-${ownerPid}`,
  httpBaseUrl: `http://127.0.0.1:${ownerPid}/`,
  wsBaseUrl: `ws://127.0.0.1:${ownerPid}/`,
  bootstrapCredential: `secret-${ownerPid}`,
  publishedAt,
});

describe("local environment rendezvous", () => {
  it("parses a valid descriptor", () => {
    assert.deepEqual(
      parseLocalEnvironmentRendezvous(descriptor(101, "2026-08-24T01:00:00Z")),
      descriptor(101, "2026-08-24T01:00:00Z"),
    );
  });

  it("rejects malformed endpoints and incomplete descriptors", () => {
    assert.isNull(parseLocalEnvironmentRendezvous({ version: 1 }));
    assert.isNull(
      parseLocalEnvironmentRendezvous({
        ...descriptor(101, "2026-08-24T01:00:00Z"),
        wsBaseUrl: "http://127.0.0.1:101/",
      }),
    );
  });

  it("selects the newest descriptor whose owner is alive", () => {
    const older = descriptor(101, "2026-08-24T01:00:00Z");
    const newestDead = descriptor(202, "2026-08-24T03:00:00Z");
    const newestLive = descriptor(303, "2026-08-24T02:00:00Z");
    assert.equal(
      selectNewestLiveLocalEnvironmentRendezvous(
        [older, newestDead, newestLive, "not-an-object"],
        (pid) => pid !== 202,
      )?.ownerPid,
      303,
    );
  });
});

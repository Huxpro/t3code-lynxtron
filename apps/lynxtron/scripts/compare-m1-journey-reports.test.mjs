import { assert, describe, it } from "vite-plus/test";

import { compareM1JourneyReports } from "./compare-m1-journey-reports.mjs";

const attachment = { name: "image.png", mimeType: "image/png", sizeBytes: 566 };
const prompt = (token) => `Reply exactly ${token}_ACCEPTED. Do not use tools or modify files.`;
const electron = {
  status: "pass",
  snapshotSha256: "abc",
  provider: { instanceId: "opencode", model: "opencode/big-pickle" },
  promptToken: "WEB",
  canonical: {
    createdThreadIds: ["t-web"],
    userMessages: 1,
    turns: 1,
    userMessage: { text: `[README.md](README.md) ${prompt("WEB")}`, attachments: [attachment] },
  },
};
const native = (overrides = {}) => ({
  results: [
    {
      status: "pass",
      m1LocalJourney: {
        snapshot: {
          fixtureStateSha256: "abc",
          provider: { instanceId: "opencode", model: "opencode/big-pickle" },
        },
        retry: {
          promptToken: "LYNX",
          createdThreadIds: ["t-lynx"],
          counts: {
            userMessages: 1,
            turns: 1,
            userMessage: {
              text: `${prompt("LYNX")} [README.md](README.md)\n<terminal_context>x</terminal_context>`,
              attachments: [attachment],
              ...overrides,
            },
          },
        },
      },
    },
  ],
});

describe("compareM1JourneyReports", () => {
  it("passes matching payloads and records renderer-only blocks", () => {
    const result = compareM1JourneyReports({ electron, native: native() });
    assert.equal(result.status, "pass");
    assert.deepEqual(result.boundary.nativeOnlyBlocks, ["<terminal_context>"]);
  });

  it("accepts re-encoded bytes but records them as a boundary", () => {
    const result = compareM1JourneyReports({
      electron,
      native: native({ attachments: [{ ...attachment, sizeBytes: 232 }] }),
    });
    assert.equal(result.status, "pass");
    assert.deepEqual(result.boundary.attachmentBytes.native, [232]);
  });

  it("fails when the attachment identity differs", () => {
    const result = compareM1JourneyReports({
      electron,
      native: native({ attachments: [{ ...attachment, mimeType: "image/jpeg" }] }),
    });
    assert.equal(result.status, "fail");
    assert.isFalse(result.checks.sameAttachments);
  });
});

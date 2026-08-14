import { assert, describe, it } from "vite-plus/test";

import {
  assertComposerGeometry,
  assertComposerRouteState,
  buildPlan11SemanticCertification,
  buildPlan11SemanticOutcomes,
} from "./plan11-semantic-outcomes.mjs";

const rect = (x, width = 100, height = 40, y = 20) => ({ x, y, width, height });

function measurements(overrides = {}) {
  return {
    anchors: {
      shell: { rect: rect(10, 600, 180) },
      surface: { rect: rect(10, 600, 140) },
      editor: { rect: rect(20, 580, 70, 30) },
      footer: { rect: rect(20, 580, 40, 100) },
      toolbar: { rect: rect(20, 520, 32, 104) },
      model: { rect: rect(20, 100, 28, 106) },
      runtime: { rect: rect(140, 100, 28, 106) },
      runtimeWrap: { rect: rect(140, 100, 28, 106) },
      interaction: { rect: rect(260, 100, 28, 106) },
      primaryAction: { rect: rect(570, 32, 32, 104) },
      context: { rect: rect(20, 580, 40, 150) },
      ...overrides,
    },
  };
}

describe("Plan 11 semantic outcome assertions", () => {
  it("accepts visible Composer geometry in canonical control order", () => {
    assert.doesNotThrow(() => assertComposerGeometry(measurements()));
  });

  it("rejects missing, reordered, and shell-escaping geometry independently", () => {
    assert.throws(
      () => assertComposerGeometry(measurements({ editor: { rect: null } })),
      /editor lacks visible geometry/u,
    );
    assert.throws(
      () => assertComposerGeometry(measurements({ runtime: { rect: rect(15) } })),
      /"runtimeWrap":/u,
    );
    assert.throws(
      () => assertComposerGeometry(measurements({ context: { rect: rect(0, 620, 40, 150) } })),
      /context escaped the shared shell/u,
    );
  });

  it("rejects overlapping controls and a detached context strip", () => {
    assert.throws(
      () => assertComposerGeometry(measurements({ runtime: { rect: rect(100, 100, 28, 106) } })),
      /overlap or lost canonical order/u,
    );
    assert.throws(
      () => assertComposerGeometry(measurements({ context: { rect: rect(20, 580, 40, 180) } })),
      /lost its shared tucked overlap/u,
    );
  });

  it("distinguishes existing-thread and new-thread Composer states", () => {
    const visible = { rect: rect(0) };

    assert.doesNotThrow(() =>
      assertComposerRouteState({ hero: null, overlay: visible }, "existing-thread"),
    );
    assert.doesNotThrow(() =>
      assertComposerRouteState({ hero: visible, overlay: null }, "new-thread"),
    );
    assert.throws(
      () => assertComposerRouteState({ hero: visible, overlay: null }, "existing-thread"),
      /must begin on an existing thread with transcript content/u,
    );
    assert.throws(
      () => assertComposerRouteState({ hero: null, overlay: visible }, "new-thread"),
      /did not enter the canonical new-thread state/u,
    );
  });

  it("maps all five outcomes without inferring a missing result", () => {
    assert.deepEqual(
      buildPlan11SemanticOutcomes({
        sidebarScope: { status: "pass" },
        settingsNavigation: { status: "fail" },
        composer: { status: "pass" },
        branding: { status: "pass" },
      }),
      { O1: "pass", O2: "fail", O3: "pass", O4: "pass", O5: "fail" },
    );
  });

  it("cannot claim complete certification without matched visual evidence", () => {
    assert.deepEqual(buildPlan11SemanticCertification(), {
      tier: "plan11-semantic-outcomes",
      visualComparison: "pending-matched-web-lynx-captures",
      complete: false,
    });
  });
});

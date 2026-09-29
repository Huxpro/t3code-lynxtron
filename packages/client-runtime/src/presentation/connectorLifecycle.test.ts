import { assert, describe, it } from "vite-plus/test";

import { presentConnectorLifecycle } from "./connectorLifecycle.ts";

describe("connector lifecycle presentation", () => {
  it("keeps every unavailable phase visible and actionable when appropriate", () => {
    assert.deepInclude(presentConnectorLifecycle("idle"), {
      visible: true,
      title: "Starting T3 Code...",
    });
    assert.deepInclude(presentConnectorLifecycle("starting-server", "Launching on :3000"), {
      visible: true,
      description: "Launching on :3000",
    });
    assert.deepInclude(presentConnectorLifecycle("connecting"), {
      visible: true,
      actionLabel: null,
    });
    assert.deepInclude(presentConnectorLifecycle("error", "Server exited"), {
      visible: true,
      tone: "error",
      description: "Server exited",
      actionLabel: "Retry",
      action: "retry",
    });
  });

  it("removes transient lifecycle UI only after ready", () => {
    assert.deepEqual(presentConnectorLifecycle("ready"), {
      visible: false,
      tone: "neutral",
      title: "Connected",
      description: null,
      actionLabel: null,
      action: null,
    });
  });
});

import { assert, describe, it } from "vite-plus/test";

import { inferSemanticRoute } from "./semanticRoute.mjs";

describe("shared workbench semantic route inference", () => {
  it.each([
    ["new-thread-hero", "new-thread"],
    ["file-editor-detail-light", "existing-thread"],
    ["composer-sendable", "new-thread"],
    ["model-picker-empty", "new-thread"],
    ["existing-thread-completed", "existing-thread"],
    ["existing-thread-completed-no-diff", "existing-thread"],
    ["composer-docked", "existing-thread"],
    ["review-diff", "existing-thread"],
    ["right-panel-terminal-vertical-split", "existing-thread"],
    ["model-picker-selected", "new-thread"],
    ["project-scope-open", "project-scope-open"],
    ["settings-general", "settings-general"],
    ["settings-keybindings-mutation", "settings-keybindings"],
    ["settings-beta-light", "settings-beta"],
    ["settings-connections-mutation-browser", "settings-connections"],
    ["settings-providers-add-dialog-light", "settings-providers"],
    ["settings-source-control-loading", "settings-source-control-loading"],
    ["settings-source-control-error", "settings-source-control-error"],
  ])("maps %s to %s", (stateId, expected) => {
    assert.equal(inferSemanticRoute(stateId), expected);
  });

  it("refuses to guess an unknown Settings route", () => {
    assert.isNull(inferSemanticRoute("settings-future-surface"));
  });
});

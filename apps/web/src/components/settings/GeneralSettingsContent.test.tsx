import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { GeneralSettingsContent } from "./GeneralSettingsContent";
import { GENERAL_SETTINGS_DEFAULT_VALUES } from "./generalSettingsProjection";

describe("GeneralSettingsContent", () => {
  it("keeps Appearance-owned settings out of General and preserves search anchors", () => {
    const markup = renderToStaticMarkup(
      <GeneralSettingsContent
        aboutContent={<div data-about-content />}
        backgroundActivityContent={<div data-background-activity />}
        defaults={GENERAL_SETTINGS_DEFAULT_VALUES}
        diagnosticsControl={<button data-diagnostics-control />}
        diagnosticsDescription="Terminal logs only."
        onUpdate={vi.fn()}
        textGenerationModelControl={<button data-model-control />}
        textGenerationModelDirty={false}
        textGenerationModelStatus="Unavailable on this host."
        textGenerationModelUnavailable
        values={GENERAL_SETTINGS_DEFAULT_VALUES}
        versionLabel="0.0.28"
      />,
    );

    for (const id of [
      "project-grouping",
      "time-format",
      "hide-whitespace-changes",
      "assistant-output",
      "provider-update-checks",
      "auto-open-task-panel",
      "new-threads",
      "add-project-starts-in",
      "archive-confirmation",
      "delete-confirmation",
      "text-generation-model",
      "diagnostics",
    ]) {
      expect(markup).toContain(`id="${id}"`);
    }
    expect(markup).not.toContain(">Theme<");
    expect(markup).not.toContain(">Glass opacity<");
    expect(markup).not.toContain(">Word wrap<");
    expect(markup).toContain("data-background-activity");
    expect(markup).toContain("data-about-content");
    expect(markup).toContain("data-diagnostics-control");
    expect(markup).toContain("data-model-control");
    expect(markup).toContain("Unavailable on this host.");
    expect(markup).toContain('id="text-generation-model"');
    expect(markup).toMatch(
      /id="text-generation-model"[^>]+aria-disabled="true"[^>]+data-settings-unavailable="true"/,
    );
    expect(markup).toContain(
      "Default model for generated text like thread titles and source control content.",
    );
    expect(markup).not.toContain("Configure the model used for generated commit messages");
    expect(markup.indexOf("provider-update-checks")).toBeLessThan(
      markup.indexOf("data-background-activity"),
    );
    expect(markup.indexOf("data-background-activity")).toBeLessThan(
      markup.indexOf("auto-open-task-panel"),
    );
  });

  it("keeps the text generation model row available unless the host disables it", () => {
    const markup = renderToStaticMarkup(
      <GeneralSettingsContent
        defaults={GENERAL_SETTINGS_DEFAULT_VALUES}
        diagnosticsDescription="Terminal logs only."
        onUpdate={vi.fn()}
        textGenerationModelControl={<button data-model-control />}
        textGenerationModelDirty={false}
        values={GENERAL_SETTINGS_DEFAULT_VALUES}
        versionLabel="0.0.28"
      />,
    );

    expect(markup).toContain('id="text-generation-model"');
    expect(markup).not.toMatch(/id="text-generation-model"[^>]+aria-disabled/);
    expect(markup).not.toMatch(/id="text-generation-model"[^>]+data-settings-unavailable/);
  });
});

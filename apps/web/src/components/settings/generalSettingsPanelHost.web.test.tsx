import { renderToStaticMarkup } from "react-dom/server";
import * as Duration from "effect/Duration";
import { describe, expect, it } from "vite-plus/test";

import {
  durationToSeconds,
  GeneralSettingsAboutContent,
  normalizeIntervalSeconds,
} from "./generalSettingsPanelHost.web";

describe("generalSettingsPanelHost.web", () => {
  it("keeps plain Web About free of desktop-only update controls", () => {
    const markup = renderToStaticMarkup(<GeneralSettingsAboutContent versionLabel="ignored" />);

    expect(markup).toContain("Version");
    expect(markup).toContain("Current version of the application.");
    expect(markup).not.toContain("Check for Updates");
    expect(markup).not.toContain("Update track");
  });

  it("normalizes background intervals at the Web host boundary", () => {
    expect(durationToSeconds(Duration.seconds(45))).toBe(45);
    expect(normalizeIntervalSeconds(null, 5)).toBe(5);
    expect(normalizeIntervalSeconds(4.6, 5)).toBe(5);
    expect(normalizeIntervalSeconds(30.4)).toBe(30);
  });
});

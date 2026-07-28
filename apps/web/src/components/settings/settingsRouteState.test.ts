import { describe, expect, it } from "vite-plus/test";

import {
  initialSettingsRestoreState,
  isGeneralSettingsPath,
  projectSettingsRestorePresentation,
  reduceSettingsRestoreState,
  settingsRestoreDisabled,
  settingsRestoreLabel,
} from "./settingsRouteState";

describe("Settings route restore state", () => {
  it("tracks changed, confirming, restoring, restored, and failed states independently", () => {
    const changed = initialSettingsRestoreState(2);
    expect(settingsRestoreDisabled(changed)).toBe(false);
    expect(settingsRestoreLabel(changed)).toBe("Restore defaults");

    const confirming = reduceSettingsRestoreState(changed, { type: "restore-requested" });
    expect(confirming.status).toBe("confirming");
    expect(settingsRestoreDisabled(confirming)).toBe(true);
    expect(settingsRestoreLabel(confirming)).toBe("Restore defaults");
    expect(
      projectSettingsRestorePresentation({
        changedSettingLabels: ["Theme", "Project Grouping"],
        pathname: "/settings/general",
        state: confirming,
      }),
    ).toEqual({
      actionDisabled: true,
      actionLabel: "Restore defaults",
      confirmation: {
        actions: [
          { kind: "cancel", label: "Cancel" },
          { kind: "confirm", label: "Restore" },
        ],
        description: "This will reset: Theme, Project Grouping.",
        title: "Restore default settings?",
      },
      visible: true,
    });

    expect(reduceSettingsRestoreState(confirming, { type: "restore-cancelled" })).toEqual({
      changedSettingCount: 2,
      status: "idle",
    });

    const restoring = reduceSettingsRestoreState(confirming, { type: "restore-confirmed" });
    expect(settingsRestoreDisabled(restoring)).toBe(true);
    expect(settingsRestoreLabel(restoring)).toBe("Restoring…");

    const restored = reduceSettingsRestoreState(restoring, { type: "restore-succeeded" });
    expect(settingsRestoreLabel(restored)).toBe("Restored");
    expect(reduceSettingsRestoreState(restored, { type: "settings-changed", count: 0 })).toEqual({
      changedSettingCount: 0,
      status: "restored",
    });

    expect(
      settingsRestoreLabel(reduceSettingsRestoreState(changed, { type: "restore-failed" })),
    ).toBe("Retry restore");
  });

  it("recognizes both General route spellings", () => {
    expect(isGeneralSettingsPath("/settings")).toBe(true);
    expect(isGeneralSettingsPath("/settings/general")).toBe(true);
    expect(isGeneralSettingsPath("/settings/providers")).toBe(false);
  });
});

import { describe, expect, it } from "vite-plus/test";

import {
  PORTABLE_CLIENT_SETTINGS_DEFAULTS,
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
} from "@t3tools/lynx-logic/settings";

import {
  GENERAL_SETTINGS_DEFAULT_VALUES,
  projectGeneralSettingsValues,
} from "./generalSettingsProjection";

describe("General Settings surface projection", () => {
  it("keeps the shared default snapshot aligned with portable defaults", () => {
    expect(
      projectGeneralSettingsValues(
        PORTABLE_CLIENT_SETTINGS_DEFAULTS,
        PORTABLE_SERVER_SETTINGS_DEFAULTS,
      ),
    ).toEqual(GENERAL_SETTINGS_DEFAULT_VALUES);
  });

  it("projects changed client and server values without renderer-specific fields", () => {
    expect(
      projectGeneralSettingsValues(
        {
          ...PORTABLE_CLIENT_SETTINGS_DEFAULTS,
          diffIgnoreWhitespace: true,
          sidebarProjectGroupingMode: "separate",
        },
        {
          ...PORTABLE_SERVER_SETTINGS_DEFAULTS,
          addProjectBaseDirectory: "~/Projects",
        },
      ),
    ).toMatchObject({
      addProjectBaseDirectory: "~/Projects",
      diffIgnoreWhitespace: true,
      sidebarProjectGroupingMode: "separate",
    });
  });
});

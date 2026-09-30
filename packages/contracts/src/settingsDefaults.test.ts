import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { ClientSettingsSchema, ServerSettings } from "./settings.ts";
import {
  PORTABLE_CLIENT_SETTINGS_DEFAULTS,
  PORTABLE_SERVER_SETTINGS_DEFAULTS,
} from "./settingsDefaults.ts";

describe("portable settings defaults", () => {
  it("match the schema decoding defaults they stand in for", () => {
    const client = Schema.decodeUnknownSync(ClientSettingsSchema)({}) as Record<string, unknown>;
    const server = Schema.decodeUnknownSync(ServerSettings)({}) as Record<string, unknown>;
    for (const [key, value] of Object.entries(PORTABLE_CLIENT_SETTINGS_DEFAULTS)) {
      expect({ key, value: client[key] }).toEqual({ key, value });
    }
    for (const [key, value] of Object.entries(PORTABLE_SERVER_SETTINGS_DEFAULTS)) {
      expect({ key, value: server[key] }).toEqual({ key, value });
    }
  });
});

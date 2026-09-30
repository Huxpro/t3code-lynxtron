import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// Upstream now ships OpenCode disabled by default. Harness fixtures and the
// live OpenCode journeys were recorded while it defaulted on, so each copied
// run state enables it unless the fixture's settings already decide.
export function enableOpenCodeInFixtureState(baseDir) {
  const settingsPath = path.join(baseDir, "userdata", "settings.json");
  const settings = existsSync(settingsPath) ? JSON.parse(readFileSync(settingsPath, "utf8")) : {};
  if (typeof settings.providers?.opencode?.enabled === "boolean") return;
  mkdirSync(path.dirname(settingsPath), { recursive: true });
  writeFileSync(
    settingsPath,
    `${JSON.stringify(
      {
        ...settings,
        providers: {
          ...settings.providers,
          opencode: { ...settings.providers?.opencode, enabled: true },
        },
      },
      null,
      2,
    )}\n`,
  );
}

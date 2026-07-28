import * as path from "node:path";

interface ResolveLynxtronPrefsPathOptions {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory: string;
}

export function resolveLynxtronPrefsPath({
  env,
  homeDirectory,
}: ResolveLynxtronPrefsPathOptions): string {
  const isolatedBaseDirectory = env.T3_LYNXTRON_BASE_DIR?.trim();
  const baseDirectory =
    isolatedBaseDirectory && isolatedBaseDirectory.length > 0
      ? isolatedBaseDirectory
      : path.join(homeDirectory, ".t3-lynxtron");
  return path.join(baseDirectory, "lynxtron-prefs.json");
}

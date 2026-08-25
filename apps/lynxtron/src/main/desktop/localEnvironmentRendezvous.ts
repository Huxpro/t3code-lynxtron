import { readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { selectNewestLiveLocalEnvironmentRendezvous } from "@t3tools/shared/localEnvironmentRendezvous";

const currentUserKey = (): string =>
  typeof process.getuid === "function" ? String(process.getuid()) : (process.env.USER ?? "user");

export function discoverDesktopLocalEnvironment(temporaryDirectory = tmpdir()) {
  const directory = path.join(temporaryDirectory, `t3code-local-environments-${currentUserKey()}`);
  let values: unknown[];
  try {
    values = readdirSync(directory)
      .filter((entry) => entry.endsWith(".json"))
      .map((entry) => {
        try {
          return JSON.parse(readFileSync(path.join(directory, entry), "utf8"));
        } catch {
          return null;
        }
      });
  } catch {
    return null;
  }
  return selectNewestLiveLocalEnvironmentRendezvous(values, (pid) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  });
}

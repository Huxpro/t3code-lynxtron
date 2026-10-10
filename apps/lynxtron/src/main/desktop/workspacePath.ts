// The absolute path a typed workspace root names on this machine. Only Node
// knows the home directory and the working directory a relative path is
// resolved against, so the renderer asks the preload for this and builds the
// project command itself. It is the resolution the connector applies in
// `createProject`.
import * as path from "node:path";

export function resolveWorkspacePath(input: string, homeDirectory: string): string {
  const requested = input.trim();
  return path.resolve(
    requested === "~"
      ? homeDirectory
      : requested.startsWith("~/")
        ? path.join(homeDirectory, requested.slice(2))
        : requested,
  );
}

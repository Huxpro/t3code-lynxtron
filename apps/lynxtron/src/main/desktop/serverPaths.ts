import * as fs from "node:fs";
import * as path from "node:path";

export interface ResolveServerBinOptions {
  readonly explicitPath?: string;
  readonly connectorDirectory: string;
  readonly cwd?: string;
  readonly exists?: (candidate: string) => boolean;
}

export function resolveNodeExecutable(
  env: { readonly T3_NODE_BIN?: string } = process.env,
): string {
  return env.T3_NODE_BIN?.trim() || "node";
}

export function serverBinCandidates(options: ResolveServerBinOptions): ReadonlyArray<string> {
  const cwd = options.cwd ?? process.cwd();
  return [
    options.explicitPath,
    path.resolve(options.connectorDirectory, "../../../server/dist/bin.mjs"),
    path.resolve(cwd, "apps/server/dist/bin.mjs"),
    path.resolve(cwd, "../server/dist/bin.mjs"),
  ].filter((candidate): candidate is string => Boolean(candidate));
}

export function resolveServerBin(options: ResolveServerBinOptions): string {
  const exists = options.exists ?? fs.existsSync;
  const candidates = serverBinCandidates(options);
  const match = candidates.find(exists);
  if (match) {
    return match;
  }

  throw new Error(
    [
      "Unable to find the built t3 server.",
      "Run `pnpm --filter t3 build:bundle` first or set T3_SERVER_BIN.",
      `Checked: ${candidates.join(", ")}`,
    ].join(" "),
  );
}

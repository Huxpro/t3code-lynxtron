import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

function runGit(repoRoot, args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      Buffer.concat([result.stderr ?? Buffer.alloc(0), result.stdout ?? Buffer.alloc(0)])
        .toString("utf8")
        .trim() || `git ${args.join(" ")} exited with status ${result.status}`,
    );
  }
  return result.stdout;
}

function nulSeparatedPaths(buffer) {
  return new Set(
    buffer
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((value) => value.split(path.sep).join("/")),
  );
}

function repositoryPath(repoRoot, artifactPath) {
  const relativePath = path.relative(repoRoot, artifactPath);
  if (
    relativePath === "" ||
    relativePath === ".." ||
    relativePath.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relativePath)
  ) {
    return null;
  }
  return relativePath.split(path.sep).join("/");
}

export function collectGitArtifactProvenance({ repoRoot, artifactPaths }) {
  const absoluteRepoRoot = path.resolve(repoRoot);
  const entries = [...new Set(artifactPaths.map((artifactPath) => path.resolve(artifactPath)))].map(
    (artifactPath) => ({
      artifactPath,
      repositoryPath: repositoryPath(absoluteRepoRoot, artifactPath),
    }),
  );
  const repositoryPaths = entries
    .map((entry) => entry.repositoryPath)
    .filter((value) => value !== null);
  const tracked =
    repositoryPaths.length === 0
      ? new Set()
      : nulSeparatedPaths(
          runGit(absoluteRepoRoot, ["ls-files", "-z", "--cached", "--", ...repositoryPaths]),
        );
  const changed =
    repositoryPaths.length === 0
      ? new Set()
      : nulSeparatedPaths(
          runGit(absoluteRepoRoot, ["diff", "--name-only", "-z", "HEAD", "--", ...repositoryPaths]),
        );

  return new Map(
    entries.map(({ artifactPath, repositoryPath: repoPath }) => {
      let status;
      if (repoPath === null) {
        status = "outside-repository";
      } else if (!existsSync(artifactPath)) {
        status = "missing";
      } else if (!tracked.has(repoPath)) {
        status = "untracked";
      } else if (changed.has(repoPath)) {
        status = "tracked-modified";
      } else {
        status = "tracked-clean";
      }
      return [
        artifactPath,
        {
          status,
          repositoryPath: repoPath,
          tracked: status === "tracked-clean" || status === "tracked-modified",
          archived: status === "tracked-clean",
        },
      ];
    }),
  );
}

export function summarizeArtifactProvenance(provenanceByPath) {
  const counts = {};
  for (const provenance of provenanceByPath.values()) {
    counts[provenance.status] = (counts[provenance.status] ?? 0) + 1;
  }
  return {
    total: provenanceByPath.size,
    archived: [...provenanceByPath.values()].filter((entry) => entry.archived).length,
    counts,
  };
}

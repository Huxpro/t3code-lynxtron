import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function readImageDimensions(filePath) {
  const bytes = readFileSync(filePath);
  if (bytes.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") {
    return {
      width: bytes.readUInt32BE(16),
      height: bytes.readUInt32BE(20),
    };
  }

  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0xd9) continue;
      const segmentLength = bytes.readUInt16BE(offset);
      if (marker >= 0xc0 && marker <= 0xc3) {
        return {
          width: bytes.readUInt16BE(offset + 5),
          height: bytes.readUInt16BE(offset + 3),
        };
      }
      offset += segmentLength;
    }
  }

  throw new Error(`Unsupported image format: ${filePath}`);
}

function runFfmpeg(args) {
  const result = spawnSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], {
    encoding: "utf8",
  });
  if (result.error?.code === "ENOENT") {
    throw new Error("ffmpeg is required to generate visual diagnostics.");
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(result.stderr || `ffmpeg exited with status ${result.status}`);
  }
}

const reference = readArgument("--reference");
const candidate = readArgument("--candidate");
const outputDirectory = path.resolve(readArgument("--output-dir") ?? "reports/screenshots");
const prefix = readArgument("--prefix") ?? "electron-vs-lynx";

if (!reference || !candidate) {
  throw new Error(
    "Usage: visual-diff.mjs --reference electron.png --candidate lynx.png [--output-dir dir] [--prefix name]",
  );
}

const referencePath = path.resolve(reference);
const candidatePath = path.resolve(candidate);
const referenceDimensions = readImageDimensions(referencePath);
const candidateDimensions = readImageDimensions(candidatePath);
if (
  referenceDimensions.width !== candidateDimensions.width ||
  referenceDimensions.height !== candidateDimensions.height
) {
  throw new Error(
    `Image dimensions differ: reference=${JSON.stringify(referenceDimensions)} candidate=${JSON.stringify(candidateDimensions)}`,
  );
}

mkdirSync(outputDirectory, { recursive: true });
const sideBySide = path.join(outputDirectory, `${prefix}-side-by-side.png`);
const difference = path.join(outputDirectory, `${prefix}-diff.png`);

runFfmpeg([
  "-i",
  referencePath,
  "-i",
  candidatePath,
  "-filter_complex",
  "hstack=inputs=2",
  sideBySide,
]);
runFfmpeg([
  "-i",
  referencePath,
  "-i",
  candidatePath,
  "-filter_complex",
  "blend=all_mode=difference",
  difference,
]);

process.stdout.write(
  `${JSON.stringify(
    {
      reference: referencePath,
      candidate: candidatePath,
      dimensions: referenceDimensions,
      sideBySide,
      difference,
      note: "Diagnostic only; this is not a whole-screen pass score.",
    },
    null,
    2,
  )}\n`,
);

#!/usr/bin/env node

// Compares the Plan 14 M1 Web/Electron authority run with the Lynx journey
// gate. Parity is semantic: same snapshot and provider, exactly one canonical
// thread/user message/turn on both sides, the same attachment payload, and
// the same prompt and file mention in the canonical user message text.

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const FILE_MENTION = "[README.md](README.md)";

// Native re-encodes clipboard images through NativeImage.toPNG, so byte size
// may differ from Web's verbatim File bytes; identity is name, type, and count.
const attachmentIdentity = (attachments) =>
  attachments?.map((attachment) => ({ name: attachment.name, mimeType: attachment.mimeType })) ??
  null;

export function compareM1JourneyReports({ electron, native }) {
  const journey = native.results?.[0]?.m1LocalJourney;
  const nativeMessage = journey?.retry?.counts?.userMessage;
  const electronMessage = electron.canonical?.userMessage;
  const normalize = (text, token) => text?.split(token).join("<TOKEN>") ?? "";
  const nativePrompt = normalize(nativeMessage?.text, journey?.retry?.promptToken);
  const electronPrompt = normalize(electronMessage?.text, electron.promptToken);
  const expectedPrompt = "Reply exactly <TOKEN>_ACCEPTED. Do not use tools or modify files.";
  const checks = {
    bothPassed: electron.status === "pass" && native.results?.[0]?.status === "pass",
    sameSnapshot:
      typeof electron.snapshotSha256 === "string" &&
      electron.snapshotSha256 === journey?.snapshot?.fixtureStateSha256,
    sameProvider:
      electron.provider?.instanceId === journey?.snapshot?.provider?.instanceId &&
      electron.provider?.model === journey?.snapshot?.provider?.model,
    exactlyOnce:
      electron.canonical?.createdThreadIds?.length === 1 &&
      electron.canonical.userMessages === 1 &&
      electron.canonical.turns === 1 &&
      journey?.retry?.createdThreadIds?.length === 1 &&
      journey.retry.counts.userMessages === 1 &&
      journey.retry.counts.turns === 1,
    sameAttachments:
      JSON.stringify(attachmentIdentity(electronMessage?.attachments)) ===
      JSON.stringify(attachmentIdentity(nativeMessage?.attachments)),
    promptOnBoth: electronPrompt.includes(expectedPrompt) && nativePrompt.includes(expectedPrompt),
    fileMentionOnBoth: electronPrompt.includes(FILE_MENTION) && nativePrompt.includes(FILE_MENTION),
  };
  return {
    status: Object.values(checks).every(Boolean) ? "pass" : "fail",
    checks,
    boundary: {
      nativeOnlyBlocks: ["<terminal_context>", "<element_context>"].filter((block) =>
        nativePrompt.includes(block),
      ),
      reason:
        "The Web authority run has no terminal drawer or browser picker input; both renderers serialize those blocks through the shared client-runtime helpers.",
      mentionPlacement: "Web inlines the mention at the caret; Lynx appends file-context chips.",
      attachmentBytes: {
        electron: electronMessage?.attachments?.map((attachment) => attachment.sizeBytes) ?? null,
        native: nativeMessage?.attachments?.map((attachment) => attachment.sizeBytes) ?? null,
        reason:
          "Lynxtron exposes clipboard images only as NativeImage; Native re-encodes PNG bytes.",
      },
    },
    electron: { attachments: electronMessage?.attachments ?? null, text: electronPrompt },
    native: { attachments: nativeMessage?.attachments ?? null, text: nativePrompt },
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const electronPath = argumentValue("--electron");
  const nativePath = argumentValue("--native");
  const outputPath = argumentValue("--output");
  if (!electronPath || !nativePath || !outputPath) {
    throw new Error("--electron, --native, and --output are required.");
  }
  const comparison = compareM1JourneyReports({
    electron: JSON.parse(readFileSync(path.resolve(electronPath), "utf8")),
    native: JSON.parse(readFileSync(path.resolve(nativePath), "utf8")),
  });
  writeFileSync(path.resolve(outputPath), `${JSON.stringify(comparison, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(comparison, null, 2)}\n`);
  if (comparison.status !== "pass") process.exitCode = 1;
}

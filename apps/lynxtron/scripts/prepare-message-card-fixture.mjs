#!/usr/bin/env node

// The message-card fixture: one thread whose user message carries a review
// comment, a preview annotation and an element context, which the transcript
// shows as cards. The message is sent by the product and answered by the
// scripted provider.

import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import { configureScriptedProvider, seedThroughApp } from "./product-seeding.mjs";

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

export const MESSAGE_CARD_PROMPT = [
  "Please apply these interface notes.",
  "",
  '<review_comment sectionId="turn:1" sectionTitle="Turn 1" filePath="src/card.tsx" startIndex="4" endIndex="6" rangeLabel="+5 to +7">',
  "Keep the shared card semantics aligned.",
  "```diff",
  "-const gap = 8",
  "+const gap = 12",
  "```",
  "</review_comment>",
  "",
  "<preview_annotation>",
  "Preview annotation:",
  "Id: card-spacing",
  "Page: Card preview",
  "Comment: Tighten the card hierarchy.",
  "Targets: 1 selected element.",
  "Requested visual changes:",
  "- Increase the content gap to 12px.",
  "</preview_annotation>",
  "",
  "<element_context>",
  "- <CardBody> (src/card.tsx:5):",
  "  selector: [data-card-body]",
  "</element_context>",
].join("\n");

export async function prepareMessageCardFixture(baseDirectory) {
  const baseDir = path.resolve(baseDirectory);
  const manifestPath = path.join(baseDir, "visual-state.json");
  const databasePath = path.join(baseDir, "userdata/statev2.sqlite");
  if (!existsSync(manifestPath) || !existsSync(databasePath)) {
    throw new Error("Message-card fixture requires a directory created by visual:prepare.");
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (manifest.threadCount !== 0 || manifest.route !== "new-thread") {
    throw new Error("Message-card fixture refuses a non-empty visual state.");
  }

  const title = "Message card semantics";
  configureScriptedProvider(baseDir, { chunkDelayMs: 0 });
  const { threadId, state } = await seedThroughApp(baseDir, async (app) => {
    const createdThreadId = await app.createThread(title);
    return {
      threadId: createdThreadId,
      state: await app.runTurn(createdThreadId, MESSAGE_CARD_PROMPT),
    };
  });
  const userMessage = state.messages.find((message) => message.role === "user");
  if (state.latestTurn.state !== "completed" || userMessage === undefined) {
    throw new Error(`The message-card turn did not complete: ${JSON.stringify(state)}`);
  }

  const messageCardFixture = {
    threadId,
    turnId: state.latestTurn.turnId,
    userMessageId: userMessage.id,
    title,
    review: { filePath: "src/card.tsx", rangeLabel: "+5 to +7" },
    preview: { id: "card-spacing", comment: "Tighten the card hierarchy." },
    element: { header: "<CardBody> (src/card.tsx:5)" },
  };
  const nextManifest = {
    ...manifest,
    snapshotId: sha256File(databasePath),
    route: "thread-transcript",
    threadCount: 1,
    sidebarFixture: { titles: [title] },
    messageCardFixture,
    preparation: { kind: "product-message-card-turn", provider: "scripted" },
  };
  writeFileSync(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`);
  return nextManifest;
}

const IS_MAIN_MODULE =
  typeof process.argv[1] === "string" &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (IS_MAIN_MODULE) {
  const baseDir = argumentValue("--base-dir");
  if (!baseDir) throw new Error("--base-dir is required.");
  process.stdout.write(`${JSON.stringify(await prepareMessageCardFixture(baseDir), null, 2)}\n`);
}

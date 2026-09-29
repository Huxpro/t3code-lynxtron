import "url-search-params-polyfill";

import { RegistryContext } from "@effect/atom-react";
import { root } from "@lynx-js/react";

import { BROWSER_PREVIEW_SCENARIOS } from "../../browser-preview/previewScenarios";
import { AppRoot } from "../AppRoot";
import "../generated/lynx.css";
import "../tailwind.css";
import "../overrides.css";
import { appAtomRegistry } from "../state/atomRegistry";
import { installT3ClientSnapshotForDevTool } from "../state/t3Client";

const source = BROWSER_PREVIEW_SCENARIOS["long-transcript"].snapshot;
const threadId = Object.keys(source.threads)[0]!;
const thread = source.threads[threadId]!;
installT3ClientSnapshotForDevTool({
  ...source,
  threads: { ...source.threads, [threadId]: { ...thread, messages: thread.messages.slice(-1) } },
});

root.render(
  <RegistryContext.Provider value={appAtomRegistry}>
    <AppRoot />
  </RegistryContext.Provider>,
);

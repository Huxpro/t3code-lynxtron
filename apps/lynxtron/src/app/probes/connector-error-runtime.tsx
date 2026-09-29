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

installT3ClientSnapshotForDevTool(BROWSER_PREVIEW_SCENARIOS["connection-error"].snapshot);

root.render(
  <RegistryContext.Provider value={appAtomRegistry}>
    <AppRoot />
  </RegistryContext.Provider>,
);

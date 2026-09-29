import "url-search-params-polyfill";

import { RegistryContext } from "@effect/atom-react";
import { root } from "@lynx-js/react";

import { AppRoot } from "./AppRoot";
import { appAtomRegistry } from "./state/atomRegistry";
import { registerCapabilityProbe } from "./state/capabilityProbe";
import { registerKeyboardCommands } from "./state/keyboardCommands";
import "./generated/lynx.css";
import "./tailwind.css";
import "./overrides.css";

registerCapabilityProbe();
registerKeyboardCommands();

root.render(
  <RegistryContext.Provider value={appAtomRegistry}>
    <AppRoot />
  </RegistryContext.Provider>,
);

import { AsyncResult, Atom } from "effect/unstable/reactivity";

import { t3ClientStateAtom } from "../../../lynxtron/src/app/state/t3Client";

export const primaryServerConfigAtom = Atom.make(
  (get) => get(t3ClientStateAtom).serverConfig ?? null,
).pipe(Atom.withLabel("lynx:primary-server-config"));

export const primaryServerProvidersAtom = Atom.make((get) => get(t3ClientStateAtom).providers).pipe(
  Atom.withLabel("lynx:primary-server-providers"),
);

export const primaryServerKeybindingsAtom = Atom.make(
  (get) => get(t3ClientStateAtom).serverConfig?.keybindings ?? [],
).pipe(Atom.withLabel("lynx:primary-server-keybindings"));

export const primaryServerSettingsAtom = Atom.make(
  (get) => get(t3ClientStateAtom).settings ?? get(t3ClientStateAtom).serverConfig?.settings ?? {},
).pipe(Atom.withLabel("lynx:primary-server-settings"));

const updateSettings = {
  label: "lynx:server-settings:update",
  run: async () => AsyncResult.success(undefined),
};

export const serverEnvironment = {
  settingsValueAtom: () => primaryServerSettingsAtom,
  updateSettings,
};

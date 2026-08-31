import { useEffect, useState } from "@lynx-js/react";

export interface LynxShortcutModifierState {
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

const EMPTY_STATE: LynxShortcutModifierState = {
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
};
let state = EMPTY_STATE;
const listeners = new Set<() => void>();

function same(left: LynxShortcutModifierState, right: LynxShortcutModifierState): boolean {
  return (
    left.metaKey === right.metaKey &&
    left.ctrlKey === right.ctrlKey &&
    left.shiftKey === right.shiftKey &&
    left.altKey === right.altKey
  );
}

export function updateLynxShortcutModifierState(next: LynxShortcutModifierState): void {
  if (same(state, next)) return;
  state = next;
  for (const listener of listeners) listener();
}

export function resetLynxShortcutModifierState(): void {
  updateLynxShortcutModifierState(EMPTY_STATE);
}

export function useLynxShortcutModifierState(): LynxShortcutModifierState {
  const [snapshot, setSnapshot] = useState(state);
  useEffect(() => {
    const listener = () => setSnapshot(state);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return snapshot;
}

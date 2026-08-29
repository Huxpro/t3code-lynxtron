export interface TerminalSessionSelection {
  readonly activeId: string;
  readonly ids: ReadonlyArray<string>;
  readonly nextOrdinal: number;
}

export const INITIAL_TERMINAL_SESSION_ID = "term-1";

export function initialTerminalSessionSelection(): TerminalSessionSelection {
  return {
    activeId: INITIAL_TERMINAL_SESSION_ID,
    ids: [INITIAL_TERMINAL_SESSION_ID],
    nextOrdinal: 2,
  };
}

export function addTerminalSession(selection: TerminalSessionSelection): TerminalSessionSelection {
  let ordinal = selection.nextOrdinal;
  let id = "term-" + ordinal;
  while (selection.ids.includes(id)) {
    ordinal += 1;
    id = "term-" + ordinal;
  }
  return { activeId: id, ids: [...selection.ids, id], nextOrdinal: ordinal + 1 };
}

export function activateTerminalSession(
  selection: TerminalSessionSelection,
  id: string,
): TerminalSessionSelection {
  return selection.ids.includes(id) ? { ...selection, activeId: id } : selection;
}

export function removeTerminalSession(
  selection: TerminalSessionSelection,
  id: string,
): TerminalSessionSelection {
  const index = selection.ids.indexOf(id);
  if (index < 0 || selection.ids.length === 1) return selection;
  const ids = selection.ids.filter((candidate) => candidate !== id);
  if (selection.activeId !== id) return { ...selection, ids };
  return {
    ...selection,
    activeId: ids[Math.min(index, ids.length - 1)] ?? ids[0] ?? INITIAL_TERMINAL_SESSION_ID,
    ids,
  };
}

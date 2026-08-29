export interface TerminalSessionSelection {
  readonly activeId: string;
  readonly ids: ReadonlyArray<string>;
  readonly nextOrdinal: number;
  readonly visibleIds: ReadonlyArray<string>;
}

export const INITIAL_TERMINAL_SESSION_ID = "term-1";

export function initialTerminalSessionSelection(): TerminalSessionSelection {
  return {
    activeId: INITIAL_TERMINAL_SESSION_ID,
    ids: [INITIAL_TERMINAL_SESSION_ID],
    nextOrdinal: 2,
    visibleIds: [INITIAL_TERMINAL_SESSION_ID],
  };
}

function allocateTerminalSession(selection: TerminalSessionSelection) {
  let ordinal = selection.nextOrdinal;
  let id = "term-" + ordinal;
  while (selection.ids.includes(id)) {
    ordinal += 1;
    id = "term-" + ordinal;
  }
  return { id, nextOrdinal: ordinal + 1 };
}

export function addTerminalSession(selection: TerminalSessionSelection): TerminalSessionSelection {
  const next = allocateTerminalSession(selection);
  return {
    activeId: next.id,
    ids: [...selection.ids, next.id],
    nextOrdinal: next.nextOrdinal,
    visibleIds: [next.id],
  };
}

export function splitTerminalSession(
  selection: TerminalSessionSelection,
): TerminalSessionSelection {
  if (selection.visibleIds.length >= 2) return selection;
  const next = allocateTerminalSession(selection);
  return {
    activeId: next.id,
    ids: [...selection.ids, next.id],
    nextOrdinal: next.nextOrdinal,
    visibleIds: [...selection.visibleIds, next.id],
  };
}

export function activateTerminalSession(
  selection: TerminalSessionSelection,
  id: string,
): TerminalSessionSelection {
  if (!selection.ids.includes(id)) return selection;
  return {
    ...selection,
    activeId: id,
    visibleIds: selection.visibleIds.includes(id) ? selection.visibleIds : [id],
  };
}

export function removeTerminalSession(
  selection: TerminalSessionSelection,
  id: string,
): TerminalSessionSelection {
  const index = selection.ids.indexOf(id);
  if (index < 0 || selection.ids.length === 1) return selection;
  const ids = selection.ids.filter((candidate) => candidate !== id);
  const visibleIds = selection.visibleIds.filter((candidate) => candidate !== id);
  if (selection.activeId !== id) {
    return {
      ...selection,
      ids,
      visibleIds: visibleIds.length > 0 ? visibleIds : [selection.activeId],
    };
  }
  const activeId = ids[Math.min(index, ids.length - 1)] ?? ids[0] ?? INITIAL_TERMINAL_SESSION_ID;
  return {
    ...selection,
    activeId,
    ids,
    visibleIds: visibleIds.length > 0 ? visibleIds : [activeId],
  };
}

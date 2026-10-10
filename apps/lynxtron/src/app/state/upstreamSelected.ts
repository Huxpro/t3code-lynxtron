// What upstream's atoms hold for what the Lynx client has selected: the thread
// it shows and that thread's terminals. The Lynx client shows one thread at a
// time, so one thread atom and that thread's terminal atoms are mounted, for
// as long as the thread is selected. Nothing is read until the first watcher.
import type { TerminalBufferState } from "@t3tools/client-runtime/state/terminal";
import {
  type EnvironmentThreadState,
  requestOlderThreadTurns,
} from "@t3tools/client-runtime/state/threads";
import { type EnvironmentId, type TerminalSummary, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";

import { appAtomRegistry } from "./atomRegistry.ts";
import type { T3ClientState } from "./t3Client.ts";
import {
  upstreamEnvironmentThreads,
  upstreamTerminalEnvironment,
} from "./upstreamConnectionRuntime.ts";
import {
  primaryEnvironmentId,
  type UpstreamPrimaryState,
  watchUpstreamPrimary,
} from "./upstreamPrimary.ts";

export interface UpstreamSelection {
  /** The selected thread, if the server has it. A local draft is not followed. */
  readonly threadId: string | null;
  /** The thread whose terminals are shown: the selected thread, draft or not. */
  readonly terminalThreadId: string | null;
}

export interface UpstreamTerminal {
  readonly summary: TerminalSummary;
  /** The attach stream's buffer, or null until its first snapshot arrives. */
  readonly buffer: TerminalBufferState | null;
}

export interface UpstreamSelectedState extends UpstreamSelection {
  readonly connection: UpstreamPrimaryState["connection"];
  readonly thread: EnvironmentThreadState | null;
  /** The terminals the server has for the thread, or null before it has said. */
  readonly terminals: ReadonlyArray<UpstreamTerminal> | null;
}

type SelectingClientState = Pick<T3ClientState, "activeThreadId" | "threads" | "archivedThreads">;

/** What the Lynx client's state asks upstream to follow. */
export function clientSelection(client: SelectingClientState): UpstreamSelection {
  const threadId = client.activeThreadId;
  const known =
    threadId !== undefined &&
    (client.threads.some((thread) => thread.id === threadId) ||
      client.archivedThreads.some((thread) => thread.id === threadId));
  return { threadId: known ? threadId : null, terminalThreadId: threadId ?? null };
}

/**
 * The cursor to ask the next older page with, or null when there is nothing
 * to ask for now. The Lynx client shows a thread whole, so a thread upstream
 * loaded as a window is paged until it has no older turns.
 */
export function olderTurnsCursor(thread: EnvironmentThreadState): string | null {
  if (thread.status !== "live") return null;
  const page = Option.getOrNull(thread.page);
  return page === null || !page.hasMore || page.loadingOlder ? null : page.beforeCursor;
}

type Watcher = (state: UpstreamSelectedState) => void;

const watchers = new Set<Watcher>();
let current: UpstreamSelectedState = {
  connection: null,
  threadId: null,
  terminalThreadId: null,
  thread: null,
  terminals: null,
};
let environmentId: EnvironmentId | null = null;
let selection: UpstreamSelection = { threadId: null, terminalThreadId: null };
let stopThread = () => {};
let stopTerminals = () => {};
let following = false;

function publish(patch: Partial<UpstreamSelectedState>): void {
  current = { ...current, ...patch };
  for (const watcher of watchers) watcher(current);
}

function followThread(): void {
  stopThread();
  stopThread = () => {};
  publish({ threadId: selection.threadId, thread: null });
  if (environmentId === null || selection.threadId === null) return;
  const environment = environmentId;
  const threadId = ThreadId.make(selection.threadId);
  // One request per cursor: a page that fails leaves the cursor where it was,
  // and asking again on every state change would not stop.
  let requested: string | null = null;
  stopThread = appAtomRegistry.subscribe(
    upstreamEnvironmentThreads.stateAtom(environment, threadId),
    (result) => {
      const thread = Option.getOrNull(AsyncResult.value(result));
      publish({ thread });
      const cursor = thread === null ? null : olderTurnsCursor(thread);
      if (cursor === null || cursor === requested) return;
      if (requestOlderThreadTurns(environment, threadId)) requested = cursor;
    },
    { immediate: true },
  );
}

/**
 * Follows the server's terminal list and attaches to the selected thread's
 * terminals. An attach names no working directory and no size, so it only
 * reads: opening, restarting and resizing stay with whoever shows the terminal.
 */
function followTerminals(): void {
  stopTerminals();
  stopTerminals = () => {};
  publish({ terminalThreadId: selection.terminalThreadId, terminals: null });
  const threadId = selection.terminalThreadId;
  if (environmentId === null || threadId === null) return;
  const environment = environmentId;
  const attached = new Map<string, { buffer: TerminalBufferState | null; stop: () => void }>();
  let summaries: ReadonlyArray<TerminalSummary> | null = null;
  const publishTerminals = () => {
    publish({
      terminals:
        summaries?.map((summary) => ({
          summary,
          buffer: attached.get(summary.terminalId)?.buffer ?? null,
        })) ?? null,
    });
  };
  const stopMetadata = appAtomRegistry.subscribe(
    upstreamTerminalEnvironment.metadata({ environmentId: environment, input: null }),
    (result) => {
      const all = Option.getOrNull(AsyncResult.value(result));
      summaries = all?.filter((summary) => summary.threadId === threadId) ?? null;
      const listed = new Set(summaries?.map((summary) => summary.terminalId));
      for (const [terminalId, entry] of attached) {
        if (listed.has(terminalId)) continue;
        entry.stop();
        attached.delete(terminalId);
      }
      for (const terminalId of listed) {
        if (attached.has(terminalId)) continue;
        const entry = { buffer: null as TerminalBufferState | null, stop: () => {} };
        attached.set(terminalId, entry);
        entry.stop = appAtomRegistry.subscribe(
          upstreamTerminalEnvironment.attach({
            environmentId: environment,
            input: { threadId, terminalId },
          }),
          (attach) => {
            entry.buffer = Option.getOrNull(AsyncResult.value(attach));
            if (attached.get(terminalId) === entry) publishTerminals();
          },
          { immediate: true },
        );
      }
      publishTerminals();
    },
    { immediate: true },
  );
  stopTerminals = () => {
    stopMetadata();
    for (const entry of attached.values()) entry.stop();
    attached.clear();
  };
}

function follow(): void {
  watchUpstreamPrimary((primary) => {
    const nextEnvironmentId = primaryEnvironmentId(primary.catalog);
    if (nextEnvironmentId !== environmentId) {
      environmentId = nextEnvironmentId;
      current = { ...current, connection: primary.connection };
      followThread();
      followTerminals();
      return;
    }
    if (primary.connection !== current.connection) publish({ connection: primary.connection });
  });
}

function select(next: UpstreamSelection): void {
  const previous = selection;
  selection = next;
  if (next.threadId !== previous.threadId) followThread();
  if (next.terminalThreadId !== previous.terminalThreadId) followTerminals();
}

/**
 * Calls `watcher` with upstream's state for the client's selection now and on
 * every change. The first call starts upstream's connection and starts
 * following `clientStateAtom`, the Lynx client's own state, for what is
 * selected.
 */
export function watchUpstreamSelected(
  clientStateAtom: Atom.Atom<T3ClientState>,
  watcher: Watcher,
): void {
  watchers.add(watcher);
  if (following) {
    watcher(current);
    return;
  }
  following = true;
  follow();

  // The selection is read after the client's own update has finished, so
  // nothing upstream supplies is applied in the middle of it.
  let client: SelectingClientState = appAtomRegistry.get(clientStateAtom);
  let scheduled = false;
  select(clientSelection(client));
  appAtomRegistry.subscribe(clientStateAtom, (next) => {
    const previous = client;
    client = next;
    if (
      scheduled ||
      (previous.activeThreadId === next.activeThreadId &&
        previous.threads === next.threads &&
        previous.archivedThreads === next.archivedThreads)
    ) {
      return;
    }
    scheduled = true;
    void Promise.resolve().then(() => {
      scheduled = false;
      select(clientSelection(client));
    });
  });
}

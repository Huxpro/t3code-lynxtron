// What upstream's atoms hold for what the Lynx client has selected: the thread
// it shows. The Lynx client shows one thread at a time, so one thread atom is
// mounted, for as long as that thread is selected. Nothing is read until the
// first watcher.
import {
  type EnvironmentThreadState,
  requestOlderThreadTurns,
} from "@t3tools/client-runtime/state/threads";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";

import { appAtomRegistry } from "./atomRegistry.ts";
import type { T3ClientState } from "./t3Client.ts";
import { upstreamEnvironmentThreads } from "./upstreamConnectionRuntime.ts";
import {
  primaryEnvironmentId,
  type UpstreamPrimaryState,
  watchUpstreamPrimary,
} from "./upstreamPrimary.ts";

export interface UpstreamSelection {
  /** The selected thread, if the server has it. A local draft is not followed. */
  readonly threadId: string | null;
}

export interface UpstreamSelectedState extends UpstreamSelection {
  readonly connection: UpstreamPrimaryState["connection"];
  readonly thread: EnvironmentThreadState | null;
}

type SelectingClientState = Pick<T3ClientState, "activeThreadId" | "threads" | "archivedThreads">;

/** What the Lynx client's state asks upstream to follow. */
export function clientSelection(client: SelectingClientState): UpstreamSelection {
  const threadId = client.activeThreadId;
  const known =
    threadId !== undefined &&
    (client.threads.some((thread) => thread.id === threadId) ||
      client.archivedThreads.some((thread) => thread.id === threadId));
  return { threadId: known ? threadId : null };
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
let current: UpstreamSelectedState = { connection: null, threadId: null, thread: null };
let environmentId: EnvironmentId | null = null;
let selection: UpstreamSelection = { threadId: null };
let stopThread = () => {};
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

function follow(): void {
  watchUpstreamPrimary((primary) => {
    const nextEnvironmentId = primaryEnvironmentId(primary.catalog);
    if (nextEnvironmentId !== environmentId) {
      environmentId = nextEnvironmentId;
      current = { ...current, connection: primary.connection };
      followThread();
      return;
    }
    if (primary.connection !== current.connection) publish({ connection: primary.connection });
  });
}

function select(next: UpstreamSelection): void {
  const previous = selection;
  selection = next;
  if (next.threadId !== previous.threadId) followThread();
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

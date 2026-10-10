// Feeds the Lynx client's connection status, auth access, server config,
// shell, selected thread, that thread's terminals and its VCS status from
// upstream's atoms instead of the main connector's events and replies. It runs unless the
// host launches with `T3_LYNXTRON_UPSTREAM_STATE=0`; with that every connector payload is
// applied as it arrives and nothing here subscribes to anything.
//
// Upstream owns a domain while its connection is up and it has the data the
// connector's payload carries. Connector payloads for an owned domain are held
// instead of applied, and the latest one is applied if upstream lets go, so a
// dropped upstream connection hands the domain back to the connector.
//
// The connection status is not a domain that changes hands: it is resolved
// from the connector's latest status and upstream's, in `resolveClientStatus`.
import { threadHasOlderTurns } from "@t3tools/client-runtime/state/threads";
import type { ModelSelection, ServerConfig, VcsStatusResult } from "@t3tools/contracts";
import { type AuthAccessPresentation, projectAuthAccess } from "@t3tools/lynx-logic/connections";
import * as Option from "effect/Option";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";

import { projectConnectorShell } from "../../shared/connectorShell.ts";
import { projectTerminalSession, terminalSessionKey } from "../../shared/connectorTerminal.ts";
import { projectConnectorThread } from "../../shared/connectorThread.ts";
import {
  createDisposableThreadCleanup,
  type DisposableThreadCleanup,
  disposableThreadIds,
  dropConfirmedModelSelections,
  type PendingModelSelections,
  withPendingModelSelection,
} from "../../shared/shellOverlays.ts";
import type {
  ConnectorShellPayload,
  ConnectorStatusPayload,
  ConnectorThreadPayload,
  TerminalSessionPresentation,
} from "../../shared/connectorProtocol.ts";
import { appAtomRegistry } from "./atomRegistry.ts";
import type { T3ClientState } from "./t3Client.ts";
import { primaryHttpBaseUrl, upstreamCommandsReady } from "./upstreamCommandPort.ts";
import {
  readUpstreamRuntimeFlags,
  type UpstreamPrimaryState,
  watchUpstreamPrimary,
} from "./upstreamPrimary.ts";
import {
  type UpstreamSelectedState,
  type UpstreamTerminal,
  watchUpstreamSelected,
} from "./upstreamSelected.ts";

/** Each terminal session is a domain of its own, named by its key. */
export type UpstreamStateDomain =
  | "access"
  | "config"
  | "shell"
  | "thread"
  | "vcs"
  | `terminal:${string}`;

export function terminalDomain(
  session: Pick<TerminalSessionPresentation, "threadId" | "terminalId">,
): UpstreamStateDomain {
  return `terminal:${terminalSessionKey(session.threadId, session.terminalId)}`;
}

export interface UpstreamStatePayloads {
  readonly config: ServerConfig | null;
  readonly shell: ConnectorShellPayload | null;
}

function isConnected(connection: UpstreamPrimaryState["connection"]): boolean {
  const state = connection === null ? null : Option.getOrNull(AsyncResult.value(connection));
  return state?.phase === "connected";
}

function liveShellSnapshot(state: Pick<UpstreamPrimaryState, "shell">) {
  return state.shell?.status === "live" ? Option.getOrNull(state.shell.snapshot) : null;
}

/** What the client's status needs to know of upstream's connection. */
export interface UpstreamStatusView {
  /** A command sent now goes through upstream and reaches the server. */
  readonly ready: boolean;
  /** Upstream tried the server at `httpBaseUrl` and is not connected to it. */
  readonly failed: boolean;
  /** The address upstream has the primary environment registered at. */
  readonly httpBaseUrl: string | null;
}

type StatusState = Pick<
  UpstreamPrimaryState,
  "catalog" | "connection" | "shell" | "config" | "archived"
>;

/**
 * Reads the status view from each state upstream publishes. When the
 * registered address changes, upstream's catalog says so before the new
 * connection has reported anything, so the connection state held at that
 * moment still describes the server at the old address and counts for nothing.
 */
export function createUpstreamStatusReader(): (state: StatusState) => UpstreamStatusView {
  let httpBaseUrl: string | null = null;
  let outdated: StatusState["connection"] = null;
  return (state) => {
    const registered = primaryHttpBaseUrl(state);
    if (registered !== httpBaseUrl) {
      httpBaseUrl = registered;
      outdated = state.connection;
    }
    const connection =
      state.connection === null || state.connection === outdated
        ? null
        : Option.getOrNull(AsyncResult.value(state.connection));
    return {
      ready: connection !== null && upstreamCommandsReady(state),
      failed:
        connection?.phase === "backoff" ||
        connection?.phase === "blocked" ||
        connection?.phase === "offline",
      httpBaseUrl,
    };
  };
}

/**
 * The status the client shows, given the main connector's latest status and
 * upstream's view, or null to keep showing what it shows. `upstream` is null
 * when the upstream state source is off.
 *
 * Ready means the path that takes the next command can deliver it. Upstream
 * takes the commands while it is ready, so the connector's ready is shown only
 * once upstream is ready for the same server, or has failed to reach it and
 * the connector takes the commands instead. While upstream is still on its
 * way the client keeps its status. A failure the main process reports is
 * shown at once: it is the first to know that the server it owns exited, and
 * upstream's session can read as connected for seconds after that.
 */
export function resolveClientStatus(
  connector: ConnectorStatusPayload,
  upstream: UpstreamStatusView | null,
): ConnectorStatusPayload | null {
  if (upstream === null) return connector;
  if (connector.status === "error" || connector.status === "reconnecting") return connector;
  if (connector.status !== "ready") return upstream.ready ? { status: "ready" } : connector;
  const sameServer =
    connector.httpBaseUrl === undefined || connector.httpBaseUrl === upstream.httpBaseUrl;
  return sameServer && (upstream.ready || upstream.failed) ? connector : null;
}

/**
 * The pairing links and client sessions as the Lynx settings show them, or
 * null while upstream is not connected or its access stream has not delivered.
 */
export function upstreamAccessPayload(
  state: Pick<UpstreamPrimaryState, "connection" | "access">,
): AuthAccessPresentation | null {
  if (!isConnected(state.connection) || state.access === null) return null;
  return projectAuthAccess(state.access);
}

/**
 * The threads of the shell upstream supplies, or null while it supplies none
 * and the connector's shell is the one shown.
 */
export function ownedShellThreads(
  state: Pick<UpstreamPrimaryState, "connection" | "shell" | "archived">,
) {
  if (!isConnected(state.connection) || state.archived === null) return null;
  return liveShellSnapshot(state)?.threads ?? null;
}

const NO_PENDING_MODEL_SELECTIONS: PendingModelSelections = new Map();

/**
 * The connector-shaped payload for each domain upstream can supply right now,
 * or null where it cannot. The shell needs the archived snapshot as well as
 * the live shell: a payload without it would empty the archive list.
 *
 * The shell is shown the way the connector shows its own: a thread keeps the
 * model selection in `pendingModelSelections` until the server reports it, and
 * a thread `isHidden` names, one the cleanup is deleting, is left out. Without
 * `isHidden` every empty disposable thread is left out, as if each were being
 * deleted.
 */
export function upstreamStatePayloads(
  state: Pick<UpstreamPrimaryState, "connection" | "shell" | "config" | "archived">,
  pendingModelSelections: PendingModelSelections = NO_PENDING_MODEL_SELECTIONS,
  isHidden?: (threadId: string) => boolean,
): UpstreamStatePayloads {
  if (!isConnected(state.connection)) return { config: null, shell: null };
  const snapshot = liveShellSnapshot(state);
  if (snapshot === null || state.archived === null) return { config: state.config, shell: null };
  const disposable = isHidden ? null : disposableThreadIds(snapshot.threads);
  const hidden = isHidden ?? ((threadId: string) => disposable?.has(threadId) === true);
  return {
    config: state.config,
    shell: projectConnectorShell({
      projects: snapshot.projects,
      threads: snapshot.threads,
      archivedThreads: state.archived.threads,
      isHidden: (thread) => hidden(thread.id),
      overlay: (thread) => withPendingModelSelection(thread, pendingModelSelections),
    }),
  };
}

/**
 * The connector-shaped payload for the selected thread, or null while
 * upstream cannot supply all of it: the connector's payload carries the whole
 * thread, so upstream's is held back until its stream is live and every older
 * page has been loaded.
 */
export function upstreamThreadPayload(
  state: Pick<UpstreamSelectedState, "connection" | "threadId" | "thread">,
): ConnectorThreadPayload | null {
  const thread = state.thread;
  if (!isConnected(state.connection) || thread === null) return null;
  if (thread.status !== "live" || threadHasOlderTurns(thread)) return null;
  const data = Option.getOrNull(thread.data);
  return data === null || data.id !== state.threadId ? null : projectConnectorThread(data);
}

/**
 * Whether the client emptied the thread upstream supplies, which it does when
 * the thread is selected again. The connector answers that with its payload,
 * which is held, so upstream's has to be applied again.
 */
export function threadWasReset(
  payload: ConnectorThreadPayload,
  client: Pick<T3ClientState, "activeThreadId" | "messages">,
): boolean {
  return (
    client.activeThreadId === payload.threadId &&
    client.messages.length === 0 &&
    payload.messages.length > 0
  );
}

/**
 * The connector-shaped session for one terminal, or null until its attach
 * stream has delivered the terminal's first snapshot.
 */
export function upstreamTerminalPayload(
  terminal: UpstreamTerminal,
): TerminalSessionPresentation | null {
  const { summary, buffer } = terminal;
  if (buffer === null || buffer.version === 0) return null;
  return projectTerminalSession({
    threadId: summary.threadId,
    terminalId: summary.terminalId,
    cwd: summary.cwd,
    buffer,
  });
}

/**
 * The sessions upstream can supply for the selected thread's terminals, or
 * null while it is not connected or the server has not listed its terminals.
 */
export function upstreamTerminalPayloads(
  state: Pick<UpstreamSelectedState, "connection" | "terminals">,
): ReadonlyArray<TerminalSessionPresentation> | null {
  if (!isConnected(state.connection) || state.terminals === null) return null;
  return state.terminals.flatMap((terminal) => upstreamTerminalPayload(terminal) ?? []);
}

/** A directory's VCS status, the same value from either source. */
export interface VcsStatusPayload {
  readonly cwd: string;
  readonly status: VcsStatusResult;
}

/**
 * The status of the directory the client shows, or null until upstream's
 * status stream has delivered for it.
 */
export function upstreamVcsPayload(
  state: Pick<UpstreamSelectedState, "connection" | "vcsCwd" | "vcs">,
): VcsStatusPayload | null {
  if (!isConnected(state.connection) || state.vcsCwd === null || state.vcs === null) return null;
  return { cwd: state.vcsCwd, status: state.vcs };
}

/**
 * Whether the client is waiting for, or shows something other than, the
 * status upstream supplies. The client marks the status pending when it asks
 * the connector to refresh it; the reply is held, so upstream's is applied
 * again.
 */
export function vcsStatusDiverged(
  payload: VcsStatusPayload,
  client: Pick<T3ClientState, "vcsStatus" | "vcsStatusCwd" | "vcsStatusPending">,
): boolean {
  return (
    client.vcsStatusCwd === payload.cwd &&
    (client.vcsStatusPending || client.vcsStatus !== payload.status)
  );
}

/**
 * Decides, per domain, whether a connector payload is applied or held.
 * `fromUpstream` with a payload takes the domain; with null it gives the
 * domain back and applies the connector payload that was held meanwhile.
 */
export function createUpstreamStateRouter() {
  const owned = new Set<UpstreamStateDomain>();
  const held = new Map<UpstreamStateDomain, () => void>();
  return {
    /** Returns whether the payload was applied; false means it is held. */
    fromConnector(domain: UpstreamStateDomain, apply: () => void): boolean {
      if (owned.has(domain)) {
        held.set(domain, apply);
        return false;
      }
      apply();
      return true;
    },
    fromUpstream<T>(domain: UpstreamStateDomain, payload: T | null, apply: (payload: T) => void) {
      if (payload !== null) {
        owned.add(domain);
        apply(payload);
        return;
      }
      if (!owned.delete(domain)) return;
      const replay = held.get(domain);
      held.delete(domain);
      replay?.();
    },
  };
}

const router = createUpstreamStateRouter();

/** Applies a connector payload for `domain` unless upstream currently owns it. */
export const applyFromConnector = router.fromConnector;

let connectorStatus: ConnectorStatusPayload | null = null;
// Null until the upstream source starts, which it only does when turned on.
let upstreamStatus: UpstreamStatusView | null = null;

/**
 * Takes the main connector's latest status and returns the status to show,
 * or null to keep the one shown.
 */
export function statusFromConnector(status: ConnectorStatusPayload): ConnectorStatusPayload | null {
  connectorStatus = status;
  return resolveClientStatus(status, upstreamStatus);
}

export interface UpstreamStateSink {
  readonly applyStatus: (status: ConnectorStatusPayload) => void;
  readonly applyAccess: (access: AuthAccessPresentation) => void;
  readonly applyConfig: (config: ServerConfig) => void;
  readonly applyShell: (shell: ConnectorShellPayload) => void;
  readonly applyThread: (thread: ConnectorThreadPayload) => void;
  readonly applyTerminal: (session: TerminalSessionPresentation) => void;
  readonly applyVcsStatus: (status: VcsStatusPayload) => void;
}

let started = false;

/**
 * Starts the upstream source once. Does nothing unless the host turned it on.
 * `clientStateAtom` is the Lynx client's own state, which says what is
 * selected. `pendingModelSelections` holds the selections the client's
 * commands are waiting on; one is removed here when the server reports it.
 * `deleteDisposableThread` deletes an empty disposable thread seen in the
 * shell upstream supplies; without it such threads are only left out.
 */
export function startUpstreamStateSource(
  clientStateAtom: Atom.Atom<T3ClientState>,
  sink: UpstreamStateSink,
  pendingModelSelections: Map<string, ModelSelection> = new Map(),
  deleteDisposableThread?: (threadId: string) => Promise<unknown>,
): void {
  if (started) return;
  if (readUpstreamRuntimeFlags().upstreamState !== true) return;
  started = true;

  // The watcher fires for every connection and catalog change; a domain is
  // projected and applied again only when what it is built from changed.
  let previous: Pick<
    UpstreamPrimaryState,
    "connection" | "shell" | "config" | "archived" | "access"
  > | null = null;
  const readStatus = createUpstreamStatusReader();
  const cleanup: DisposableThreadCleanup | null = deleteDisposableThread
    ? createDisposableThreadCleanup({
        deleteThread: deleteDisposableThread,
        onRevealed: () => {
          if (previous === null) return;
          const { shell } = upstreamStatePayloads(
            previous,
            pendingModelSelections,
            cleanup?.isHidden,
          );
          if (shell !== null) router.fromUpstream("shell", shell, sink.applyShell);
        },
      })
    : null;
  watchUpstreamPrimary((state) => {
    const connectionChanged = previous?.connection !== state.connection;
    const configChanged = connectionChanged || previous?.config !== state.config;
    const shellChanged =
      connectionChanged || previous?.shell !== state.shell || previous?.archived !== state.archived;
    const accessChanged = connectionChanged || previous?.access !== state.access;
    previous = state;
    const status = readStatus(state);
    if (
      status.ready !== upstreamStatus?.ready ||
      status.failed !== upstreamStatus.failed ||
      status.httpBaseUrl !== upstreamStatus.httpBaseUrl
    ) {
      upstreamStatus = status;
      const shown = connectorStatus === null ? null : resolveClientStatus(connectorStatus, status);
      if (shown !== null) sink.applyStatus(shown);
    }
    if (accessChanged) {
      router.fromUpstream("access", upstreamAccessPayload(state), sink.applyAccess);
    }
    if (!configChanged && !shellChanged) return;
    if (shellChanged) {
      dropConfirmedModelSelections(pendingModelSelections, liveShellSnapshot(state)?.threads ?? []);
      // The cleanup runs on the shell upstream supplies; while it supplies
      // none, the connector's own cleanup is the one that acts.
      const threads = ownedShellThreads(state);
      if (threads !== null) cleanup?.observe(threads);
    }
    const payloads = upstreamStatePayloads(state, pendingModelSelections, cleanup?.isHidden);
    if (configChanged) router.fromUpstream("config", payloads.config, sink.applyConfig);
    if (shellChanged) router.fromUpstream("shell", payloads.shell, sink.applyShell);
  });

  let selected: UpstreamSelectedState | null = null;
  let thread: ConnectorThreadPayload | null = null;
  let vcs: VcsStatusPayload | null = null;
  // The terminals upstream owns, by domain, each with the value it was last
  // projected from: output arrives in many small chunks, and only the
  // terminal that got one is projected again.
  const terminals = new Map<UpstreamStateDomain, UpstreamTerminal>();
  watchUpstreamSelected(clientStateAtom, (state) => {
    const connectionChanged = selected?.connection !== state.connection;
    const threadChanged =
      connectionChanged ||
      selected?.threadId !== state.threadId ||
      selected?.thread !== state.thread;
    const terminalsChanged = connectionChanged || selected?.terminals !== state.terminals;
    const vcsChanged =
      connectionChanged || selected?.vcsCwd !== state.vcsCwd || selected?.vcs !== state.vcs;
    selected = state;
    if (threadChanged) {
      thread = upstreamThreadPayload(state);
      router.fromUpstream("thread", thread, sink.applyThread);
    }
    if (vcsChanged) {
      vcs = upstreamVcsPayload(state);
      router.fromUpstream("vcs", vcs, sink.applyVcsStatus);
    }
    if (!terminalsChanged) return;
    const listed = new Map(
      (isConnected(state.connection) ? (state.terminals ?? []) : []).map((terminal) => [
        terminalDomain(terminal.summary),
        terminal,
      ]),
    );
    for (const domain of terminals.keys()) {
      if (listed.has(domain)) continue;
      terminals.delete(domain);
      router.fromUpstream(domain, null, sink.applyTerminal);
    }
    for (const [domain, terminal] of listed) {
      const previous = terminals.get(domain);
      if (previous?.buffer === terminal.buffer && previous.summary.cwd === terminal.summary.cwd) {
        continue;
      }
      const session = upstreamTerminalPayload(terminal);
      if (session === null) terminals.delete(domain);
      else terminals.set(domain, terminal);
      router.fromUpstream(domain, session, sink.applyTerminal);
    }
  });

  // The client state changes with every streamed token, so the checks read a
  // few fields, and a payload is applied after the client's own update.
  const threadReset = (client: T3ClientState) => thread !== null && threadWasReset(thread, client);
  const vcsDiverged = (client: T3ClientState) => vcs !== null && vcsStatusDiverged(vcs, client);
  let reapplying = false;
  appAtomRegistry.subscribe(clientStateAtom, (client) => {
    if (reapplying || !(threadReset(client) || vcsDiverged(client))) return;
    reapplying = true;
    void Promise.resolve().then(() => {
      reapplying = false;
      if (thread !== null && threadReset(appAtomRegistry.get(clientStateAtom))) {
        router.fromUpstream("thread", thread, sink.applyThread);
      }
      if (vcs !== null && vcsDiverged(appAtomRegistry.get(clientStateAtom))) {
        router.fromUpstream("vcs", vcs, sink.applyVcsStatus);
      }
    });
  });
}

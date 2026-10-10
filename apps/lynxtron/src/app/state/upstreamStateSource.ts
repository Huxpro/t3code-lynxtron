// Feeds the Lynx client's server config, shell, selected thread and that
// thread's terminals from upstream's atoms instead of the main connector's
// events. It runs only when the host launches
// with `T3_LYNXTRON_UPSTREAM_STATE=1`; without it every connector payload is
// applied as it arrives and nothing here subscribes to anything.
//
// Upstream owns a domain while its connection is up and it has the data the
// connector's payload carries. Connector payloads for an owned domain are held
// instead of applied, and the latest one is applied if upstream lets go, so a
// dropped upstream connection hands the domain back to the connector.
import { threadHasOlderTurns } from "@t3tools/client-runtime/state/threads";
import type { ServerConfig } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";

import { projectConnectorShell } from "../../shared/connectorShell.ts";
import { projectTerminalSession, terminalSessionKey } from "../../shared/connectorTerminal.ts";
import { projectConnectorThread } from "../../shared/connectorThread.ts";
import type {
  ConnectorShellPayload,
  ConnectorThreadPayload,
  TerminalSessionPresentation,
} from "../../shared/connectorProtocol.ts";
import { appAtomRegistry } from "./atomRegistry.ts";
import type { T3ClientState } from "./t3Client.ts";
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
export type UpstreamStateDomain = "config" | "shell" | "thread" | `terminal:${string}`;

export function terminalDomain(
  session: Pick<TerminalSessionPresentation, "threadId" | "terminalId">,
): UpstreamStateDomain {
  return `terminal:${terminalSessionKey(session.threadId, session.terminalId)}`;
}

export interface UpstreamStatePayloads {
  readonly config: ServerConfig | null;
  readonly shell: ConnectorShellPayload | null;
}

/**
 * The connector-shaped payload for each domain upstream can supply right now,
 * or null where it cannot. The shell needs the archived snapshot as well as
 * the live shell: a payload without it would empty the archive list.
 */
function isConnected(connection: UpstreamPrimaryState["connection"]): boolean {
  const state = connection === null ? null : Option.getOrNull(AsyncResult.value(connection));
  return state?.phase === "connected";
}

export function upstreamStatePayloads(
  state: Pick<UpstreamPrimaryState, "connection" | "shell" | "config" | "archived">,
): UpstreamStatePayloads {
  if (!isConnected(state.connection)) return { config: null, shell: null };
  const snapshot = state.shell?.status === "live" ? Option.getOrNull(state.shell.snapshot) : null;
  return {
    config: state.config,
    shell:
      snapshot === null || state.archived === null
        ? null
        : projectConnectorShell({
            projects: snapshot.projects,
            threads: snapshot.threads,
            archivedThreads: state.archived.threads,
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

/**
 * Decides, per domain, whether a connector payload is applied or held.
 * `fromUpstream` with a payload takes the domain; with null it gives the
 * domain back and applies the connector payload that was held meanwhile.
 */
export function createUpstreamStateRouter() {
  const owned = new Set<UpstreamStateDomain>();
  const held = new Map<UpstreamStateDomain, () => void>();
  return {
    fromConnector(domain: UpstreamStateDomain, apply: () => void): void {
      if (owned.has(domain)) held.set(domain, apply);
      else apply();
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

export interface UpstreamStateSink {
  readonly applyConfig: (config: ServerConfig) => void;
  readonly applyShell: (shell: ConnectorShellPayload) => void;
  readonly applyThread: (thread: ConnectorThreadPayload) => void;
  readonly applyTerminal: (session: TerminalSessionPresentation) => void;
}

let started = false;

/**
 * Starts the upstream source once. Does nothing unless the host turned it on.
 * `clientStateAtom` is the Lynx client's own state, which says what is
 * selected.
 */
export function startUpstreamStateSource(
  clientStateAtom: Atom.Atom<T3ClientState>,
  sink: UpstreamStateSink,
): void {
  if (started) return;
  if (readUpstreamRuntimeFlags().upstreamState !== true) return;
  started = true;

  // The watcher fires for every connection and catalog change; a domain is
  // projected and applied again only when what it is built from changed.
  let previous: Pick<UpstreamPrimaryState, "connection" | "shell" | "config" | "archived"> | null =
    null;
  watchUpstreamPrimary((state) => {
    const connectionChanged = previous?.connection !== state.connection;
    const configChanged = connectionChanged || previous?.config !== state.config;
    const shellChanged =
      connectionChanged || previous?.shell !== state.shell || previous?.archived !== state.archived;
    previous = state;
    if (!configChanged && !shellChanged) return;
    const payloads = upstreamStatePayloads(state);
    if (configChanged) router.fromUpstream("config", payloads.config, sink.applyConfig);
    if (shellChanged) router.fromUpstream("shell", payloads.shell, sink.applyShell);
  });

  let selected: UpstreamSelectedState | null = null;
  let thread: ConnectorThreadPayload | null = null;
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
    selected = state;
    if (threadChanged) {
      thread = upstreamThreadPayload(state);
      router.fromUpstream("thread", thread, sink.applyThread);
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

  // The client state changes with every streamed token, so the check is a
  // length read, and the payload is applied after the client's own update.
  let reapplying = false;
  appAtomRegistry.subscribe(clientStateAtom, (client) => {
    if (reapplying || thread === null || !threadWasReset(thread, client)) return;
    reapplying = true;
    void Promise.resolve().then(() => {
      reapplying = false;
      if (thread === null || !threadWasReset(thread, appAtomRegistry.get(clientStateAtom))) return;
      router.fromUpstream("thread", thread, sink.applyThread);
    });
  });
}

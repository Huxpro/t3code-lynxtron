// Compares what upstream's atoms hold with what the Lynx client's own state
// holds, one domain at a time, for the shadow to publish. A domain that reads
// equal here is one the Lynx client can take from upstream without the UI
// seeing a change.
import type { ServerConfig } from "@t3tools/contracts";

import type {
  ConnectorShellPayload,
  ConnectorThreadPayload,
} from "../../shared/connectorProtocol.ts";
import type { T3ClientState } from "./t3Client.ts";

export interface DomainComparison {
  /** Both sides have the domain's data. Nothing is compared until they do. */
  readonly ready: boolean;
  readonly equal: boolean;
  /** At most `MAX_DIFFERENCES` lines; the last one counts what was left out. */
  readonly differences: ReadonlyArray<string>;
}

export const MAX_DIFFERENCES = 20;

const NOT_READY: DomainComparison = { ready: false, equal: false, differences: [] };

function comparison(differences: ReadonlyArray<string>): DomainComparison {
  const left = differences.length - MAX_DIFFERENCES + 1;
  return {
    ready: true,
    equal: differences.length === 0,
    differences:
      differences.length <= MAX_DIFFERENCES
        ? differences
        : [...differences.slice(0, MAX_DIFFERENCES - 1), `and ${left} more`],
  };
}

function show(value: unknown): string {
  const text = value === undefined ? "absent" : JSON.stringify(value);
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One line per leaf that differs, named by its path. Arrays count as leaves. */
function diffValues(path: string, upstream: unknown, client: unknown, out: string[]): void {
  if (isRecord(upstream) && isRecord(client)) {
    for (const key of new Set([...Object.keys(upstream), ...Object.keys(client)])) {
      diffValues(`${path}.${key}`, upstream[key], client[key], out);
    }
    return;
  }
  if (JSON.stringify(upstream) !== JSON.stringify(client)) {
    out.push(`${path}: upstream ${show(upstream)}, client ${show(client)}`);
  }
}

/** Lines for ids only one side has, and the ids both have, in upstream's order. */
function diffIds(
  label: string,
  upstream: ReadonlyArray<string>,
  client: ReadonlyArray<string>,
  out: string[],
): ReadonlyArray<string> {
  const upstreamIds = new Set(upstream);
  const clientIds = new Set(client);
  for (const id of upstream) if (!clientIds.has(id)) out.push(`${label} ${id}: only upstream`);
  for (const id of client) if (!upstreamIds.has(id)) out.push(`${label} ${id}: only client`);
  return upstream.filter((id) => clientIds.has(id));
}

/** Length and a short hash: enough to tell two large texts apart without printing them. */
export function textDigest(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), 0x01000193);
  }
  return `${text.length} chars #${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

/** One line when two large values differ, giving each side's length and hash. */
function diffLarge(path: string, upstream: unknown, client: unknown, out: string[]): void {
  if (upstream === client) return;
  const left = typeof upstream === "string" ? upstream : (JSON.stringify(upstream) ?? "");
  const right = typeof client === "string" ? client : (JSON.stringify(client) ?? "");
  if (left !== right) {
    out.push(`${path}: upstream ${textDigest(left)}, client ${textDigest(right)}`);
  }
}

/**
 * Compares two lists of rows matched by key: rows only one side has, each
 * shared row through `diffRow`, then the order of the shared rows. A row both
 * sides hold as the same object is not looked into.
 */
function diffRows<T>(
  label: string,
  upstream: ReadonlyArray<T>,
  client: ReadonlyArray<T>,
  keyOf: (row: T) => string,
  diffRow: (path: string, upstream: T, client: T, out: string[]) => void,
  out: string[],
): void {
  const upstreamRows = new Map(upstream.map((row) => [keyOf(row), row]));
  const clientRows = new Map(client.map((row) => [keyOf(row), row]));
  const shared = diffIds(label, [...upstreamRows.keys()], [...clientRows.keys()], out);
  for (const key of shared) {
    const left = upstreamRows.get(key);
    const right = clientRows.get(key);
    if (left !== undefined && right !== undefined && left !== right) {
      diffRow(`${label} ${key}`, left, right, out);
    }
  }
  const clientOrder = [...clientRows.keys()].filter((key) => upstreamRows.has(key));
  const moved = shared.findIndex((key, index) => key !== clientOrder[index]);
  if (moved !== -1) {
    out.push(
      `${label} order: differs from position ${moved} (upstream ${shared[moved]}, client ${clientOrder[moved]})`,
    );
  }
}

function byId<T extends { readonly id: string }>(items: ReadonlyArray<T>): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

export function compareServerConfig(
  upstream: ServerConfig | null,
  client: Pick<T3ClientState, "serverConfig" | "providers" | "settings">,
): DomainComparison {
  if (upstream === null || client.serverConfig === undefined) return NOT_READY;
  const out: string[] = [];

  const upstreamProviders = new Map(upstream.providers.map((p) => [String(p.instanceId), p]));
  const clientProviders = new Map(client.providers.map((p) => [String(p.instanceId), p]));
  for (const id of diffIds(
    "provider",
    [...upstreamProviders.keys()],
    [...clientProviders.keys()],
    out,
  )) {
    const left = upstreamProviders.get(id);
    const right = clientProviders.get(id);
    diffValues(`provider ${id}.enabled`, left?.enabled, right?.enabled, out);
    diffValues(`provider ${id}.status`, left?.status, right?.status, out);
  }

  diffValues("settings", upstream.settings, client.settings, out);
  diffValues(
    "keybindings.count",
    upstream.keybindings.length,
    client.serverConfig.keybindings.length,
    out,
  );
  diffValues(
    "availableEditors",
    [...upstream.availableEditors].sort(),
    [...client.serverConfig.availableEditors].sort(),
    out,
  );
  return comparison(out);
}

export function compareShell(
  upstream: ConnectorShellPayload | null,
  client: Pick<T3ClientState, "status" | "projects" | "threads" | "archivedThreads">,
): DomainComparison {
  if (upstream === null || client.status !== "ready") return NOT_READY;
  const out: string[] = [];

  const upstreamProjects = byId(upstream.projects);
  const clientProjects = byId(client.projects);
  for (const id of diffIds(
    "project",
    [...upstreamProjects.keys()],
    [...clientProjects.keys()],
    out,
  )) {
    diffValues(
      `project ${id}.title`,
      upstreamProjects.get(id)?.title,
      clientProjects.get(id)?.title,
      out,
    );
  }

  // Threads are matched by id across the sidebar and archive lists together,
  // so a thread one side has archived shows as one difference, not two.
  const upstreamArchived = byId(upstream.archivedThreads ?? []);
  const clientArchived = byId(client.archivedThreads);
  const upstreamThreads = new Map([...byId(upstream.threads), ...upstreamArchived]);
  const clientThreads = new Map([...byId(client.threads), ...clientArchived]);
  for (const id of diffIds("thread", [...upstreamThreads.keys()], [...clientThreads.keys()], out)) {
    const left = upstreamThreads.get(id);
    const right = clientThreads.get(id);
    const path = `thread ${id}`;
    diffValues(`${path}.title`, left?.title, right?.title, out);
    diffValues(`${path}.archived`, upstreamArchived.has(id), clientArchived.has(id), out);
    diffValues(`${path}.settledOverride`, left?.settledOverride, right?.settledOverride, out);
    diffValues(`${path}.settledAt`, left?.settledAt, right?.settledAt, out);
    diffValues(`${path}.updatedAt`, left?.updatedAt, right?.updatedAt, out);
  }

  // Order is what the sidebar shows, judged over the threads both sides list.
  const clientListed = new Set(client.threads.map((thread) => thread.id));
  const upstreamListed = new Set(upstream.threads.map((thread) => thread.id));
  const upstreamOrder = upstream.threads.filter((thread) => clientListed.has(thread.id));
  const clientOrder = client.threads.filter((thread) => upstreamListed.has(thread.id));
  const moved = upstreamOrder.findIndex((thread, index) => thread.id !== clientOrder[index]?.id);
  if (moved !== -1) {
    out.push(
      `thread order: differs from position ${moved} (upstream ${upstreamOrder[moved]?.id}, client ${clientOrder[moved]?.id})`,
    );
  }
  return comparison(out);
}

type ComparedThreadState = Pick<
  T3ClientState,
  | "activeThreadId"
  | "messages"
  | "checkpoints"
  | "sessionStatus"
  | "sessionError"
  | "activities"
  | "activePlan"
  | "activeProposedPlan"
  | "latestTurn"
  | "proposedPlans"
  | "activeTurnId"
>;

/**
 * The selected thread, row by row. Message text, plan text and activity
 * payloads are reported by length and hash, not printed.
 */
export function compareThread(
  upstream: ConnectorThreadPayload | null,
  client: ComparedThreadState,
): DomainComparison {
  if (upstream === null || upstream.threadId !== client.activeThreadId) return NOT_READY;
  const out: string[] = [];

  diffValues("sessionStatus", upstream.sessionStatus, client.sessionStatus, out);
  diffValues("sessionError", upstream.sessionError ?? null, client.sessionError, out);
  diffValues("activeTurnId", upstream.activeTurnId ?? null, client.activeTurnId, out);
  diffValues("latestTurn", upstream.latestTurn ?? null, client.latestTurn, out);
  diffLarge("activePlan", upstream.activePlan ?? null, client.activePlan ?? null, out);
  diffLarge(
    "activeProposedPlan",
    upstream.activeProposedPlan ?? null,
    client.activeProposedPlan ?? null,
    out,
  );

  diffRows(
    "message",
    upstream.messages,
    client.messages,
    (message) => message.id,
    (path, left, right, lines) => {
      diffValues(`${path}.role`, left.role, right.role, lines);
      diffValues(`${path}.turnId`, left.turnId, right.turnId, lines);
      diffValues(`${path}.streaming`, left.streaming, right.streaming, lines);
      diffValues(
        `${path}.attachments`,
        left.attachments?.length ?? 0,
        right.attachments?.length ?? 0,
        lines,
      );
      diffLarge(`${path}.text`, left.text, right.text, lines);
    },
    out,
  );
  diffRows(
    "activity",
    upstream.activities ?? [],
    client.activities,
    (activity) => activity.id,
    (path, left, right, lines) => {
      diffValues(`${path}.kind`, left.kind, right.kind, lines);
      diffValues(`${path}.tone`, left.tone, right.tone, lines);
      diffValues(`${path}.turnId`, left.turnId, right.turnId, lines);
      diffLarge(`${path}.summary`, left.summary, right.summary, lines);
      diffLarge(`${path}.payload`, left.payload, right.payload, lines);
    },
    out,
  );
  diffRows(
    "checkpoint",
    upstream.checkpoints,
    client.checkpoints,
    (checkpoint) => checkpoint.turnId,
    (path, left, right, lines) => {
      diffValues(`${path}.status`, left.status, right.status, lines);
      diffValues(`${path}.turnCount`, left.checkpointTurnCount, right.checkpointTurnCount, lines);
      diffValues(`${path}.completedAt`, left.completedAt, right.completedAt, lines);
      diffLarge(`${path}.files`, left.files, right.files, lines);
    },
    out,
  );
  diffRows(
    "plan",
    upstream.proposedPlans ?? [],
    client.proposedPlans,
    (plan) => plan.id,
    (path, left, right, lines) => {
      diffValues(`${path}.turnId`, left.turnId, right.turnId, lines);
      diffValues(`${path}.implementedAt`, left.implementedAt, right.implementedAt, lines);
      diffLarge(`${path}.planMarkdown`, left.planMarkdown, right.planMarkdown, lines);
    },
    out,
  );
  return comparison(out);
}

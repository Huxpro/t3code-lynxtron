// Upstream's connection as the port the renderer's commands are sent through,
// and what those commands read from upstream's state. Nothing is read, and
// upstream's connection is not started, until `startUpstreamCommands` runs.
import type { EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import { request, runStream } from "@t3tools/client-runtime/rpc";
import {
  createAtomCommandScheduler,
  createEnvironmentCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { ORCHESTRATION_WS_METHODS, WS_METHODS } from "@t3tools/contracts";
import type * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { AsyncResult } from "effect/unstable/reactivity";

import { applyGitActionProgress, EMPTY_GIT_ACTION_OUTCOME } from "../../shared/gitActionOutcome.ts";
import { appAtomRegistry } from "./atomRegistry.ts";
import type { UpstreamCommandContext, UpstreamCommandPort } from "./upstreamCommands.ts";
import { upstreamConnectionRuntime } from "./upstreamConnectionRuntime.ts";
import {
  primaryEnvironmentId,
  type UpstreamPrimaryState,
  watchUpstreamPrimary,
} from "./upstreamPrimary.ts";

type CommandState = Pick<
  UpstreamPrimaryState,
  "catalog" | "connection" | "shell" | "config" | "archived"
>;

/**
 * Whether commands can be sent through upstream: it is connected and holds
 * the shell and the server config the commands read.
 */
export function upstreamCommandsReady(state: CommandState | null): boolean {
  if (state === null || state.connection === null) return false;
  const connection = Option.getOrNull(AsyncResult.value(state.connection));
  return (
    connection?.phase === "connected" &&
    primaryEnvironmentId(state.catalog) !== null &&
    state.shell?.status === "live" &&
    Option.isSome(state.shell.snapshot) &&
    state.config !== null
  );
}

/** The primary environment's HTTP address, once the host has registered it. */
export function primaryHttpBaseUrl(state: Pick<CommandState, "catalog"> | null): string | null {
  if (state === null) return null;
  const environmentId = primaryEnvironmentId(state.catalog);
  const catalog = Option.getOrNull(AsyncResult.value(state.catalog));
  const target = environmentId === null ? undefined : catalog?.entries.get(environmentId)?.target;
  return target?._tag === "PrimaryConnectionTarget" ? target.httpBaseUrl : null;
}

let primary: UpstreamPrimaryState | null = null;
let started = false;

/** Starts following upstream's primary environment for the commands. Idempotent. */
export function startUpstreamCommands(): void {
  if (started) return;
  started = true;
  watchUpstreamPrimary((state) => {
    primary = state;
  });
}

/** Whether a command sent now would go through upstream. */
export function upstreamCommandsAvailable(): boolean {
  return upstreamCommandsReady(primary);
}

export const upstreamCommandState: Pick<
  UpstreamCommandContext,
  "threads" | "config" | "httpBaseUrl"
> = {
  threads: () => [
    ...(Option.getOrNull(primary?.shell?.snapshot ?? Option.none())?.threads ?? []),
    ...(primary?.archived?.threads ?? []),
  ],
  config: () => primary?.config ?? null,
  httpBaseUrl: () => primaryHttpBaseUrl(primary),
};

// Upstream sends a thread's commands one at a time; so does the connector for
// the mode commands, whose order decides the mode the thread ends in.
const threadScheduler = createAtomCommandScheduler();

async function runInPrimary<A, E>(
  label: string,
  execute: () => Effect.Effect<A, E, EnvironmentSupervisor>,
  serialKey?: string,
): Promise<A> {
  const environmentId = primary === null ? null : primaryEnvironmentId(primary.catalog);
  if (environmentId === null) throw new Error("not connected");
  const command = createEnvironmentCommand(upstreamConnectionRuntime, {
    label,
    execute,
    ...(serialKey === undefined
      ? {}
      : {
          scheduler: threadScheduler,
          concurrency: { mode: "serial" as const, key: () => serialKey },
        }),
  });
  const result = await command.run(appAtomRegistry, { environmentId, input: undefined });
  if (result._tag === "Success") return result.value;
  const failure = squashAtomCommandFailure(result);
  throw failure instanceof Error ? failure : new Error(String(failure));
}

export const upstreamCommandPort: UpstreamCommandPort = {
  request: (tag, input) => runInPrimary(`lynx:command:${tag}`, () => request(tag, input)),
  dispatch: (command) =>
    runInPrimary(
      `lynx:command:${command.type}`,
      () => request(ORCHESTRATION_WS_METHODS.dispatchCommand, command),
      "threadId" in command ? command.threadId : undefined,
    ),
  gitAction: (input) =>
    runInPrimary("lynx:command:git-action", () =>
      runStream(WS_METHODS.gitRunStackedAction, input).pipe(
        Stream.runFold(() => EMPTY_GIT_ACTION_OUTCOME, applyGitActionProgress),
      ),
    ),
};

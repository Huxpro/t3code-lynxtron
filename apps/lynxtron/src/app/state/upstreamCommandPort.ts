// Upstream's connection as the port the renderer's commands are sent through,
// and what those commands read from upstream's state. Nothing is read, and
// upstream's connection is not started, until `startUpstreamCommands` runs.
import { EnvironmentSupervisor } from "@t3tools/client-runtime/connection";
import { environmentEndpointUrl } from "@t3tools/client-runtime/environment";
import { PrimaryEnvironmentAuth } from "@t3tools/client-runtime/platform";
import {
  executeEnvironmentHttpRequest,
  makeEnvironmentHttpApiGroupClient,
  request,
  runStream,
} from "@t3tools/client-runtime/rpc";
import {
  type AtomCommandResult,
  createAtomCommandScheduler,
  createEnvironmentCommand,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS } from "@t3tools/contracts";
import type * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import type { HttpClient } from "effect/unstable/http";
import { AsyncResult } from "effect/unstable/reactivity";

import { applyGitActionProgress, EMPTY_GIT_ACTION_OUTCOME } from "../../shared/gitActionOutcome.ts";
import { appAtomRegistry } from "./atomRegistry.ts";
import type { UpstreamCommandContext, UpstreamCommandPort } from "./upstreamCommands.ts";
import {
  upstreamConnectionRuntime,
  upstreamTerminalEnvironment,
} from "./upstreamConnectionRuntime.ts";
import { operationThreadId, upstreamOperation } from "./upstreamOperations.ts";
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
let available = false;
const availabilityListeners = new Set<(available: boolean) => void>();

/** Starts following upstream's primary environment for the commands. Idempotent. */
export function startUpstreamCommands(): void {
  if (started) return;
  started = true;
  watchUpstreamPrimary((state) => {
    primary = state;
    const next = upstreamCommandsReady(state);
    if (next === available) return;
    available = next;
    for (const listener of availabilityListeners) listener(next);
  });
}

/** Whether a command sent now would go through upstream. */
export function upstreamCommandsAvailable(): boolean {
  return upstreamCommandsReady(primary);
}

/** Calls `listener` each time upstream starts or stops taking the commands. */
export function onUpstreamCommandsAvailability(listener: (available: boolean) => void): void {
  availabilityListeners.add(listener);
}

export const upstreamCommandState: Pick<
  UpstreamCommandContext,
  "threads" | "projects" | "config" | "httpBaseUrl"
> = {
  threads: () => [
    ...(Option.getOrNull(primary?.shell?.snapshot ?? Option.none())?.threads ?? []),
    ...(primary?.archived?.threads ?? []),
  ],
  projects: () => Option.getOrNull(primary?.shell?.snapshot ?? Option.none())?.projects ?? [],
  config: () => primary?.config ?? null,
  httpBaseUrl: () => primaryHttpBaseUrl(primary),
};

// Upstream sends a thread's commands one at a time; so does the connector for
// the mode commands, whose order decides the mode the thread ends in.
const threadScheduler = createAtomCommandScheduler();

function requirePrimaryEnvironment() {
  const environmentId = primary === null ? null : primaryEnvironmentId(primary.catalog);
  if (environmentId === null) throw new Error("not connected");
  return environmentId;
}

/** A command's value, or its failure as the error the renderer's caller sees. */
async function settled<A, E>(running: Promise<AtomCommandResult<A, E>>): Promise<A> {
  const result = await running;
  if (result._tag === "Success") return result.value;
  const failure = squashAtomCommandFailure(result);
  throw failure instanceof Error ? failure : new Error(String(failure));
}

function runInPrimary<A, E>(
  label: string,
  execute: () => Effect.Effect<
    A,
    E,
    EnvironmentSupervisor | Crypto.Crypto | HttpClient.HttpClient | PrimaryEnvironmentAuth
  >,
  serialKey?: string,
): Promise<A> {
  const environmentId = requirePrimaryEnvironment();
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
  return settled(command.run(appAtomRegistry, { environmentId, input: undefined }));
}

const AUTH_REQUEST_TIMEOUT_MS = 10_000;

type AuthClient = Effect.Success<ReturnType<typeof makeEnvironmentHttpApiGroupClient<"auth">>>;

/**
 * One call to the primary environment's HTTP auth API, authorized the way
 * upstream authorizes the primary connection: with the bearer
 * `PrimaryEnvironmentAuth` reads from the host at the time of the call.
 */
function authRequest<A, E>(
  pathname: string,
  call: (client: AuthClient, headers: { readonly authorization?: string }) => Effect.Effect<A, E>,
): Promise<A> {
  return runInPrimary(`lynx:auth:${pathname}`, () =>
    Effect.gen(function* () {
      const supervisor = yield* EnvironmentSupervisor;
      const target = supervisor.target;
      if (target._tag !== "PrimaryConnectionTarget") {
        return yield* Effect.fail(new Error("not connected"));
      }
      const auth = yield* PrimaryEnvironmentAuth;
      const bearer = Option.getOrUndefined(yield* auth.bearerToken);
      const client = yield* makeEnvironmentHttpApiGroupClient(target.httpBaseUrl, "auth");
      return yield* executeEnvironmentHttpRequest(
        environmentEndpointUrl(target.httpBaseUrl, pathname),
        AUTH_REQUEST_TIMEOUT_MS,
        call(client, bearer === undefined ? {} : { authorization: `Bearer ${bearer}` }),
      );
    }),
  );
}

// A command that fails is not sent again. Upstream's session does not retry a
// request (`retryTransientErrors: false`), and neither Web nor mobile wraps
// these operations in a retry: a dropped transport fails the command, the
// supervisor reconnects, and the failure stays with whoever sent it. While
// upstream is not connected the renderer's commands go to the main connector.
export const upstreamCommandPort: UpstreamCommandPort = {
  request: (tag, input) => runInPrimary(`lynx:command:${tag}`, () => request(tag, input)),
  operation: (name, input) =>
    runInPrimary(
      `lynx:command:${name}`,
      () => upstreamOperation(name, input),
      operationThreadId(input),
    ),
  gitAction: (input) =>
    runInPrimary("lynx:command:git-action", () =>
      runStream(WS_METHODS.gitRunStackedAction, input).pipe(
        Stream.runFold(() => EMPTY_GIT_ACTION_OUTCOME, applyGitActionProgress),
      ),
    ),
  terminal: {
    open: (input) =>
      settled(
        upstreamTerminalEnvironment.open.run(appAtomRegistry, {
          environmentId: requirePrimaryEnvironment(),
          input,
        }),
      ),
    close: (input) =>
      settled(
        upstreamTerminalEnvironment.close.run(appAtomRegistry, {
          environmentId: requirePrimaryEnvironment(),
          input,
        }),
      ),
  },
  auth: {
    createPairingCredential: (payload) =>
      authRequest("/api/auth/pairing-token", (client, headers) =>
        client.pairingCredential({ headers, payload }),
      ),
    revokePairingLink: (payload) =>
      authRequest("/api/auth/pairing-links/revoke", (client, headers) =>
        client.revokePairingLink({ headers, payload }),
      ),
    revokeClient: (payload) =>
      authRequest("/api/auth/clients/revoke", (client, headers) =>
        client.revokeClient({ headers, payload }),
      ),
    revokeOtherClients: () =>
      authRequest("/api/auth/clients/revoke-others", (client, headers) =>
        client.revokeOtherClients({ headers }),
      ),
  },
};

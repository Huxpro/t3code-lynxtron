// What the test harness reads and calls in the renderer: whether the client is
// ready, how often the state the UI renders from has changed, and a way to send
// a command the way the UI sends it. None of it knows which path is behind the
// client state or the command bridge.
import type { ConnectionStatus } from "../bridge";
import type { UpstreamCommandPort } from "./upstreamCommands.ts";
import type { UpstreamOperationName } from "./upstreamOperations.ts";

export interface ClientReadiness {
  /** The UI shows ready and a command sent now has a path to the server. */
  readonly ready: boolean;
  readonly status: ConnectionStatus;
  /** Grows by one each time the client state the UI renders from changes. */
  readonly revision: number;
}

/**
 * Ready as the product means it: the status the UI shows is ready, so no
 * connecting, reconnecting or error banner is up, and the command bridge is
 * in place.
 */
export function resolveClientReadiness(input: {
  readonly status: ConnectionStatus;
  readonly commandsReady: boolean;
  readonly revision: number;
}): ClientReadiness {
  return {
    ready: input.status === "ready" && input.commandsReady,
    status: input.status,
    revision: input.revision,
  };
}

/** Whether applying `partial` to `previous` changes any field's value. */
export function changesState<State extends object>(
  previous: State,
  partial: Partial<State>,
): boolean {
  for (const key of Object.keys(partial) as Array<keyof State>) {
    if (!Object.is(previous[key], partial[key])) return true;
  }
  return false;
}

/**
 * Sends a named command through `bridge`, read at the moment of the call, so
 * it takes whichever path the UI's own call would take. Only names in
 * `commandNames` are commands; anything else the bridge carries is refused.
 */
export function createHarnessCommand(
  bridge: () => object | undefined,
  commandNames: ReadonlyArray<string>,
): (name: string, input?: unknown) => Promise<unknown> {
  return async (name, input) => {
    if (!commandNames.includes(name)) throw new Error(`${name} is not a command.`);
    const command = (bridge() as Record<string, unknown> | undefined)?.[name];
    if (typeof command !== "function") throw new Error(`Command ${name} is unavailable.`);
    return (command as (input?: unknown) => unknown)(input);
  };
}

/**
 * `port` with its first `operation` call rejected with `message`, so a gate
 * can see what the UI does when a command fails. Every later call goes through.
 */
export function failOperationOnce(
  port: UpstreamCommandPort,
  operation: UpstreamOperationName,
  message: string,
): UpstreamCommandPort {
  let pending = true;
  return {
    ...port,
    operation: (name, input) => {
      if (pending && name === operation) {
        pending = false;
        return Promise.reject(new Error(message));
      }
      return port.operation(name, input);
    },
  };
}

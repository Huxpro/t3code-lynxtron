// The project a server the app owns starts with. A brand-new server has no
// project, and a client with none cannot start a thread, so the main process
// names a directory with each server address it hands over (`primaryConnection`)
// and the renderer creates a project for it once upstream can take commands,
// with the command the "add project" flow sends. The client does not report
// ready until that has finished or failed.
import * as Option from "effect/Option";

import { primaryHttpBaseUrl, upstreamCommandsReady } from "./upstreamCommandPort.ts";
import type { UpstreamPrimaryState } from "./upstreamPrimary.ts";

type StartupProjectState = Pick<
  UpstreamPrimaryState,
  "catalog" | "connection" | "shell" | "config" | "archived"
>;

export type StartupProjectDecision =
  /** Upstream cannot say yet which projects the server has. */
  | "wait"
  /** Nothing to create: none was asked for, or the server has a project. */
  | "skip"
  /** The server has no project; create one for the directory. */
  | "create";

/**
 * What to do about the startup project, given what upstream holds for the
 * server and the directory the host asked for, or null when it asked for none
 * (a server the app is paired to and does not own). A server that has any
 * project is left alone, whatever directory it is for.
 */
export function decideStartupProject(
  state: StartupProjectState,
  requestedCwd: string | null,
): StartupProjectDecision {
  if (requestedCwd === null) return "skip";
  if (!upstreamCommandsReady(state)) return "wait";
  const snapshot = Option.getOrNull(state.shell?.snapshot ?? Option.none());
  return snapshot !== null && snapshot.projects.length > 0 ? "skip" : "create";
}

export interface StartupProjectStep {
  /**
   * Takes upstream's latest state and returns whether the step is over for
   * the server upstream is registered at, starting the creation when it is
   * due. False only while a requested project is still on its way.
   */
  readonly observe: (state: StartupProjectState) => boolean;
}

/**
 * The step, run at most once per server address for as long as the app runs:
 * a reconnect of upstream's session to the same server does not repeat it,
 * and the new server a restart brings has the first one's projects.
 *
 * `create` is the UI's own command; it looks the directory up among the
 * server's projects right before it creates one. After it succeeds the step
 * is over once a project shows in upstream's shell, so a client that is ready
 * has it. A failure ends the step, and `onSettled` is called since no state
 * change follows it.
 */
export function createStartupProjectStep(input: {
  /** The directory the host asked for with the server at this address. */
  readonly requestedCwd: (httpBaseUrl: string) => string | null;
  readonly create: (workspaceRoot: string) => Promise<unknown>;
  readonly onSettled: () => void;
  readonly log?: (line: string) => void;
}): StartupProjectStep {
  const settled = new Set<string>();
  const attempted = new Set<string>();
  return {
    observe(state) {
      const httpBaseUrl = primaryHttpBaseUrl(state);
      if (httpBaseUrl === null || settled.has(httpBaseUrl)) return true;
      const requestedCwd = input.requestedCwd(httpBaseUrl);
      const decision = decideStartupProject(state, requestedCwd);
      if (decision === "skip") {
        settled.add(httpBaseUrl);
        return true;
      }
      if (decision === "wait" || requestedCwd === null || attempted.has(httpBaseUrl)) return false;
      attempted.add(httpBaseUrl);
      // Sent after the state update this runs in: the command writes atoms.
      Promise.resolve()
        .then(() => input.create(requestedCwd))
        .then(
          () => input.log?.(`[startup-project] created for ${requestedCwd}`),
          (error: unknown) => {
            const reason = error instanceof Error ? error.message : String(error);
            input.log?.(`[startup-project] failed for ${requestedCwd}: ${reason}`);
            settled.add(httpBaseUrl);
            input.onSettled();
          },
        );
      return false;
    },
  };
}

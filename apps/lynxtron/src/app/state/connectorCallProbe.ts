// A count of the commands the renderer still sent to the main connector after
// upstream's connection became ready, for a run to read from DevTool as
// `globalThis.__T3_UPSTREAM_SHADOW__.connectorCalls` and assert on. It exists
// unless the host launches with `T3_LYNXTRON_UPSTREAM_STATE=0`. Commands
// sent before upstream was ready are the bootstrap and are not counted; a
// command sent while upstream is down again is, since that is a fallback
// worth seeing.
export interface ConnectorCallProbe {
  /** Starts counting. Called when upstream first becomes ready; idempotent. */
  readonly arm: () => void;
  /** Notes one command sent to the connector. */
  readonly record: (name: string) => void;
  /** The commands counted so far, by name. The same object throughout. */
  readonly calls: Readonly<Record<string, number>>;
}

export function createConnectorCallProbe(): ConnectorCallProbe {
  const calls: Record<string, number> = {};
  let armed = false;
  return {
    arm() {
      armed = true;
    },
    record(name) {
      if (armed) calls[name] = (calls[name] ?? 0) + 1;
    },
    calls,
  };
}

type Command = (input?: unknown) => Promise<unknown>;

/** `bridge` with each of its commands noted by `record` as it is called. */
export function recordConnectorCalls<Bridge extends object>(
  bridge: Bridge,
  record: (name: string) => void,
): Bridge {
  const recorded: Record<string, unknown> = {};
  for (const [name, command] of Object.entries(bridge)) {
    recorded[name] =
      typeof command === "function"
        ? (input?: unknown) => {
            record(name);
            return (command as Command)(input);
          }
        : command;
  }
  return recorded as Bridge;
}

/** Puts `calls` where DevTool reads the upstream shadow, keeping what is there. */
export function publishConnectorCalls(calls: Readonly<Record<string, number>>): void {
  const target = globalThis as {
    __T3_UPSTREAM_SHADOW__?: { connectorCalls?: Readonly<Record<string, number>> };
  };
  const shadow = (target.__T3_UPSTREAM_SHADOW__ ??= {});
  shadow.connectorCalls = calls;
}

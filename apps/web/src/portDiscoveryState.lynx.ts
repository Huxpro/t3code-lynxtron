import type { DiscoveredLocalServer, EnvironmentId, ThreadId } from "@t3tools/contracts";

const EMPTY_PORTS: ReadonlyArray<DiscoveredLocalServer> = Object.freeze([]);

/**
 * The Lynx connector does not expose Web preview port-discovery events yet.
 */
export function useDiscoveredPorts(
  _environmentId: EnvironmentId | null,
): ReadonlyArray<DiscoveredLocalServer> {
  return EMPTY_PORTS;
}

export function useThreadDiscoveredPorts(_input: {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
}): ReadonlyArray<DiscoveredLocalServer> {
  return EMPTY_PORTS;
}

export function useTerminalDiscoveredPorts(_input: {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
  readonly terminalId: string | null;
}): ReadonlyArray<DiscoveredLocalServer> {
  return EMPTY_PORTS;
}

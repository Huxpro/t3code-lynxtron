import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

export function parseListeningTcpPorts(output) {
  return new Set(
    output
      .split("\n")
      .filter((line) => line.startsWith("n"))
      .flatMap((line) => {
        const match = line.match(/:(\d+)(?:\s|$)/);
        return match ? [Number(match[1])] : [];
      }),
  );
}

export function readOwnedListeningTcpPorts(processId) {
  if (!Number.isInteger(processId) || processId <= 0) {
    throw new Error(`Invalid Lynxtron process id: ${String(processId)}`);
  }
  const result = spawnSync(
    "lsof",
    ["-Pan", "-a", "-p", String(processId), "-iTCP", "-sTCP:LISTEN", "-Fn"],
    { encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(result.stderr || `lsof exited with status ${result.status}`);
  }
  const ports = parseListeningTcpPorts(result.stdout);
  if (ports.size === 0) {
    throw new Error(`Lynxtron process ${processId} has no listening DevTool port.`);
  }
  return ports;
}

export function selectOwnedDevToolClient({ appName, clientId, clients, ownedPorts }) {
  const matches = clients.filter((client) => {
    if (client.info?.App !== appName) return false;
    if (clientId && client.id !== clientId) return false;
    const port = Number(client.port ?? client.id?.match(/:(\d+)$/)?.[1]);
    return ownedPorts === undefined || ownedPorts.has(port);
  });
  if (matches.length !== 1) {
    const qualifier = clientId
      ? ` id=${clientId}`
      : ownedPorts
        ? ` on owned ports ${[...ownedPorts].join(",")}`
        : "";
    throw new Error(
      `Expected one Lynx DevTool client for app=${appName}${qualifier}; found ${matches.length}.`,
    );
  }
  const selected = matches[0];
  return {
    ...selected,
    port: Number(selected.port ?? selected.id?.match(/:(\d+)$/)?.[1]),
  };
}

export function selectLatestDevToolSession(sessions) {
  const session = sessions.reduce(
    (latest, candidate) =>
      latest === null || Number(candidate.session_id) > Number(latest.session_id)
        ? candidate
        : latest,
    null,
  );
  if (!session) throw new Error("No Lynx DevTool session found for the owned client.");
  return session;
}

export async function openOwnedDevToolSession({ appName, clientId, devToolCli, ownedPorts }) {
  const connectorModuleUrl = pathToFileURL(join(dirname(devToolCli), "connector.mjs")).href;
  const transportModuleUrl = pathToFileURL(join(dirname(devToolCli), "182.mjs")).href;
  const [{ Connector }, { DesktopTransport }] = await Promise.all([
    import(connectorModuleUrl),
    import(transportModuleUrl),
  ]);
  const transport = new DesktopTransport();
  try {
    const connector = new Connector([transport]);
    const clients = await connector.listClients();
    const client = selectOwnedDevToolClient({ appName, clientId, clients, ownedPorts });
    const sessions = await connector.sendListSessionMessage(client.id);
    const session = selectLatestDevToolSession(sessions);
    return {
      close: () => transport.close(),
      runCdp: (method, params) =>
        connector.sendCDPMessage(client.id, Number(session.session_id), method, params),
      identity: {
        app: client.info?.App ?? null,
        clientId: client.id,
        port: Number(client.port),
        sessionId: Number(session.session_id),
        bundleUrl: session.url ?? null,
      },
    };
  } catch (error) {
    await transport.close();
    throw error;
  }
}

import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
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

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => {
        if (error) reject(error);
        else if (!Number.isInteger(port)) reject(new Error("Could not reserve a DevTool port."));
        else resolve(port);
      });
    });
  });
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    const onExit = () => {
      clearTimeout(timer);
      resolve(true);
    };
    const timer = setTimeout(() => {
      child.off("exit", onExit);
      resolve(false);
    }, timeoutMs);
    child.once("exit", onExit);
  });
}

async function waitForDaemon(port, child, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`Owned DevTool daemon exited early (${child.exitCode ?? child.signalCode}).`);
    }
    try {
      const response = await fetch(`http://127.0.0.1:${port}/devtool/connector/version`);
      if (response.ok) return;
    } catch {
      // The owned daemon is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Owned DevTool daemon did not listen on port ${port}.`);
}

async function stopOwnedDaemon(child, port) {
  const processId = child.pid;
  await fetch(`http://127.0.0.1:${port}/devtool/connector/shutdown`, {
    method: "POST",
  }).catch(() => undefined);
  await waitForChildExit(child, 1_000);
  if (!Number.isInteger(processId) || processId <= 0) return;
  const isAlive = () => {
    try {
      process.kill(processId, 0);
      return true;
    } catch {
      return false;
    }
  };
  if (!isAlive()) return;
  process.kill(processId, "SIGTERM");
  await waitForChildExit(child, 2_000);
  if (!isAlive()) return;
  process.kill(processId, "SIGKILL");
  await waitForChildExit(child, 2_000);
  if (isAlive()) throw new Error(`Owned DevTool daemon PID ${processId} did not exit.`);
}

export async function openOwnedDevToolSession({ appName, clientId, devToolCli, ownedPorts }) {
  const connectorModuleUrl = pathToFileURL(join(dirname(devToolCli), "connector.mjs")).href;
  const daemonPort = await reserveLoopbackPort();
  const daemon = spawn(
    process.execPath,
    [join(dirname(devToolCli), "daemon-entry.mjs"), "--port", String(daemonPort)],
    { stdio: "ignore" },
  );
  let transport;
  try {
    await waitForDaemon(daemonPort, daemon);
    const { Connector, DaemonTransport } = await import(connectorModuleUrl);
    transport = new DaemonTransport(daemonPort);
    const connector = new Connector([transport]);
    const clients = await connector.listClients();
    const client = selectOwnedDevToolClient({ appName, clientId, clients, ownedPorts });
    const sessions = await connector.sendListSessionMessage(client.id);
    const session = selectLatestDevToolSession(sessions);
    return {
      close: async () => {
        await transport.close();
        await stopOwnedDaemon(daemon, daemonPort);
      },
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
    await transport?.close();
    await stopOwnedDaemon(daemon, daemonPort);
    throw error;
  }
}

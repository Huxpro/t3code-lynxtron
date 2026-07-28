// Dump the raw shell snapshot to see archivedAt field naming.
import { T3Connector } from "../src/main/desktop/connector";

const events = {
  onStatus: () => {},
  onShell: (p: any) => console.log("SHELL:", JSON.stringify(p).slice(0, 800)),
  onThread: () => {},
  onLog: () => {},
};

(async () => {
  const c = new T3Connector(events);
  try {
    await c.connect();
    await new Promise((r) => setTimeout(r, 3000));
    console.log("SMOKE3 DONE");
  } finally {
    c.dispose();
    setTimeout(() => process.exit(0), 500);
  }
})();

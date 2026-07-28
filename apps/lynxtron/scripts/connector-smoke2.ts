// Subscribe to an EXISTING thread (with historical messages) and print what
// the stream delivers — verifies snapshot replay for threads created in
// earlier server sessions.
import { T3Connector } from "../src/main/desktop/connector";

const THREAD_ID = process.argv[2] ?? "6fdec7ed-bbf4-4922-967d-36ee28444b70";

const events = {
  onStatus: (s: string, d?: string) => console.log("STATUS:", s, d ?? ""),
  onShell: () => {},
  onThread: (id: string, p: any) =>
    console.log(
      "THREAD:",
      id.slice(0, 8),
      "session=" + p.sessionStatus,
      "msgs=" + p.messages.length,
      JSON.stringify(p.messages.map((m: any) => ({ role: m.role, len: (m.text || "").length }))),
    ),
  onLog: (l: string) => {
    if (l.includes("thread-item") || l.includes("error")) console.log("LOG:", l.slice(0, 300));
  },
};

(async () => {
  const c = new T3Connector(events);
  try {
    await c.connect();
    console.log(">>> subscribing to existing thread", THREAD_ID);
    c.selectThread(THREAD_ID);
    await new Promise((r) => setTimeout(r, 6000));
    console.log("SMOKE2 DONE");
  } catch (e: any) {
    console.error("SMOKE2 ERROR:", e?.message);
  } finally {
    c.dispose();
    setTimeout(() => process.exit(0), 500);
  }
})();

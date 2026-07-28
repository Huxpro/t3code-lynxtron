// Standalone connector smoke test. Bundled against t3code's node_modules and
// run under Node 22. Verifies: spawn server -> auth -> WS RPC connect ->
// getConfig -> subscribeShell -> (optionally) create thread + send prompt.
import { T3Connector } from "../src/main/desktop/connector";

const events = {
  onStatus: (s: string, d?: string) => console.log("STATUS:", s, d ?? ""),
  onShell: (p: any) =>
    console.log(
      "SHELL:",
      "projects=" + p.projects.length,
      "threads=" + p.threads.length,
      JSON.stringify(p.projects.slice(0, 2)),
    ),
  onThread: (id: string, p: any) =>
    console.log(
      "THREAD:",
      id,
      "session=" + p.sessionStatus,
      "msgs=" + p.messages.length,
      JSON.stringify(
        p.messages.map((m: any) => ({
          role: m.role,
          len: (m.text || "").length,
          streaming: m.streaming,
        })),
      ),
    ),
  onLog: (l: string) => {
    if (
      l.includes("connector") ||
      l.includes("exited") ||
      l.includes("error") ||
      l.includes("srv-err") ||
      l.includes("spawn") ||
      l.includes("thread-item")
    )
      console.log("LOG:", l.slice(0, 400));
  },
};

(async () => {
  const c = new T3Connector(events);
  try {
    const res = await c.connect();
    console.log(
      "CONNECT RESULT:",
      JSON.stringify({ status: res.status, models: res.models.slice(0, 3), cwd: res.cwd }),
    );
    // Give shell subscription a moment.
    await new Promise((r) => setTimeout(r, 2500));

    const doPrompt = process.env.SMOKE_PROMPT === "1";
    if (doPrompt) {
      console.log(">>> creating thread…");
      const { threadId } = await c.createThread({});
      console.log(">>> thread created:", threadId);
      await new Promise((r) => setTimeout(r, 1500));
      console.log(">>> sending prompt…");
      await c.sendPrompt({ threadId, text: "Say hello in exactly 3 words." });
      // Observe streaming for a while.
      await new Promise((r) => setTimeout(r, 20000));
    }
    console.log("SMOKE DONE");
  } catch (e: any) {
    console.error("SMOKE ERROR:", e?.message, e?.stack?.slice(0, 400));
  } finally {
    c.dispose();
    setTimeout(() => process.exit(0), 500);
  }
})();

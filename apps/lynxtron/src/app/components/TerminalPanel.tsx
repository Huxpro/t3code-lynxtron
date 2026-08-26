import { useEffect, useMemo, useState } from "@lynx-js/react";

import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import { presentTerminalText } from "./terminalText";

const TERMINAL_ID = "term-1";

function inputValue(event: unknown): string {
  const input = event as {
    readonly detail?: { readonly value?: unknown };
    readonly target?: { readonly value?: unknown };
    readonly currentTarget?: { readonly value?: unknown };
  };
  const value = input.detail?.value ?? input.target?.value ?? input.currentTarget?.value;
  return typeof value === "string" ? value : "";
}

export function TerminalPanel() {
  const { activeThreadId, draftThread, projects, status, terminalSessions, threads } =
    useT3ClientState();
  const [command, setCommand] = useState("");
  const [openError, setOpenError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ??
    (draftThread?.id === activeThreadId ? draftThread : undefined);
  const project =
    projects.find((candidate) => candidate.id === activeThread?.projectId) ?? projects[0] ?? null;
  const cwd = activeThread?.worktreePath ?? project?.workspaceRoot ?? null;
  const terminalKey = activeThreadId ? `${activeThreadId}\u0000${TERMINAL_ID}` : null;
  const session = terminalKey ? terminalSessions[terminalKey] : undefined;
  const output = useMemo(() => presentTerminalText(session?.history ?? ""), [session?.history]);

  useEffect(() => {
    if (!activeThreadId || !cwd || status !== "ready") return;
    let cancelled = false;
    setOpenError(null);
    void t3ClientActions
      .openTerminal({
        threadId: activeThreadId,
        terminalId: TERMINAL_ID,
        cwd,
        worktreePath: activeThread?.worktreePath ?? null,
        cols: 100,
        rows: 30,
      })
      .catch((cause: unknown) => {
        if (!cancelled) setOpenError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [activeThread?.worktreePath, activeThreadId, cwd, status]);

  const runCommand = () => {
    const value = command.trim();
    if (!activeThreadId || !value || sending) return;
    setSending(true);
    void t3ClientActions
      .writeTerminal({ threadId: activeThreadId, terminalId: TERMINAL_ID, data: `${value}\n` })
      .then(() => setCommand(""))
      .catch((cause: unknown) =>
        setOpenError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setSending(false));
  };

  if (!activeThreadId || !cwd) {
    return (
      <view className="terminal-panel__empty">
        <text>Open a project thread to start a terminal.</text>
      </view>
    );
  }

  return (
    <view
      className="terminal-panel flex flex-col"
      data-terminal-session-status={session?.status ?? "starting"}
    >
      <view className="terminal-panel__meta">
        <text className="terminal-panel__cwd">{cwd}</text>
        <text className="terminal-panel__status">{session?.status ?? "starting"}</text>
      </view>
      <scroll-view className="terminal-panel__viewport" scroll-orientation="vertical">
        <text className="terminal-panel__output whitespace-pre">{output || "Starting shell…"}</text>
      </scroll-view>
      {openError || session?.error ? (
        <text className="terminal-panel__error">{openError ?? session?.error}</text>
      ) : null}
      <view className="terminal-panel__command-row">
        <text className="terminal-panel__prompt">$</text>
        <input
          className="terminal-panel__input"
          {...({ value: command } as object)}
          placeholder="Run a command"
          aria-label="Terminal command"
          bindinput={(event) => setCommand(inputValue(event))}
          confirm-type="send"
          bindconfirm={runCommand}
        />
        <view
          className={`terminal-panel__run${!command.trim() || sending ? " terminal-panel__run--disabled" : ""}`}
          aria-label="Run terminal command"
          aria-disabled={!command.trim() || sending ? "true" : "false"}
          bindtap={runCommand}
        >
          <text>{sending ? "Running…" : "Run"}</text>
        </view>
      </view>
    </view>
  );
}

export function closeTerminalSession(threadId: string | undefined): void {
  if (!threadId) return;
  void t3ClientActions
    .closeTerminal({ threadId, terminalId: TERMINAL_ID, deleteHistory: true })
    .catch(() => undefined);
}

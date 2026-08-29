import { useEffect, useMemo, useRef, useState } from "@lynx-js/react";
import type { NodesRef } from "@lynx-js/types";

import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import { presentTerminalText } from "./terminalText";
import { terminalGridSize } from "./terminalGrid.logic";
import { terminalReturnController } from "../state/terminalKeyboard";
import {
  activateTerminalSession,
  addTerminalSession,
  initialTerminalSessionSelection,
  removeTerminalSession,
  splitTerminalSession,
} from "./terminalSessions.logic";
import { Icon } from "./Icon";

function inputValue(event: unknown): string {
  const input = event as {
    readonly detail?: { readonly value?: unknown };
    readonly target?: { readonly value?: unknown };
    readonly currentTarget?: { readonly value?: unknown };
  };
  const value = input.detail?.value ?? input.target?.value ?? input.currentTarget?.value;
  return typeof value === "string" ? value : "";
}

export function TerminalPanel({
  width,
  height,
}: {
  readonly width: number;
  readonly height: number;
}) {
  const { activeThreadId, draftThread, projects, status, terminalSessions, threads } =
    useT3ClientState();
  const [command, setCommand] = useState("");
  const [openError, setOpenError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [selection, setSelection] = useState(initialTerminalSessionSelection);
  const sendingRef = useRef(false);
  const commandInputRef = useRef<NodesRef>(null);
  const activeThread =
    threads.find((thread) => thread.id === activeThreadId) ??
    (draftThread?.id === activeThreadId ? draftThread : undefined);
  const project =
    projects.find((candidate) => candidate.id === activeThread?.projectId) ?? projects[0] ?? null;
  const cwd = activeThread?.worktreePath ?? project?.workspaceRoot ?? null;
  const terminalKey = activeThreadId
    ? activeThreadId + String.fromCharCode(0) + selection.activeId
    : null;
  const session = terminalKey ? terminalSessions[terminalKey] : undefined;
  const grid = useMemo(
    () => terminalGridSize(width / selection.visibleIds.length, height),
    [height, selection.visibleIds.length, width],
  );
  const resizedGridRef = useRef<string | null>(null);

  useEffect(() => {
    setCommand("");
    commandInputRef.current
      ?.invoke({
        method: "focus",
        success: () => {
          terminalReturnController.setFocused(true);
        },
        fail: (result) => {
          console.error("[lynx-terminal] input focus failed", result);
        },
      })
      .exec();
  }, [selection.activeId]);

  useEffect(() => {
    if (!activeThreadId || !cwd || status !== "ready") return;
    let cancelled = false;
    setOpenError(null);
    void t3ClientActions
      .openTerminal({
        threadId: activeThreadId,
        terminalId: selection.activeId,
        cwd,
        worktreePath: activeThread?.worktreePath ?? null,
        cols: grid.cols,
        rows: grid.rows,
      })
      .catch((cause: unknown) => {
        if (!cancelled) setOpenError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      cancelled = true;
    };
  }, [activeThread?.worktreePath, activeThreadId, cwd, selection.activeId, status]);

  useEffect(() => {
    if (!activeThreadId) return;
    const runningIds = selection.visibleIds.filter((terminalId) => {
      const key = activeThreadId + String.fromCharCode(0) + terminalId;
      return terminalSessions[key]?.status === "running";
    });
    if (runningIds.length === 0) return;
    const key = `${activeThreadId}:${runningIds.join(",")}:${grid.cols}x${grid.rows}`;
    if (resizedGridRef.current === key) return;
    resizedGridRef.current = key;
    void Promise.all(
      runningIds.map((terminalId) =>
        t3ClientActions.resizeTerminal({
          threadId: activeThreadId,
          terminalId,
          cols: grid.cols,
          rows: grid.rows,
        }),
      ),
    ).catch((cause: unknown) => {
      resizedGridRef.current = null;
      setOpenError(cause instanceof Error ? cause.message : String(cause));
    });
  }, [activeThreadId, grid.cols, grid.rows, selection.visibleIds, terminalSessions]);

  const runCommand = () => {
    const value = command.trim();
    if (!activeThreadId || !value || sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    void t3ClientActions
      .writeTerminal({
        threadId: activeThreadId,
        terminalId: selection.activeId,
        data: `${value}\n`,
      })
      .then(() => setCommand(""))
      .catch((cause: unknown) =>
        setOpenError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => {
        sendingRef.current = false;
        setSending(false);
      });
    return true;
  };

  terminalReturnController.setSubmitHandler(runCommand);

  const closeSession = (terminalId: string) => {
    if (!activeThreadId || selection.ids.length === 1) return;
    void t3ClientActions
      .closeTerminal({ threadId: activeThreadId, terminalId, deleteHistory: true })
      .then(() => setSelection((current) => removeTerminalSession(current, terminalId)))
      .catch((cause: unknown) =>
        setOpenError(cause instanceof Error ? cause.message : String(cause)),
      );
  };

  useEffect(
    () => () => {
      terminalReturnController.dispose();
    },
    [],
  );

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
      data-terminal-session-id={selection.activeId}
      data-terminal-session-count={String(selection.ids.length)}
      data-terminal-split={selection.visibleIds.length > 1 ? "horizontal" : "none"}
    >
      <view className="terminal-panel__meta">
        <text className="terminal-panel__cwd">{cwd}</text>
        <text className="terminal-panel__status">{session?.status ?? "starting"}</text>
      </view>
      <view className="terminal-panel__sessions">
        <scroll-view className="terminal-panel__session-scroll" scroll-orientation="horizontal">
          <view className="terminal-panel__session-list">
            {selection.ids.map((terminalId, index) => (
              <view
                key={terminalId}
                className={
                  "terminal-panel__session" +
                  (terminalId === selection.activeId ? " terminal-panel__session--active" : "")
                }
                data-terminal-session-tab={terminalId}
                aria-label={"Activate Terminal " + (index + 1)}
                aria-pressed={terminalId === selection.activeId ? "true" : "false"}
                bindtap={() =>
                  setSelection((current) => activateTerminalSession(current, terminalId))
                }
              >
                <Icon name="terminal-square" size={12} color="#818181" />
                <text className="terminal-panel__session-label">Terminal {index + 1}</text>
                {selection.ids.length > 1 ? (
                  <view
                    className="terminal-panel__session-close"
                    aria-label={"Close Terminal " + (index + 1)}
                    catchtap={() => closeSession(terminalId)}
                  >
                    <Icon name="x" size={11} color="#818181" />
                  </view>
                ) : null}
              </view>
            ))}
          </view>
        </scroll-view>
        <view
          className={
            "terminal-panel__session-split" +
            (selection.visibleIds.length > 1 ? " terminal-panel__session-split--disabled" : "")
          }
          aria-label="Split terminal horizontally"
          aria-disabled={selection.visibleIds.length > 1 ? "true" : "false"}
          bindtap={() => setSelection(splitTerminalSession)}
        >
          <Icon name="columns-2" size={13} color="#818181" />
        </view>
        <view
          className="terminal-panel__session-new"
          aria-label="New terminal"
          bindtap={() => setSelection(addTerminalSession)}
        >
          <Icon name="plus" size={13} color="#818181" />
        </view>
      </view>
      <view className="terminal-panel__viewports">
        {selection.visibleIds.map((terminalId, index) => {
          const key = activeThreadId + String.fromCharCode(0) + terminalId;
          const visibleSession = terminalSessions[key];
          const output = presentTerminalText(visibleSession?.history ?? "");
          return (
            <scroll-view
              key={terminalId}
              className={
                "terminal-panel__viewport" +
                (index > 0 ? " terminal-panel__viewport--divided" : "") +
                (terminalId === selection.activeId ? " terminal-panel__viewport--active" : "")
              }
              data-terminal-viewport={terminalId}
              scroll-orientation="vertical"
              bindtap={() =>
                setSelection((current) => activateTerminalSession(current, terminalId))
              }
            >
              <text className="terminal-panel__output whitespace-pre">
                {output || "Starting shell…"}
              </text>
            </scroll-view>
          );
        })}
      </view>
      {openError || session?.error ? (
        <text className="terminal-panel__error">{openError ?? session?.error}</text>
      ) : null}
      <view className="terminal-panel__command-row">
        <text className="terminal-panel__prompt">$</text>
        <input
          ref={commandInputRef}
          className="terminal-panel__input"
          {...({ value: command } as object)}
          placeholder="Run a command"
          aria-label="Terminal command"
          bindinput={(event) => setCommand(inputValue(event))}
          bindfocus={() => terminalReturnController.setFocused(true)}
          bindblur={() => terminalReturnController.setFocused(false)}
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
  void t3ClientActions.closeTerminal({ threadId, deleteHistory: true }).catch(() => undefined);
}

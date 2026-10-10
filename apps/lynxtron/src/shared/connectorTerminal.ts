// The terminal session the Lynx UI shows, built from an attach stream's
// buffer: the renderer builds it from upstream's attach atom.
import {
  type TerminalBufferState,
  terminalOutputText,
} from "@t3tools/client-runtime/state/terminal";

import type { TerminalSessionPresentation } from "./connectorProtocol.ts";

/** The key a session is stored under in the Lynx client's state. */
export function terminalSessionKey(threadId: string, terminalId: string): string {
  return `${threadId}\u0000${terminalId}`;
}

export interface TerminalSessionInput {
  readonly threadId: string;
  readonly terminalId: string;
  readonly cwd: string;
  readonly buffer: TerminalBufferState;
}

/**
 * The session shown for a terminal the server has closed: no attach stream
 * reports on it any more, so whoever closed it says so.
 */
export function closedTerminalSession(input: {
  readonly threadId: string;
  readonly terminalId: string;
  readonly cwd: string;
  readonly closedAt: string;
}): TerminalSessionPresentation {
  return {
    threadId: input.threadId,
    terminalId: input.terminalId,
    cwd: input.cwd,
    status: "closed",
    history: "",
    error: null,
    updatedAt: input.closedAt,
  };
}

export function projectTerminalSession(input: TerminalSessionInput): TerminalSessionPresentation {
  const { buffer } = input;
  return {
    threadId: input.threadId,
    terminalId: input.terminalId,
    cwd: input.cwd,
    status: buffer.status,
    history: terminalOutputText(buffer.output),
    error: buffer.error,
    updatedAt: buffer.updatedAt,
  };
}

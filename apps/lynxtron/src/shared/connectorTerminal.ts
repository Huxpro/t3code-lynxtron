// The terminal session the Lynx UI shows, built from an attach stream's
// buffer. The main connector builds it from its own attach and the renderer
// builds it from upstream's attach atom; both call this so the two sources
// cannot disagree about what a session's fields are read from.
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

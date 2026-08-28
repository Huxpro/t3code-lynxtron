export const T3_TERMINAL_RETURN_FOCUS_METHOD = "t3:terminal.return-focus";

export interface TerminalReturnFocusParams {
  readonly focused: boolean;
}

export function isTerminalReturnFocusParams(input: unknown): input is TerminalReturnFocusParams {
  return (
    typeof input === "object" &&
    input !== null &&
    typeof (input as { focused?: unknown }).focused === "boolean"
  );
}

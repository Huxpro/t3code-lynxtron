export interface TerminalGridSize {
  readonly cols: number;
  readonly rows: number;
}

const TERMINAL_HORIZONTAL_PADDING = 24;
const TERMINAL_VERTICAL_CHROME = 132;
const TERMINAL_CELL_WIDTH = 7.2;
const TERMINAL_CELL_HEIGHT = 18;

export function terminalGridSize(panelWidth: number, panelHeight: number): TerminalGridSize {
  return {
    cols: Math.max(1, Math.floor((panelWidth - TERMINAL_HORIZONTAL_PADDING) / TERMINAL_CELL_WIDTH)),
    rows: Math.max(1, Math.floor((panelHeight - TERMINAL_VERTICAL_CHROME) / TERMINAL_CELL_HEIGHT)),
  };
}

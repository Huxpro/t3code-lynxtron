const CSI_SEQUENCE = /\u001b\[[0-?]*[ -/]*[@-~]/gu;
const OSC_SEQUENCE = /\u001b\][^\u0007]*(?:\u0007|\u001b\\)/gu;

export function presentTerminalText(value: string): string {
  return value.replace(OSC_SEQUENCE, "").replace(CSI_SEQUENCE, "").replaceAll("\r", "");
}

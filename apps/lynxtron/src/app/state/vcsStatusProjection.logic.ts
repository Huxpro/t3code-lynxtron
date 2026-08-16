import type { ConnectionStatus } from "../bridge";

export function shouldReportVcsStatusReadFailure(status: ConnectionStatus): boolean {
  return status === "ready";
}

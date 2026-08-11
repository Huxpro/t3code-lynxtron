import { memo } from "react";
import { type PendingApproval } from "../../session-logic";
import { ComposerPendingApprovalSurface } from "./ComposerPendingSurface";

interface ComposerPendingApprovalPanelProps {
  approval: PendingApproval;
  pendingCount: number;
}

export const ComposerPendingApprovalPanel = memo(function ComposerPendingApprovalPanel({
  approval,
  pendingCount,
}: ComposerPendingApprovalPanelProps) {
  const approvalSummary =
    approval.requestKind === "command"
      ? "Command approval requested"
      : approval.requestKind === "file-read"
        ? "File-read approval requested"
        : "File-change approval requested";
  const detailLabel =
    approval.requestKind === "command"
      ? "Command"
      : approval.requestKind === "file-read"
        ? "File to read"
        : "File change";

  return (
    <ComposerPendingApprovalSurface
      approvalSummary={approvalSummary}
        {...(approval.detail === undefined ? {} : { detail: approval.detail })}
      detailLabel={detailLabel}
      pendingCount={pendingCount}
    />
  );
});

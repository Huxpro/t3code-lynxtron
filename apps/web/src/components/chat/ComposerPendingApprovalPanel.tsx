import { memo } from "react";
import { type PendingApproval } from "../../session-logic";
import { ComposerPendingApprovalPanelSurface } from "./ComposerPendingApprovalSurface";

interface ComposerPendingApprovalPanelProps {
  approval: PendingApproval;
  pendingCount: number;
}

export const ComposerPendingApprovalPanel = memo(function ComposerPendingApprovalPanel({
  approval,
  pendingCount,
}: ComposerPendingApprovalPanelProps) {
  return <ComposerPendingApprovalPanelSurface approval={approval} pendingCount={pendingCount} />;
});

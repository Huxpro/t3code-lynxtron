import { type ApprovalRequestId, type ProviderApprovalDecision } from "@t3tools/contracts";
import { memo } from "react";
import { ComposerPendingApprovalActionsSurface } from "./ComposerPendingApprovalSurface";

interface ComposerPendingApprovalActionsProps {
  requestId: ApprovalRequestId;
  isResponding: boolean;
  onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Promise<unknown>;
}

export const ComposerPendingApprovalActions = memo(function ComposerPendingApprovalActions({
  requestId,
  isResponding,
  onRespondToApproval,
}: ComposerPendingApprovalActionsProps) {
  return (
    <ComposerPendingApprovalActionsSurface
      requestId={requestId}
      isResponding={isResponding}
      onRespondToApproval={(nextRequestId, decision) =>
        void onRespondToApproval(nextRequestId, decision)
      }
    />
  );
});

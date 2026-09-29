import type { ApprovalRequestId, ProviderApprovalDecision } from "@t3tools/contracts";
import type { PendingApproval } from "@t3tools/client-runtime/presentation/pending-requests";
import { HostButton, HostText, HostView } from "../ui/hostElements";

export function ComposerPendingApprovalPanelSurface({
  approval,
  pendingCount,
}: {
  readonly approval: PendingApproval;
  readonly pendingCount: number;
}) {
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
    <HostView className="composer-approval-panel px-4 py-3.5 sm:px-5 sm:py-4">
      <HostView className="composer-approval-heading flex flex-wrap items-center gap-2">
        <HostText className="uppercase text-sm tracking-[0.2em]">PENDING APPROVAL</HostText>
        <HostText className="text-sm font-medium">{approvalSummary}</HostText>
        {pendingCount > 1 ? (
          <HostText className="text-xs text-muted-foreground">1/{pendingCount}</HostText>
        ) : null}
      </HostView>
      {approval.detail ? (
        <HostView className="composer-approval-detail mt-3 rounded-lg border border-border/65 bg-background/70 p-3">
          <HostText className="text-xs font-medium text-muted-foreground">{detailLabel}</HostText>
          <HostText
            aria-label={detailLabel}
            className="composer-approval-detail-text mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground"
            data-approval-detail="complete"
          >
            {approval.detail}
          </HostText>
        </HostView>
      ) : null}
    </HostView>
  );
}

export function ComposerPendingApprovalActionsSurface({
  requestId,
  isResponding,
  onRespondToApproval,
}: {
  readonly requestId: ApprovalRequestId;
  readonly isResponding: boolean;
  readonly onRespondToApproval: (
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => void;
}) {
  const action = (decision: ProviderApprovalDecision) => () => {
    if (!isResponding) onRespondToApproval(requestId, decision);
  };
  return (
    <HostView className="composer-approval-actions flex flex-wrap items-center justify-end gap-2">
      <HostButton
        className="composer-approval-action composer-approval-action--ghost"
        disabled={isResponding}
        onClick={action("cancel")}
      >
        <HostText className="composer-approval-action-label">Cancel turn</HostText>
      </HostButton>
      <HostButton
        className="composer-approval-action composer-approval-action--danger"
        disabled={isResponding}
        onClick={action("decline")}
      >
        <HostText className="composer-approval-action-label">Decline</HostText>
      </HostButton>
      <HostButton
        className="composer-approval-action composer-approval-action--outline"
        disabled={isResponding}
        onClick={action("acceptForSession")}
      >
        <HostText className="composer-approval-action-label">Always allow this session</HostText>
      </HostButton>
      <HostButton
        className="composer-approval-action composer-approval-action--primary"
        disabled={isResponding}
        onClick={action("accept")}
      >
        <HostText className="composer-approval-action-label">Approve once</HostText>
      </HostButton>
    </HostView>
  );
}

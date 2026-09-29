import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { ApprovalRequestId } from "@t3tools/contracts";

import {
  ComposerPendingApprovalActionsSurface,
  ComposerPendingApprovalPanelSurface,
} from "./ComposerPendingApprovalSurface";

const approval = {
  requestId: ApprovalRequestId.make("approval-1"),
  requestKind: "command" as const,
  createdAt: "2026-09-08T00:00:00.000Z",
  detail: "pnpm test",
};

describe("ComposerPendingApprovalSurface", () => {
  it("renders canonical request copy and queue position", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalPanelSurface approval={approval} pendingCount={2} />,
    );
    expect(markup).toContain("PENDING APPROVAL");
    expect(markup).toContain("Command approval requested");
    expect(markup).toContain("pnpm test");
    expect(markup).toContain("1/2");
  });

  it("exposes every canonical decision and disables them while responding", () => {
    const markup = renderToStaticMarkup(
      <ComposerPendingApprovalActionsSurface
        requestId={approval.requestId}
        isResponding
        onRespondToApproval={vi.fn()}
      />,
    );
    for (const label of ["Cancel turn", "Decline", "Always allow this session", "Approve once"]) {
      expect(markup).toContain(label);
    }
    expect(markup.match(/disabled/g)).toHaveLength(4);
  });

  it.each([
    ["Cancel turn", "cancel"],
    ["Decline", "decline"],
    ["Always allow this session", "acceptForSession"],
    ["Approve once", "accept"],
  ] as const)("maps %s to the canonical %s decision", (label, decision) => {
    const source = ComposerPendingApprovalActionsSurface({
      requestId: approval.requestId,
      isResponding: false,
      onRespondToApproval: vi.fn(),
    });
    const children = source.props.children as Array<{
      props: { children: { props: { children: string } }; onClick(): void };
    }>;
    const action = children.find((child) => child.props.children.props.children === label);
    const onRespondToApproval = vi.fn();
    const rerendered = ComposerPendingApprovalActionsSurface({
      requestId: approval.requestId,
      isResponding: false,
      onRespondToApproval,
    });
    const rerenderedChildren = rerendered.props.children as Array<{
      props: { children: { props: { children: string } }; onClick(): void };
    }>;
    rerenderedChildren
      .find((child) => child.props.children.props.children === label)
      ?.props.onClick();
    expect(action).toBeDefined();
    expect(onRespondToApproval).toHaveBeenCalledWith(approval.requestId, decision);
  });
});

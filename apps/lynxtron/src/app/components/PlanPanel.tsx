import { useCallback, useState } from "@lynx-js/react";
import { proposedPlanTitle } from "@t3tools/client-runtime/presentation/proposed-plan";
import type { ExpandedImagePreview } from "@t3tools/client-runtime/presentation/image-preview";
import type { ThreadId } from "@t3tools/contracts";
import {
  PlanEmptySurface,
  PlanExplanationSurface,
  PlanStepsSurface,
  ProposedPlanSectionSurface,
} from "../../../../web/src/components/PlanSurface";
import type { ActivePlanState, LatestProposedPlanState } from "../bridge";
import { MarkdownRenderer } from "./MarkdownRenderer";

interface PlanPanelProps {
  threadId?: ThreadId | undefined;
  activePlan: ActivePlanState | null;
  activeProposedPlan: LatestProposedPlanState | null;
  onImageExpand?: ((preview: ExpandedImagePreview) => void) | undefined;
}

function stepStatusIcon(status: string): string {
  if (status === "completed") return "✓";
  if (status === "inProgress") return "◌";
  return "○";
}

function stepStatusClass(status: string): string {
  if (status === "completed") return "plan-step__icon--done";
  if (status === "inProgress") return "plan-step__icon--active";
  return "plan-step__icon--pending";
}

export function PlanPanel({
  threadId,
  activePlan,
  activeProposedPlan,
  onImageExpand,
}: PlanPanelProps) {
  const [proposedExpanded, setProposedExpanded] = useState(false);
  const planMarkdown = activeProposedPlan?.planMarkdown ?? null;
  const planTitle = planMarkdown ? proposedPlanTitle(planMarkdown) : null;

  const toggleProposed = useCallback(() => {
    setProposedExpanded((v) => !v);
  }, []);

  const hasSteps = activePlan && activePlan.steps.length > 0;
  const isEmpty = !activePlan && !planMarkdown;

  return (
    <scroll-view className="plan-panel" scroll-orientation="vertical">
      <view className="plan-panel__inner">
        {/* Explanation */}
        {activePlan?.explanation ? (
          <PlanExplanationSurface>{activePlan.explanation}</PlanExplanationSurface>
        ) : null}

        {/* Plan Steps */}
        {hasSteps ? (
          <PlanStepsSurface
            steps={activePlan!.steps.map((step) => ({
              key: `${step.status}:${step.step}`,
              status: step.status,
              text: step.step,
            }))}
            renderIcon={(status) => (
              <text className={`plan-step__icon ${stepStatusClass(status)}`}>
                {stepStatusIcon(status)}
              </text>
            )}
          />
        ) : null}

        {/* Proposed Plan Markdown */}
        {planMarkdown ? (
          <ProposedPlanSectionSurface
            title={planTitle ?? "Full Plan"}
            expanded={proposedExpanded}
            onToggle={toggleProposed}
            chevron={
              <text className="plan-panel__proposed-chevron">{proposedExpanded ? "▼" : "▶"}</text>
            }
          >
            <MarkdownRenderer
              text={planMarkdown}
              streaming={false}
              onImageExpand={onImageExpand}
              threadId={threadId}
            />
          </ProposedPlanSectionSurface>
        ) : null}

        {/* Empty state */}
        {isEmpty ? <PlanEmptySurface /> : null}
      </view>
    </scroll-view>
  );
}

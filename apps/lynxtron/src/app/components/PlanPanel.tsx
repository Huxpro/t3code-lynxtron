import { useCallback, useState } from "@lynx-js/react";
import { proposedPlanTitle } from "@t3tools/client-runtime/presentation/proposed-plan";
import type { ActivePlanState, LatestProposedPlanState } from "../bridge";

interface PlanPanelProps {
  activePlan: ActivePlanState | null;
  activeProposedPlan: LatestProposedPlanState | null;
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

export function PlanPanel({ activePlan, activeProposedPlan }: PlanPanelProps) {
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
          <text className="plan-panel__explanation">{activePlan.explanation}</text>
        ) : null}

        {/* Plan Steps */}
        {hasSteps ? (
          <view className="plan-panel__steps">
            <text className="plan-panel__section-title">Steps</text>
            {activePlan!.steps.map((step) => (
              <view
                key={`${step.status}:${step.step}`}
                className={`plan-step ${step.status === "inProgress" ? "plan-step--active" : ""} ${step.status === "completed" ? "plan-step--done" : ""}`}
              >
                <text className={`plan-step__icon ${stepStatusClass(step.status)}`}>
                  {stepStatusIcon(step.status)}
                </text>
                <text
                  className={`plan-step__text ${step.status === "completed" ? "plan-step__text--done" : ""}`}
                >
                  {step.step}
                </text>
              </view>
            ))}
          </view>
        ) : null}

        {/* Proposed Plan Markdown */}
        {planMarkdown ? (
          <view className="plan-panel__proposed">
            <view className="plan-panel__proposed-header" bindtap={toggleProposed}>
              <text className="plan-panel__proposed-chevron">{proposedExpanded ? "▼" : "▶"}</text>
              <text className="plan-panel__section-title">{planTitle ?? "Full Plan"}</text>
            </view>
            {proposedExpanded ? (
              <view className="plan-panel__markdown">
                <text className="plan-panel__markdown-text">{planMarkdown}</text>
              </view>
            ) : null}
          </view>
        ) : null}

        {/* Empty state */}
        {isEmpty ? (
          <view className="plan-panel__empty">
            <text className="plan-panel__empty-title">No active plan yet.</text>
            <text className="plan-panel__empty-desc">Plans will appear here when generated.</text>
          </view>
        ) : null}
      </view>
    </scroll-view>
  );
}

import { useCallback, useEffect, useRef, useState } from "@lynx-js/react";
import {
  normalizePlanMarkdownForExport,
  proposedPlanTitle,
  stripDisplayedPlanMarkdown,
} from "@t3tools/lynx-logic/proposedPlan";
import type { ExpandedImagePreview } from "@t3tools/lynx-logic/imagePreview";
import type { ThreadId } from "@t3tools/contracts";
import {
  PlanEmptySurface,
  PlanExplanationSurface,
  PlanStepsSurface,
  ProposedPlanSectionSurface,
} from "../../../../web/src/components/PlanSurface";
import type { ActivePlanState, LatestProposedPlanState } from "../bridge";
import { MarkdownRenderer } from "./MarkdownRenderer";
import { clientCapabilities } from "../platform/clientCapabilities.lynx";
import { runMessageCopy, type MessageCopyStatus } from "./messageCopy";
import { t3ClientActions } from "../state/t3Client";
import { savePlanToDefaultWorkspacePath } from "./planActions";

interface PlanPanelProps {
  threadId?: ThreadId | undefined;
  cwd?: string | undefined;
  activePlan: ActivePlanState | null;
  activeProposedPlan: LatestProposedPlanState | null;
  onImageExpand?: ((preview: ExpandedImagePreview) => void) | undefined;
}

type PlanSaveStatus =
  | { readonly status: "pending" }
  | { readonly status: "saved"; readonly relativePath: string }
  | { readonly status: "failed"; readonly message: string };

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
  cwd,
  activePlan,
  activeProposedPlan,
  onImageExpand,
}: PlanPanelProps) {
  const [proposedExpanded, setProposedExpanded] = useState(false);
  const [copyStatus, setCopyStatus] = useState<MessageCopyStatus | null>(null);
  const [saveStatus, setSaveStatus] = useState<PlanSaveStatus | null>(null);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyGenerationRef = useRef(0);
  const saveGenerationRef = useRef(0);
  const planMarkdown = activeProposedPlan?.planMarkdown ?? null;
  const planIdentity = activeProposedPlan
    ? `${threadId ?? "no-thread"}:${activeProposedPlan.id}:${activeProposedPlan.turnId ?? "no-turn"}`
    : `${threadId ?? "no-thread"}:no-plan`;
  const planTitle = planMarkdown ? proposedPlanTitle(planMarkdown) : null;
  const displayedPlanMarkdown = planMarkdown ? stripDisplayedPlanMarkdown(planMarkdown) : null;

  const toggleProposed = useCallback(() => {
    setProposedExpanded((v) => !v);
  }, []);
  useEffect(() => {
    copyGenerationRef.current += 1;
    saveGenerationRef.current += 1;
    setProposedExpanded(false);
    setCopyStatus(null);
    setSaveStatus(null);
    if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    return () => {
      copyGenerationRef.current += 1;
      saveGenerationRef.current += 1;
      if (resetTimerRef.current !== null) clearTimeout(resetTimerRef.current);
    };
  }, [planIdentity, planMarkdown]);
  const copyPlan = useCallback(() => {
    if (!planMarkdown || copyStatus === "pending") return;
    const actionGeneration = ++copyGenerationRef.current;
    const setCurrentCopyStatus = (status: MessageCopyStatus) => {
      if (copyGenerationRef.current === actionGeneration) setCopyStatus(status);
    };
    void runMessageCopy(
      (text) => clientCapabilities.clipboard.writeText(text),
      normalizePlanMarkdownForExport(planMarkdown),
      setCurrentCopyStatus,
    ).then(() => {
      if (copyGenerationRef.current !== actionGeneration) return;
      resetTimerRef.current = setTimeout(() => {
        if (copyGenerationRef.current === actionGeneration) setCopyStatus(null);
        resetTimerRef.current = null;
      }, 1_000);
    });
  }, [copyStatus, planMarkdown]);
  const copyLabel =
    copyStatus === "pending"
      ? "Copying…"
      : copyStatus === "copied"
        ? "Copied"
        : copyStatus === "failed"
          ? "Copy failed"
          : "Copy plan";
  const savePlan = useCallback(() => {
    if (!cwd || !planMarkdown || saveStatus?.status === "pending") return;
    const actionGeneration = ++saveGenerationRef.current;
    const setCurrentSaveStatus = (status: PlanSaveStatus) => {
      if (saveGenerationRef.current === actionGeneration) setSaveStatus(status);
    };
    setCurrentSaveStatus({ status: "pending" });
    void savePlanToDefaultWorkspacePath(
      (workspace, relativePath, contents) =>
        t3ClientActions.writeProjectFile(workspace, relativePath, contents),
      cwd,
      planMarkdown,
    ).then(setCurrentSaveStatus);
  }, [cwd, planMarkdown, saveStatus]);
  const saveLabel =
    saveStatus?.status === "pending"
      ? "Saving…"
      : saveStatus?.status === "saved"
        ? `Saved: ${saveStatus.relativePath}`
        : saveStatus?.status === "failed"
          ? `Save failed: ${saveStatus.message}`
          : "Save to workspace";

  const hasSteps = activePlan && activePlan.steps.length > 0;
  const isEmpty = !activePlan && !planMarkdown;

  return (
    <scroll-view className="plan-panel" scroll-orientation="vertical">
      <view className="plan-panel__inner">
        {planMarkdown ? (
          <view className="plan-panel__actions">
            <view
              className={`plan-panel__save-action${!cwd ? " plan-panel__action--disabled" : ""}`}
              data-plan-save-state={saveStatus?.status ?? "idle"}
              aria-label={cwd ? saveLabel : "Workspace path unavailable"}
              aria-disabled={!cwd || saveStatus?.status === "pending" ? "true" : "false"}
              bindtap={!cwd || saveStatus?.status === "pending" ? undefined : savePlan}
            >
              <text className="plan-panel__copy-label">{saveLabel}</text>
            </view>
            <view
              className="plan-panel__copy-action"
              data-plan-copy-state={copyStatus ?? "idle"}
              aria-label={copyLabel}
              aria-disabled={copyStatus === "pending" ? "true" : "false"}
              bindtap={copyStatus === "pending" ? undefined : copyPlan}
            >
              <text className="plan-panel__copy-label">{copyLabel}</text>
            </view>
          </view>
        ) : null}
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
              text={displayedPlanMarkdown ?? ""}
              identity={planIdentity}
              streaming={false}
              cwd={cwd}
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

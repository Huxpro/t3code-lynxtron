/**
 * Renderer-neutral plan panel composition (AR5.3).
 *
 * One physical module owns the plan surface's shared anatomy for Web's
 * PlanSidebar and the Lynx plan panel: the explanation paragraph, the Steps
 * section label and status rows, the proposed-plan disclosure section, and
 * the empty state. Step status icons, disclosure chevrons, and the expanded
 * markdown body are platform leaves; hosts keep expansion state.
 */
import type { ReactNode } from "react";

import { cn } from "../lib/cn";
import { HostButton, HostText, HostView } from "./ui/hostElements";

export interface PlanStepSurfaceItem {
  readonly key: string;
  /** "completed" | "inProgress" | pending */
  readonly status: string;
  readonly text: string;
}

/** Plan explanation paragraph. */
export function PlanExplanationSurface({ children }: { readonly children: ReactNode }) {
  return (
    <HostText className="block text-[13px] leading-relaxed text-muted-foreground/80">
      {children}
    </HostText>
  );
}

/** Steps section: uppercase label plus one status row per step. */
export function PlanStepsSurface({
  steps,
  renderIcon,
}: {
  readonly steps: ReadonlyArray<PlanStepSurfaceItem>;
  /** Platform status icon leaf (Web: badge icons; Lynx: status glyphs). */
  readonly renderIcon: (status: string) => ReactNode;
}) {
  return (
    <HostView className="flex flex-col gap-1">
      <HostText className="mb-2 block text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40">
        Steps
      </HostText>
      {steps.map((step) => (
        <HostView
          key={step.key}
          className={cn(
            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors duration-200",
            step.status === "inProgress" && "bg-blue-500/5",
            step.status === "completed" && "bg-emerald-500/5",
          )}
        >
          {renderIcon(step.status)}
          <HostText
            className={cn(
              "text-[13px] leading-snug",
              step.status === "completed"
                ? "text-muted-foreground/50 line-through decoration-muted-foreground/20"
                : step.status === "inProgress"
                  ? "text-foreground/90"
                  : "text-muted-foreground/70",
            )}
          >
            {step.text}
          </HostText>
        </HostView>
      ))}
    </HostView>
  );
}

/** Proposed plan section: disclosure header with the expanded body as a slot. */
export function ProposedPlanSectionSurface({
  title,
  expanded,
  onToggle,
  chevron,
  children,
}: {
  /** Plan title (already resolved by the host projection) or "Full Plan". */
  readonly title: string;
  readonly expanded: boolean;
  readonly onToggle: () => void;
  /** Platform chevron leaf. */
  readonly chevron: ReactNode;
  /** Expanded markdown body (platform renderer island). */
  readonly children?: ReactNode;
}) {
  return (
    <HostView className="flex flex-col gap-2">
      <HostButton
        type="button"
        data-plan-disclosure="toggle"
        className="plan-disclosure-toggle group flex w-full items-center gap-1.5 text-left"
        onClick={onToggle}
        aria-expanded={expanded}
      >
        {chevron}
        <HostText className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/40 group-hover:text-muted-foreground/60">
          {title}
        </HostText>
      </HostButton>
      {expanded && children ? (
        <HostView className="rounded-lg border border-border/50 bg-background/50 p-3">
          {children}
        </HostView>
      ) : null}
    </HostView>
  );
}

/** Plan panel empty state. */
export function PlanEmptySurface() {
  return (
    <HostView className="flex flex-col items-center justify-center py-12 text-center">
      <HostText className="block text-[13px] text-muted-foreground/40">
        No active plan yet.
      </HostText>
      <HostText className="mt-1 block text-[11px] text-muted-foreground/30">
        Plans will appear here when generated.
      </HostText>
    </HostView>
  );
}

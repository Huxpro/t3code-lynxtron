import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  PlanEmptySurface,
  PlanExplanationSurface,
  PlanStepsSurface,
  ProposedPlanSectionSurface,
} from "./PlanSurface";

describe("PlanStepsSurface", () => {
  const steps = [
    { key: "completed:a", status: "completed", text: "Read the codebase" },
    { key: "inProgress:b", status: "inProgress", text: "Draft the plan" },
    { key: "pending:c", status: "pending", text: "Ship it" },
  ];

  it("renders the Steps label and one row per step with status treatments", () => {
    const markup = renderToStaticMarkup(
      <PlanStepsSurface steps={steps} renderIcon={(status) => <span data-icon={status} />} />,
    );
    expect(markup).toContain("STEPS");
    expect(markup).toContain('data-icon="completed"');
    expect(markup).toContain('data-icon="inProgress"');
    expect(markup).toContain('data-icon="pending"');
    expect(markup).toContain("Read the codebase");
    expect(markup).toContain("line-through");
    expect(markup).toContain("bg-blue-500/5");
    expect(markup).toContain("bg-emerald-500/5");
  });
});

describe("PlanExplanationSurface", () => {
  it("renders the explanation copy", () => {
    const markup = renderToStaticMarkup(
      <PlanExplanationSurface>Here is what I will do.</PlanExplanationSurface>,
    );
    expect(markup).toContain("Here is what I will do.");
  });
});

describe("ProposedPlanSectionSurface", () => {
  it("renders the disclosure title and hides the body when collapsed", () => {
    const markup = renderToStaticMarkup(
      <ProposedPlanSectionSurface
        title="Migration Plan"
        expanded={false}
        onToggle={vi.fn()}
        chevron={<span data-chevron />}
      >
        <div data-body />
      </ProposedPlanSectionSurface>,
    );
    expect(markup).toContain("MIGRATION PLAN");
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain("data-body");
  });

  it("renders the body inside the framed card when expanded", () => {
    const markup = renderToStaticMarkup(
      <ProposedPlanSectionSurface
        title="Full Plan"
        expanded
        onToggle={vi.fn()}
        chevron={<span data-chevron />}
      >
        <div data-body />
      </ProposedPlanSectionSurface>,
    );
    expect(markup).toContain('aria-expanded="true"');
    expect(markup).toContain("data-body");
  });
});

describe("PlanEmptySurface", () => {
  it("renders the canonical empty copy", () => {
    const markup = renderToStaticMarkup(<PlanEmptySurface />);
    expect(markup).toContain("No active plan yet.");
    expect(markup).toContain("Plans will appear here when generated.");
  });
});

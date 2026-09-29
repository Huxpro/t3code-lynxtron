#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptDirectory, "..");
const repoRoot = path.resolve(appRoot, "../..");
const reuse = JSON.parse(await readFile(path.join(appRoot, "reports/reuse/current.json"), "utf8"));
const manifest = JSON.parse(
  await readFile(path.join(appRoot, "evidence/manifests/main-shell.json"), "utf8"),
);
const previousAtlas = JSON.parse(
  await readFile(path.join(appRoot, "reports/gap-atlas.json"), "utf8"),
);

const reuseByScreen = new Map(
  reuse.screens.map((screen) => [screen.id, screen.graphs.productSurface]),
);
const historicalStyleRiskByScreen = new Map(
  previousAtlas.gaps.map((gap) => [gap.screen, gap.weightedStyleRiskOccurrences]),
);
const styleRisk = (screen) => historicalStyleRiskByScreen.get(screen) ?? 0;
const reuseMetrics = (screen) => {
  const graph = reuseByScreen.get(screen);
  return graph
    ? {
        modules: graph.reusePercent.modules,
        lines: graph.reusePercent.lines,
      }
    : null;
};
const reuseLabel = (screen) => {
  const metrics = reuseMetrics(screen);
  return metrics
    ? `${metrics.modules}% module / ${metrics.lines}% LOC reuse`
    : "unavailable reuse metrics";
};

const gaps = [
  {
    id: "GAP-001",
    surface: "Main shell / New Thread",
    states: ["new-thread-hero"],
    clients: ["web", "lynx"],
    category: "HARNESS_INVALID",
    severity: "P3",
    userImpact:
      "The old Harness read the wrong Web selector and falsely reported a model-content gap.",
    frequency: 1,
    trustImpact: 2,
    evidenceConfidence: 3,
    sourceOwner: "Plan 11C workbench state-echo selector",
    likelyRootCause:
      "The Harness queried a Lynx-only composer class instead of Web's data-chat-provider-model-picker trigger.",
    fixClass: "harness",
    reuseLeverage: 1,
    crossSurfaceLeverage: 2,
    implementationCost: 1,
    platformRisk: 0,
    nativeRequirement: "none; Browser state echo now proves equal visible labels",
    disposition: "closed",
    evidence: [
      "evidence/manifests/main-shell.json#new-thread-hero",
      "evidence/2026-08-04/H3/main-shell/1280x820/web-assertions.json",
      "evidence/2026-08-04/H3/main-shell/1280x820/lynx-assertions.json",
    ],
    screen: "new-thread-empty",
  },
  {
    id: "GAP-002",
    surface: "Main shell / Sidebar / Composer",
    states: ["all primary states"],
    clients: ["web", "lynx", "native"],
    category: "SOURCE_REUSE",
    severity: "P0",
    userImpact:
      "Closed: the main shell, Sidebar V2 anatomy, Chat header, Composer surface, and product-state projections are shared; remaining code is renderer or transport hosting.",
    frequency: 5,
    trustImpact: 5,
    evidenceConfidence: 3,
    sourceOwner: "Web route composition and Lynx platform leaves",
    likelyRootCause:
      "Closed by deletion-driven convergence onto shared composition and client-runtime presentation modules, with explicit platform leaves.",
    fixClass: "shared composition",
    reuseLeverage: 5,
    crossSurfaceLeverage: 5,
    implementationCost: 5,
    platformRisk: 2,
    nativeRequirement: "satisfied by per-slice Native interaction and runtime certification",
    disposition: "closed",
    evidence: [
      "reports/reuse/current.json",
      "docs/harness/h5-reuse-style-audit.md",
      "evidence/2026-09-12/fidelity/main-shell-source-reuse-current.json",
      "evidence/2026-09-12/fidelity/composer-real-input-current.json",
      "evidence/2026-09-12/fidelity/model-picker-shared-projection-current.json",
      "evidence/2026-09-12/fidelity/quick-switch-real-input-current.json",
    ],
    screen: "app-shell-sidebar",
  },
  {
    id: "GAP-003",
    surface: "Settings Connections / Source Control / Beta / Archive",
    states: ["default", "loading", "error", "mutation"],
    clients: ["web", "lynx", "native"],
    category: "SOURCE_REUSE",
    severity: "P2",
    userImpact:
      "Closed: shared Settings anatomy and platform capability hosts cover Connections, Source Control, Archive, and the intentional Beta-to-General consolidation.",
    frequency: 3,
    trustImpact: 4,
    evidenceConfidence: 3,
    sourceOwner: "Settings route panels and platform host slots",
    likelyRootCause:
      "Closed after correcting the production roots, measuring 22.4%-35.6% product-surface reuse, and verifying platform mutations and reverse states.",
    fixClass: "shared composition",
    reuseLeverage: 5,
    crossSurfaceLeverage: 5,
    implementationCost: 5,
    platformRisk: 2,
    nativeRequirement:
      "satisfied by loading, error/retry, mutation, reverse-state, and cold-restart checks",
    disposition: "closed",
    evidence: [
      "reports/reuse/current.json",
      "evidence/2026-09-12/fidelity/settings-platform-hosts-current.json",
      "evidence/2026-09-03/fidelity/settings-beta-mutation-native.json",
      "evidence/2026-08-16/fidelity/settings-archive-mutation-current-metrics.json",
      "evidence/2026-09-03/fidelity/settings-connections-authorized-actions.json",
      "evidence/2026-09-05/fidelity/settings-source-control-error-refresh.json",
    ],
    screen: "settings-connections",
  },
  {
    id: "GAP-004",
    surface: "All ordinary UI",
    states: ["all"],
    clients: ["lynx", "native"],
    category: "MATERIAL",
    severity: "P1",
    userImpact:
      "The initial weighted style contract exposed broad utility drift; the first high-frequency Native-safe slice is now patched.",
    frequency: 5,
    trustImpact: 4,
    evidenceConfidence: 3,
    sourceOwner: "Tailwind v3 compatibility layer and shared tokens/primitives",
    likelyRootCause:
      "The Lynx preset omits high-frequency Web utilities; reusable Native-safe mappings now live in the shared override layer.",
    fixClass: "shared token",
    reuseLeverage: 5,
    crossSurfaceLeverage: 5,
    implementationCost: 2,
    platformRisk: 3,
    nativeRequirement: "Native specimen batch after Browser calibration",
    disposition: "closed",
    evidence: ["reports/gap-atlas.json", "docs/harness/h5-reuse-style-audit.md"],
    screen: "new-thread-empty",
  },
  {
    id: "GAP-005",
    surface: "Composer",
    states: ["hero", "docked", "sendable", "working", "disabled"],
    clients: ["web", "lynx", "native"],
    category: "SOURCE_REUSE",
    severity: "P1",
    userImpact: `The primary input surface has only ${reuseLabel("composer")} at product-surface scope.`,
    frequency: 5,
    trustImpact: 5,
    evidenceConfidence: 3,
    sourceOwner: "ChatComposer / Composer shared composition",
    likelyRootCause:
      "Closed by shared Composer surfaces and projections with the Native textarea retained as an explicit platform leaf.",
    fixClass: "shared composition",
    reuseLeverage: 5,
    crossSurfaceLeverage: 4,
    implementationCost: 5,
    platformRisk: 4,
    nativeRequirement:
      "satisfied for focus, literal input, physical Return send, pointer send, and Stop; text selection remains GAP-011",
    disposition: "closed",
    evidence: [
      "reports/reuse/current.json",
      "evidence/2026-09-12/fidelity/composer-real-input-current.json",
      "evidence/2026-09-12/fidelity/composer-element-context-paired-current.json",
      "evidence/2026-09-12/fidelity/composer-attachment-paired-current.json",
    ],
    screen: "composer",
  },
  {
    id: "GAP-006",
    surface: "Model Picker",
    states: ["default", "provider rail", "query", "empty", "selected"],
    clients: ["web", "lynx", "native"],
    category: "SOURCE_REUSE",
    severity: "P1",
    userImpact: `Model selection is high-frequency and currently has ${reuseLabel("model-picker")}.`,
    frequency: 4,
    trustImpact: 5,
    evidenceConfidence: 3,
    sourceOwner: "ProviderModelPicker / ModelPicker composition",
    likelyRootCause:
      "Closed by shared catalog, provider/row projection, and shared surface anatomy with platform-specific input leaves.",
    fixClass: "shared composition",
    reuseLeverage: 4,
    crossSurfaceLeverage: 3,
    implementationCost: 3,
    platformRisk: 2,
    nativeRequirement:
      "satisfied: real open/select/dismiss/focus/typing; focused-input Arrow, Return, and numeric shortcuts remain GAP-011",
    disposition: "closed",
    evidence: [
      "reports/reuse/current.json",
      "evidence/manifests/main-shell.json#model-picker-default",
      "evidence/2026-08-24/fidelity/model-picker-native-interaction-repair.json",
      "evidence/2026-08-27/fidelity/model-picker-native-input-focus.json",
      "evidence/2026-09-11/fidelity/model-picker-focused-jump-runtime-boundary.json",
    ],
    screen: "model-picker",
  },
  {
    id: "GAP-007",
    surface: "Quick Switch",
    states: ["default", "query", "actions-only", "empty"],
    clients: ["web", "lynx", "native"],
    category: "SOURCE_REUSE",
    severity: "P1",
    userImpact: `The global navigation overlay has ${reuseLabel("quick-switch")}; default evidence is retained while query/empty input states remain blocked by the Lynx-for-Web input path.`,
    frequency: 4,
    trustImpact: 4,
    evidenceConfidence: 3,
    sourceOwner: "CommandPalette composition / QuickSwitch host",
    likelyRootCause:
      "Closed by shared search, thread presentation, and surface composition with platform-specific input leaves.",
    fixClass: "shared composition",
    reuseLeverage: 4,
    crossSurfaceLeverage: 3,
    implementationCost: 3,
    platformRisk: 3,
    nativeRequirement:
      "satisfied for Command+K, focus, literal query, pointer and Return selection, Arrow navigation, and Escape",
    disposition: "closed",
    evidence: [
      "reports/reuse/current.json",
      "evidence/manifests/main-shell.json#quick-switch-default",
      "evidence/2026-09-12/fidelity/quick-switch-real-input-current.json",
      "evidence/2026-08-27/fidelity/quick-switch-native-filter-states.json",
    ],
    screen: "quick-switch",
  },
  {
    id: "GAP-008",
    surface: "Existing thread / Transcript",
    states: ["idle", "working", "completed", "failed", "approval", "question"],
    clients: ["web", "lynx", "native"],
    category: "INTERACTION",
    severity: "P1",
    userImpact:
      "Closed: same-thread lifecycle, Native physical wheel/follow, detached incoming growth, and same-snapshot Web/Native tail-position semantics are verified.",
    frequency: 5,
    trustImpact: 5,
    evidenceConfidence: 2,
    sourceOwner: "MessagesTimeline shared rows and Native list host",
    likelyRootCause:
      "Closed by one canonical long-thread fixture plus Web CDP wheel and exact-owned Native Computer Use wheel/Jump evidence.",
    fixClass: "platform primitive",
    reuseLeverage: 4,
    crossSurfaceLeverage: 4,
    implementationCost: 4,
    platformRisk: 5,
    nativeRequirement: "satisfied: real list wheel/follow and state switching",
    disposition: "closed",
    evidence: [
      "evidence/manifests/main-shell.json#existing-thread-idle",
      "evidence/2026-09-10/fidelity/transcript-follow-state-current.json",
      "compat-matrix.md#R12",
    ],
    screen: "existing-thread-transcript",
  },
  {
    id: "GAP-009",
    surface: "Light theme",
    states: ["all primary surfaces"],
    clients: ["web", "lynx", "native"],
    category: "RUNTIME_CAPABILITY",
    severity: "P1",
    userImpact:
      "Closed: Web and Lynx support light/dark/system through generated dual token sets and the host-driven root theme class.",
    frequency: 4,
    trustImpact: 4,
    evidenceConfidence: 3,
    sourceOwner: "generated Lynx tokens and runtime theme host",
    likelyRootCause:
      "The historical atlas predated the dual token generator, system-theme host, and exact-bundle light/dark evidence.",
    fixClass: "product pipeline",
    reuseLeverage: 5,
    crossSurfaceLeverage: 5,
    implementationCost: 4,
    platformRisk: 3,
    nativeRequirement: "completed exact-bundle light/dark Native evidence",
    disposition: "closed",
    evidence: [
      "compat-matrix.md#R13",
      "evidence/2026-08-15/fidelity/new-thread-hero-light-current-metrics.json",
      "evidence/2026-08-16/fidelity/existing-thread-working-light-responsive-current-metrics.json",
      "evidence/2026-08-18/fidelity/page-config-capabilities-current.json",
    ],
    screen: "new-thread-empty",
  },
  {
    id: "GAP-010",
    surface: "Review / Changed Files",
    states: ["checkpoint", "tree", "diff", "empty"],
    clients: ["web", "lynx", "native"],
    category: "RUNTIME_CAPABILITY",
    severity: "P1",
    userImpact:
      "Closed: checkpoint, tree, diff, empty, multi-file rendering, and visible diff tools are available through the Native fallback.",
    frequency: 4,
    trustImpact: 5,
    evidenceConfidence: 3,
    sourceOwner: "DiffPanel / changed-files composition and R10 renderer island",
    likelyRootCause:
      "Closed by the Native diff renderer fallback plus repeatable multi-file semantic checks and exact-owned physical pointer evidence.",
    fixClass: "hard island",
    reuseLeverage: 4,
    crossSurfaceLeverage: 3,
    implementationCost: 5,
    platformRisk: 5,
    nativeRequirement: "satisfied by explicit Native fallback and real multi-file tool interaction",
    disposition: "closed",
    evidence: [
      "reports/reuse/current.json",
      "compat-matrix.md#R10",
      "evidence/2026-09-11/fidelity/review-diff-semantic-current.json",
      "evidence/2026-09-12/fidelity/review-multi-file-real-input-current.json",
    ],
    screen: "review-changed-files",
  },
  {
    id: "GAP-011",
    surface: "Native keyboard/focus",
    states: ["Model Picker", "Composer selection"],
    clients: ["native"],
    category: "RUNTIME_CAPABILITY",
    severity: "P1",
    userImpact:
      "Model Picker keyboard selection and Composer Command+A selection remain unavailable even though Quick Switch Arrow/Return, Composer Return, and Escape now pass physical input.",
    frequency: 5,
    trustImpact: 4,
    evidenceConfidence: 3,
    sourceOwner: "Lynxtron host input and menu accelerator bridge",
    likelyRootCause:
      "The focused Model Picker input does not propagate Arrow or Return to its container, while Lynxtron's macOS menu bridge cannot encode Arrow keys; focused Native text controls also do not receive Command+A selection.",
    fixClass: "runtime capability",
    reuseLeverage: 3,
    crossSurfaceLeverage: 5,
    implementationCost: 5,
    platformRisk: 5,
    nativeRequirement:
      "physical Arrow/Return is satisfied for Quick Switch and Return for Composer; Model Picker keyboard selection and Composer Command+A selection require an upstream runtime change",
    disposition: "blocked-runtime",
    evidence: [
      "compat-matrix.md#R5",
      "evidence/2026-09-12/fidelity/native-return-bridge-current.json",
    ],
    screen: "quick-switch",
  },
  {
    id: "GAP-012",
    surface: "Settings Appearance",
    states: ["General appearance", "theme", "wrap", "identification"],
    clients: ["web", "lynx", "native"],
    category: "INTERACTION",
    severity: "P2",
    userImpact:
      "Closed: theme, glass opacity, environment identification, and word wrap have real persisted Native controls.",
    frequency: 3,
    trustImpact: 3,
    evidenceConfidence: 3,
    sourceOwner: "AppearanceSettingsSurface and runtime preferences",
    likelyRootCause:
      "Closed by wiring the shared Appearance anatomy to canonical portable client settings and Native material/consumer hosts.",
    fixClass: "host adapter",
    reuseLeverage: 4,
    crossSurfaceLeverage: 4,
    implementationCost: 3,
    platformRisk: 3,
    nativeRequirement: "satisfied by real pointer mutation, persistence, and cold restart",
    disposition: "closed",
    evidence: [
      "reports/reuse/current.json",
      "compat-matrix.md#R13",
      "evidence/2026-09-12/fidelity/settings-appearance-real-controls-current.json",
    ],
    screen: "settings-appearance",
  },
  {
    id: "GAP-013",
    surface: "Composer image input",
    states: ["composer-image-attachment"],
    clients: ["native"],
    category: "RUNTIME_CAPABILITY",
    severity: "P2",
    userImpact:
      "Native accepts pasted clipboard images like Web, but dropping an image file on the Composer does nothing because Lynx exposes no file-drop event.",
    frequency: 2,
    trustImpact: 2,
    evidenceConfidence: 3,
    sourceOwner: "Lynxtron host drag-and-drop bridge",
    likelyRootCause:
      "Lynxtron forwards no native drag/drop file events to the LynxView. Web has no picker either, so the 0.0.21 open-dialog FiberSetAttribute error is off the product path.",
    fixClass: "runtime capability",
    reuseLeverage: 2,
    crossSurfaceLeverage: 2,
    implementationCost: 4,
    platformRisk: 4,
    nativeRequirement:
      "Command+V image paste is satisfied through the Edit menu handler; file drop requires an upstream drag/drop event",
    disposition: "blocked-runtime",
    evidence: [
      "docs/plans/14-journey-driven-convergence/M1-local-composer-journey.md",
      "evidence/2026-09-29/M1/local-journey.json",
    ],
    screen: "composer",
  },
  {
    id: "GAP-014",
    surface: "Composer runtime menu",
    states: ["composer-runtime-menu"],
    clients: ["native"],
    category: "SHARED_PRIMITIVE",
    severity: "P3",
    userImpact:
      "An outside tap near the window corner does not close the runtime (permission) menu on Lynxtron 0.0.28; taps elsewhere, Escape, and item selection still work.",
    frequency: 2,
    trustImpact: 2,
    evidenceConfidence: 3,
    sourceOwner: "Composer runtime menu (local popup and dismiss layer)",
    likelyRootCause:
      "The menu keeps an absolute popup and a z-index 0 fixed dismiss layer inside the Composer; raising the layer covers the popup items because Lynx does not order a fixed layer against an absolute sibling's stacking context.",
    fixClass: "shared primitive",
    reuseLeverage: 3,
    crossSurfaceLeverage: 2,
    implementationCost: 3,
    platformRisk: 2,
    nativeRequirement:
      "satisfied: the runtime menu renders through the shared Lynx Menu (fixed popup 161, full-window dismiss layer 160) and corner taps dismiss it",
    disposition: "closed",
    evidence: [
      "evidence/2026-09-29/M2/transcript-and-input.json",
      "evidence/2026-09-29/M4/duplicate-decisions.json",
    ],
    screen: "composer",
  },
];

const severityScore = { P0: 5, P1: 4, P2: 2, P3: 1 };
for (const gap of gaps) {
  gap.reuse = reuseMetrics(gap.screen);
  gap.weightedStyleRiskOccurrences = styleRisk(gap.screen);
  gap.priorityScore =
    severityScore[gap.severity] * 4 +
    gap.frequency * 3 +
    gap.trustImpact * 3 +
    gap.reuseLeverage * 2 +
    gap.crossSurfaceLeverage * 2 +
    gap.evidenceConfidence -
    gap.implementationCost -
    gap.platformRisk;
}
gaps.sort(
  (left, right) => right.priorityScore - left.priorityScore || left.id.localeCompare(right.id),
);

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  sources: {
    manifest: "apps/lynxtron/evidence/manifests/main-shell.json",
    reuse: "apps/lynxtron/reports/reuse/current.json",
    style: "historical values retained from apps/lynxtron/reports/gap-atlas.json",
    compatibility: "apps/lynxtron/docs/compat-matrix.md",
  },
  incompleteRequiredCells: manifest.states.flatMap((state) =>
    state.requiredClients
      .filter((client) => !["retained", "blocked"].includes(state.evidence[client]?.status))
      .map((client) => `${state.id}.${client}`),
  ),
  blockedRequiredCells: manifest.states.flatMap((state) =>
    state.requiredClients
      .filter((client) => state.evidence[client]?.status === "blocked")
      .map((client) => ({
        cell: `${state.id}.${client}`,
        blockerId: state.evidence[client].blockerId,
      })),
  ),
  gaps,
};
const openGaps = gaps.filter((gap) => gap.disposition !== "closed");

const jsonPath = path.join(appRoot, "reports/gap-atlas.json");
await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);

const rows = gaps
  .map(
    (gap) =>
      `| ${gap.id} | ${gap.severity} | ${gap.category} | ${gap.surface} | ${gap.priorityScore} | ${gap.disposition} | ${gap.sourceOwner} |`,
  )
  .join("\n");
const details = gaps
  .map(
    (gap) => `## ${gap.id} — ${gap.surface}

- Severity/category: \`${gap.severity}\` / \`${gap.category}\`
- Priority score: ${gap.priorityScore}
- User impact: ${gap.userImpact}
- Clients/states: ${gap.clients.join(", ")} / ${gap.states.join(", ")}
- Source owner: ${gap.sourceOwner}
- Likely root cause: ${gap.likelyRootCause}
- Fix class: \`${gap.fixClass}\`
- Physical reuse: ${
      gap.reuse ? `${gap.reuse.modules}% modules / ${gap.reuse.lines}% LOC` : "not audited"
    }
- Weighted style risk occurrences: ${gap.weightedStyleRiskOccurrences}
- Native requirement: ${gap.nativeRequirement}
- Disposition: \`${gap.disposition}\`
- Evidence:
${gap.evidence.map((entry) => `  - \`${entry}\``).join("\n")}
`,
  )
  .join("\n");
const markdown =
  `# Plan 11C residual atlas

Generated: ${report.generatedAt}

This atlas combines strict evidence, production-resolver physical reuse,
weighted style coverage, and registered Native runtime boundaries. Missing
three-client evidence lowers confidence; it does not silently pass a gap.

## Summary

- Gaps: ${gaps.length}
- P0: ${gaps.filter((gap) => gap.severity === "P0").length}
- P1: ${gaps.filter((gap) => gap.severity === "P1").length}
- P2: ${gaps.filter((gap) => gap.severity === "P2").length}
- Incomplete required evidence cells: ${report.incompleteRequiredCells.length}
- Blocked required evidence cells: ${report.blockedRequiredCells.length}

| ID | Severity | Category | Surface | Score | Disposition | Owner |
| --- | --- | --- | --- | ---: | --- | --- |
${rows}

${details}`.trimEnd() + "\n";
await mkdir(path.join(appRoot, "docs"), { recursive: true });
await writeFile(path.join(appRoot, "docs/gap-atlas.md"), markdown);
console.log(
  JSON.stringify(
    {
      json: path.relative(repoRoot, jsonPath),
      markdown: "apps/lynxtron/docs/gap-atlas.md",
      gaps: gaps.length,
      top: openGaps.slice(0, 10).map((gap) => ({
        id: gap.id,
        score: gap.priorityScore,
        surface: gap.surface,
      })),
    },
    null,
    2,
  ),
);

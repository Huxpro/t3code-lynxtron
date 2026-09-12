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
    userImpact: `${reuseLabel("app-shell-sidebar")} keeps the most visible product surfaces on divergent implementations and makes every fidelity fix expensive.`,
    frequency: 5,
    trustImpact: 5,
    evidenceConfidence: 3,
    sourceOwner: "Web route composition and Lynx platform leaves",
    likelyRootCause:
      "Large route owners remain Web-only while Lynx assembles local hosts around a small set of shared surfaces.",
    fixClass: "shared composition",
    reuseLeverage: 5,
    crossSurfaceLeverage: 5,
    implementationCost: 5,
    platformRisk: 2,
    nativeRequirement: "Native smoke per extracted slice",
    disposition: "open",
    evidence: ["reports/reuse/current.json", "docs/harness/h5-reuse-style-audit.md"],
    screen: "app-shell-sidebar",
  },
  {
    id: "GAP-003",
    surface: "Settings Connections / Source Control / Beta / Archive",
    states: ["default", "loading", "error", "mutation"],
    clients: ["web", "lynx", "native"],
    category: "SOURCE_REUSE",
    severity: "P2",
    userImpact: `Corrected production roots report ${reuseLabel("settings-connections")} for Connections, ${reuseLabel("settings-source-control")} for Source Control, ${reuseLabel("settings-beta")} for Beta, and ${reuseLabel("settings-archive")} for Archive; route owners remain split despite meaningful shared anatomy.`,
    frequency: 3,
    trustImpact: 4,
    evidenceConfidence: 3,
    sourceOwner: "Settings route panels and platform host slots",
    likelyRootCause:
      "The original audit pointed at SettingsPage instead of OtherSettings; after correcting that harness error, route owners and capability hosts still remain split.",
    fixClass: "shared composition",
    reuseLeverage: 5,
    crossSurfaceLeverage: 5,
    implementationCost: 5,
    platformRisk: 2,
    nativeRequirement: "Native route/navigation/mutation batch",
    disposition: "open",
    evidence: ["reports/reuse/current.json"],
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
      "satisfied for focus, literal input, pointer send, and Stop; Return and text selection remain GAP-011",
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
      "satisfied: real open/select/dismiss/focus/typing; numeric shortcuts tracked by GAP-011",
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
      "Ranking semantics are shared but the Web palette composition is not compiled by Lynx.",
    fixClass: "shared composition",
    reuseLeverage: 4,
    crossSurfaceLeverage: 3,
    implementationCost: 3,
    platformRisk: 3,
    nativeRequirement: "Native visible-control path and keyboard boundary",
    disposition: "open",
    evidence: [
      "reports/reuse/current.json",
      "evidence/manifests/main-shell.json#quick-switch-default",
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
      "Completed work cannot reach full patch review parity; current product-surface reuse is 3.3% / 3.0%.",
    frequency: 4,
    trustImpact: 5,
    evidenceConfidence: 3,
    sourceOwner: "DiffPanel / changed-files composition and R10 renderer island",
    likelyRootCause:
      "DOM/Worker patch renderer is unavailable and surrounding review composition remains split.",
    fixClass: "hard island",
    reuseLeverage: 4,
    crossSurfaceLeverage: 3,
    implementationCost: 5,
    platformRisk: 5,
    nativeRequirement: "required explicit fallback or host-backed patch renderer",
    disposition: "open",
    evidence: ["reports/reuse/current.json", "compat-matrix.md#R10"],
    screen: "review-changed-files",
  },
  {
    id: "GAP-011",
    surface: "Native keyboard/focus",
    states: ["New Thread", "Quick Switch", "Settings", "Composer"],
    clients: ["native"],
    category: "RUNTIME_CAPABILITY",
    severity: "P1",
    userImpact:
      "Core keyboard workflows remain pending-user-session and cannot be certified headlessly.",
    frequency: 5,
    trustImpact: 4,
    evidenceConfidence: 3,
    sourceOwner: "Lynxtron host input and menu accelerator bridge",
    likelyRootCause: "Renderer global key API and DevTool key dispatch are incomplete.",
    fixClass: "runtime capability",
    reuseLeverage: 3,
    crossSurfaceLeverage: 5,
    implementationCost: 5,
    platformRisk: 5,
    nativeRequirement: "required authorized real OS input session",
    disposition: "blocked-runtime",
    evidence: ["compat-matrix.md#R5"],
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
      "Appearance composition exists but controls remain labeled unavailable and have no strict state matrix.",
    frequency: 3,
    trustImpact: 3,
    evidenceConfidence: 3,
    sourceOwner: "AppearanceSettingsSurface and runtime preferences",
    likelyRootCause: "Shared anatomy landed before runtime theme/wrap capabilities.",
    fixClass: "host adapter",
    reuseLeverage: 4,
    crossSurfaceLeverage: 4,
    implementationCost: 3,
    platformRisk: 3,
    nativeRequirement: "theme/wrap persistence and restart",
    disposition: "open",
    evidence: ["reports/reuse/current.json", "compat-matrix.md#R13"],
    screen: "settings-appearance",
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

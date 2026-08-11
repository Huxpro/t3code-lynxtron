const COMPOSER_ANCHOR_IDS = [
  "shell",
  "surface",
  "editor",
  "footer",
  "toolbar",
  "model",
  "runtime",
  "interaction",
  "primaryAction",
  "context",
];

export function assertComposerGeometry(measurements) {
  for (const id of COMPOSER_ANCHOR_IDS) {
    const rect = measurements.anchors[id]?.rect;
    if (!rect || rect.width <= 0 || rect.height <= 0) {
      throw new Error(`Composer ${id} lacks visible geometry.`);
    }
  }

  const controlIds = [
    "model",
    ...(measurements.anchors.modelOption?.rect ? ["modelOption"] : []),
    "runtime",
    "interaction",
    "primaryAction",
  ];
  const controls = controlIds.map((id) => measurements.anchors[id].rect);
  for (let index = 1; index < controls.length; index += 1) {
    const previousRight = controls[index - 1].x + controls[index - 1].width;
    if (controls[index].x < previousRight - 1) {
      throw new Error(
        `Composer controls overlap or lost canonical order: ${JSON.stringify({ controlIds, controls })}`,
      );
    }
  }

  const shell = measurements.anchors.shell.rect;
  for (const id of ["surface", "editor", "footer", "toolbar", ...controlIds, "context"]) {
    const rect = measurements.anchors[id].rect;
    if (rect.x < shell.x - 1 || rect.x + rect.width > shell.x + shell.width + 1) {
      throw new Error(`Composer ${id} escaped the shared shell.`);
    }
  }

  const surface = measurements.anchors.surface.rect;
  for (const id of ["editor", "footer"]) {
    const rect = measurements.anchors[id].rect;
    if (rect.y < surface.y - 1 || rect.y + rect.height > surface.y + surface.height + 1) {
      throw new Error(`Composer ${id} escaped the shared surface.`);
    }
  }

  const editor = measurements.anchors.editor.rect;
  const footer = measurements.anchors.footer.rect;
  if (footer.y < editor.y) {
    throw new Error("Composer footer rendered above the editor.");
  }

  const context = measurements.anchors.context.rect;
  const surfaceBottom = surface.y + surface.height;
  if (context.y > surfaceBottom + 1 || context.y + context.height < surfaceBottom - 1) {
    throw new Error("Composer context strip lost its shared tucked overlap.");
  }
}

export function assertComposerRouteState({ hero, overlay }, expected) {
  if (expected === "existing-thread") {
    if (overlay === null || hero !== null) {
      throw new Error(
        "The Plan 11 fixture must begin on an existing thread with transcript content.",
      );
    }
    return;
  }

  if (expected === "new-thread") {
    if (hero === null || overlay !== null) {
      throw new Error("Creating a new thread did not enter the canonical new-thread state.");
    }
    return;
  }

  throw new Error(`Unknown Composer route state: ${expected}`);
}

export function buildPlan11SemanticOutcomes(finalResult) {
  return {
    O1: finalResult?.sidebarScope?.status ?? "fail",
    O2: finalResult?.settingsNavigation?.status ?? "fail",
    O3: finalResult?.composer?.status ?? "fail",
    O4: finalResult?.branding?.status ?? "fail",
    O5: finalResult?.lifecycleRecovery?.status ?? "fail",
  };
}

export function buildPlan11SemanticCertification() {
  return {
    tier: "plan11-semantic-outcomes",
    visualComparison: "pending-matched-web-lynx-captures",
    complete: false,
  };
}

/**
 * SB3 single-server dual-frontend workbench controller.
 *
 * Both panes point at ONE shared T3 Code server (SB2 seeded, isolated). The
 * left pane is the REAL Web app served single-origin (`/web-app/…` static, with
 * `/api|/ws|/oauth|/.well-known` proxied to the server by the capture harness);
 * it authenticates via the injected pairing token. The right pane is the
 * existing Lynx-for-Web bundle driven by the SB1 dev-only live connector
 * transport against the SAME server (`?live=1&socket=…`).
 *
 * The controller owns lifecycle and identity only; it never re-implements
 * product UI. It exposes `__T3_WORKBENCH__.read()` aggregating each pane's
 * readiness so the capture command can gate on BOTH panes rendering the same
 * seeded record from the same server.
 */
const url = new URL(window.location.href);
const width = Number(url.searchParams.get("width") ?? "1280");
const height = Number(url.searchParams.get("height") ?? "820");
// Injected by the harness: pairing token (web), live socket URL (lynx),
// scenario id (route/overlay for the lynx pane), and the expected seeded record.
const pairingToken = url.searchParams.get("pairingToken") ?? "";
const socketUrl = url.searchParams.get("socket") ?? "";
const scenario = url.searchParams.get("scenario") ?? "existing-thread";
const webRoute = url.searchParams.get("webRoute") ?? "/";
const expectProject = url.searchParams.get("expectProject") ?? "";
const expectThread = url.searchParams.get("expectThread") || null;
const expectedSemanticRoute = url.searchParams.get("semanticRoute") ?? "new-thread";
const theme = url.searchParams.get("theme") === "light" ? "light" : "dark";
const expectedOverlay = url.searchParams.get("overlay") || null;
const requestedSidebarWidthRaw = url.searchParams.get("sidebarWidth");
const requestedSidebarWidthValue =
  requestedSidebarWidthRaw === null ? Number.NaN : Number(requestedSidebarWidthRaw);
const requestedSidebarWidth =
  Number.isFinite(requestedSidebarWidthValue) && requestedSidebarWidthValue > 0
    ? requestedSidebarWidthValue
    : null;
const environmentIdentificationMode = "none";
const SETTINGS_NAV_LABELS = [
  "General",
  "Appearance",
  "Keybindings",
  "Providers",
  "Source Control",
  "Connections",
  "Beta",
  "Archive",
];
const SETTINGS_ANCHOR_BY_ROUTE = {
  "settings-general": [
    "project-grouping",
    "time-format",
    "hide-whitespace-changes",
    "assistant-output",
    "provider-update-checks",
    "auto-open-task-panel",
    "new-threads",
    "add-project-starts-in",
    "archive-confirmation",
    "delete-confirmation",
    "text-generation-model",
    "diagnostics",
  ],
  "settings-appearance": [
    "theme",
    "setting-glass-opacity",
    "environment-identification",
    "word-wrap",
  ],
  "settings-keybindings": ["keybindings"],
  "settings-connections": ["remote-environments"],
  "settings-source-control": ["source-control"],
  "settings-beta": ["sidebar-v2"],
  "settings-archive": ["archive"],
};

function readElementBox(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null;
  }
  return {
    tagName: element.tagName.toLowerCase(),
    lynxComputedDisplay: element.getAttribute("lynx-computed-display"),
    attributes: Object.fromEntries(
      element.getAttributeNames().map((name) => [name, element.getAttribute(name)]),
    ),
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    style: {
      display: style.display,
      flexDirection: style.flexDirection,
      position: style.position,
      zIndex: style.zIndex,
      overflow: style.overflow,
      overflowX: style.overflowX,
      overflowY: style.overflowY,
      pointerEvents: style.pointerEvents,
      boxSizing: style.boxSizing,
      minHeight: style.minHeight,
      maxHeight: style.maxHeight,
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      borderTopColor: style.borderTopColor,
      borderRightColor: style.borderRightColor,
      borderBottomColor: style.borderBottomColor,
      borderLeftColor: style.borderLeftColor,
      borderTopLeftRadius: style.borderTopLeftRadius,
      borderTopRightRadius: style.borderTopRightRadius,
      borderBottomLeftRadius: style.borderBottomLeftRadius,
      borderBottomRightRadius: style.borderBottomRightRadius,
      backgroundColor: style.backgroundColor,
      boxShadow: style.boxShadow,
      color: style.color,
      fontFamily: style.fontFamily,
      rowGap: style.rowGap,
      columnGap: style.columnGap,
      marginTop: style.marginTop,
      marginRight: style.marginRight,
      marginBottom: style.marginBottom,
      marginLeft: style.marginLeft,
      flexGrow: style.flexGrow,
      flexShrink: style.flexShrink,
      flexBasis: style.flexBasis,
      flexDirectionToken: style.getPropertyValue("--flex-direction"),
      lynxDisplayToken: style.getPropertyValue("--lynx-display"),
      lynxDisplayToggle: style.getPropertyValue("--lynx-display-toggle"),
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      opacity: style.opacity,
    },
  };
}

function readSidebarThreadMetrics(item) {
  const rect = item.getBoundingClientRect();
  const child = item.querySelector('[role="button"]');
  const childRect = child?.getBoundingClientRect();
  const content = item.querySelector("[data-sidebar-card-content]");
  const contentRect = content?.getBoundingClientRect();
  const childStyle = child ? getComputedStyle(child) : null;
  const contentStyle = content ? getComputedStyle(content) : null;
  return {
    tagName: item.tagName,
    id: item.id || null,
    threadId: item.getAttribute("data-thread-id"),
    active: item.getAttribute("data-thread-active"),
    status: item.querySelector('[role="status"]')?.textContent?.trim() ?? null,
    className: item.getAttribute("class"),
    text: item.textContent?.trim().slice(0, 160) ?? "",
    rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    child:
      child && childRect
        ? {
            tagName: child.tagName,
            role: child.getAttribute("role"),
            className: child.getAttribute("class"),
            rect: {
              x: childRect.x,
              y: childRect.y,
              width: childRect.width,
              height: childRect.height,
            },
            backgroundColor: childStyle?.backgroundColor ?? null,
            style: child
              ? {
                  boxSizing: childStyle?.boxSizing ?? null,
                  display: childStyle?.display ?? null,
                  height: childStyle?.height ?? null,
                  minHeight: childStyle?.minHeight ?? null,
                  maxHeight: childStyle?.maxHeight ?? null,
                  overflow: childStyle?.overflow ?? null,
                  paddingTop: childStyle?.paddingTop ?? null,
                  paddingRight: childStyle?.paddingRight ?? null,
                  paddingBottom: childStyle?.paddingBottom ?? null,
                  paddingLeft: childStyle?.paddingLeft ?? null,
                }
              : null,
            content:
              content && contentRect
                ? {
                    rect: {
                      x: contentRect.x,
                      y: contentRect.y,
                      width: contentRect.width,
                      height: contentRect.height,
                    },
                    backgroundColor: contentStyle?.backgroundColor ?? null,
                    style: {
                      boxSizing: contentStyle?.boxSizing ?? null,
                      display: contentStyle?.display ?? null,
                      height: contentStyle?.height ?? null,
                      minHeight: contentStyle?.minHeight ?? null,
                      maxHeight: contentStyle?.maxHeight ?? null,
                      overflow: contentStyle?.overflow ?? null,
                      paddingTop: contentStyle?.paddingTop ?? null,
                      paddingRight: contentStyle?.paddingRight ?? null,
                      paddingBottom: contentStyle?.paddingBottom ?? null,
                      paddingLeft: contentStyle?.paddingLeft ?? null,
                    },
                  }
                : null,
          }
        : null,
    statusSlot: readElementBox(item.querySelector(".sidebar-v2-row-status-slot")),
    statusBox: readElementBox(item.querySelector(".sidebar-v2-row-status")),
    statusContent: readElementBox(item.querySelector(".sidebar-v2-row-status-content")),
    workingDuration: readElementBox(item.querySelector(".sidebar-v2-working-duration")),
  };
}

function readComposerToolbarAllocation(firstControl, primaryActions) {
  if (!firstControl || !primaryActions) return null;
  const firstControlRect = firstControl.getBoundingClientRect();
  const primaryActionsRect = primaryActions.getBoundingClientRect();
  return {
    rect: {
      x: firstControlRect.x,
      y: firstControlRect.y,
      width: primaryActionsRect.x - firstControlRect.x,
      height: firstControlRect.height,
    },
    firstControlRight: firstControlRect.x + firstControlRect.width,
    primaryActionsX: primaryActionsRect.x,
  };
}

function readElementAncestors(element, depth = 4) {
  const ancestors = [];
  let current = element?.parentElement ?? null;
  while (current && ancestors.length < depth) {
    ancestors.push(readElementBox(current));
    current = current.parentElement;
  }
  return ancestors;
}

function readSettingsRows(root, ids) {
  return ids.flatMap((id) => {
    const row = root?.getElementById(id);
    if (!row) return [];
    const title = row.querySelector(".settings-row__title, h3");
    const description = row.querySelector(".settings-row__desc, p");
    const lynxText = row.querySelector(".settings-row__text");
    const webGrid = lynxText ? null : row.firstElementChild;
    const webText = webGrid?.firstElementChild ?? null;
    const status =
      row.querySelector(".settings-row__status") ??
      (webText && webText.children.length > 2 ? webText.children[2] : null);
    const control =
      row.querySelector(".settings-row__control") ??
      (webGrid && webGrid.children.length > 1 ? webGrid.children[1] : null);
    return [
      {
        id,
        title: title?.textContent?.trim().replace(/\s+/g, " ") ?? "",
        description: description?.textContent?.trim().replace(/\s+/g, " ") ?? "",
        status: status?.textContent?.trim().replace(/\s+/g, " ") ?? "",
        controlText: control?.textContent?.trim().replace(/\s+/g, " ") ?? "",
        ariaDisabled: row.getAttribute("aria-disabled"),
        unavailable: row.getAttribute("data-settings-unavailable"),
        box: readElementBox(row),
        titleBox: readElementBox(title),
        descriptionBox: readElementBox(description),
        statusBox: readElementBox(status),
        controlBox: readElementBox(control),
      },
    ];
  });
}

function readKeybindingsMetrics(root) {
  const header = root?.querySelector("[data-keybindings-table-header]") ?? null;
  const rows = [
    ...(root?.querySelectorAll("[data-keybinding-command][data-keybinding-shortcut]") ?? []),
  ];
  return {
    header: readElementBox(header),
    headerColumns: [...(header?.children ?? [])].map((item) => ({
      text: item.textContent?.trim() ?? "",
      box: readElementBox(item),
    })),
    rows: rows.map((row) => ({
      command: row.getAttribute("data-keybinding-command"),
      shortcut: row.getAttribute("data-keybinding-shortcut"),
      when: row.getAttribute("data-keybinding-when"),
      source: row.getAttribute("data-keybinding-source"),
      conflicts: JSON.parse(row.getAttribute("data-keybinding-conflicts") ?? "[]"),
      box: readElementBox(row),
      columns: [...row.children].map((item) => ({
        text: item.textContent?.trim().replace(/\s+/g, " ") ?? "",
        box: readElementBox(item),
      })),
    })),
  };
}

function readSidebarStageIdentity(root) {
  const backdrop = root?.querySelector("[data-stage-backdrop-variant]") ?? null;
  const brand = root?.querySelector(".sidebar-brand") ?? null;
  const backdropBox = readElementBox(backdrop);
  return {
    variant: backdrop?.getAttribute("data-stage-backdrop-variant") ?? null,
    backdropPresent: backdrop !== null,
    backdropVisible:
      backdropBox !== null &&
      backdropBox.style.display !== "none" &&
      backdropBox.rect.width > 0 &&
      backdropBox.rect.height > 0,
    brandOnBackdrop: brand?.classList.contains("sidebar-brand--on-backdrop") ?? false,
  };
}

function readTextLineRects(element) {
  if (!element) return [];
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  return [...range.getClientRects()].map((rect) => ({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  }));
}

function readModelPickerRows(elements) {
  return [...elements].map((row) => ({
    key: row.getAttribute("data-model-picker-key"),
    selected: row.getAttribute("data-model-picker-selected") === "true",
    box: readElementBox(row),
    children: [...row.children].map((child) => readElementBox(child)),
    textLeaves: [...row.querySelectorAll("x-text, text, span")]
      .filter(
        (leaf) => leaf.querySelector("x-text, text, span") === null && leaf.textContent?.trim(),
      )
      .map((leaf) => ({
        text: leaf.textContent?.trim() ?? "",
        box: readElementBox(leaf),
      })),
    icons: [...row.querySelectorAll("x-image, image, img, svg")].map((icon) =>
      readElementBox(icon),
    ),
  }));
}

function readSidebarSearchRows(elements) {
  return [...elements].map((row) => {
    const title =
      row.querySelector(".sidebar-v2-search-result__title") ??
      row.querySelector(".sidebar-v2-row-title") ??
      row.querySelector("[data-sidebar-search-result-title]") ??
      row.querySelector(".truncate");
    return {
      id:
        row.getAttribute("data-sidebar-search-result") ??
        row.getAttribute("data-thread-id") ??
        row.getAttribute("data-value"),
      title: title?.textContent?.trim() ?? "",
      ariaSelected: row.getAttribute("aria-selected"),
      ariaCurrent: row.getAttribute("aria-current"),
      box: readElementBox(row),
      titleBox: readElementBox(title),
    };
  });
}

function readHeaderActionItems(elements, ids = []) {
  return [...elements].map((item, index) => ({
    id: item.getAttribute("data-header-action") ?? ids[index] ?? String(index),
    ariaLabel: item.getAttribute("aria-label"),
    gitQuickActionKind: item.getAttribute("data-git-quick-action-kind"),
    gitQuickActionLabel: item.getAttribute("data-git-quick-action-label"),
    text: readComposedText(item),
    box: readElementBox(item),
    children: [...item.children].map((child) => ({
      ariaLabel: child.getAttribute("aria-label"),
      text: readComposedText(child),
      box: readElementBox(child),
    })),
    textLeaves: [...item.querySelectorAll("x-text, text, span")]
      .filter((leaf) => leaf.querySelector("x-text, text, span") === null && readComposedText(leaf))
      .map((leaf) => ({
        text: readComposedText(leaf),
        box: readElementBox(leaf),
      })),
    icons: [...item.querySelectorAll("x-image, image, img, svg")].map((icon) =>
      readElementBox(icon),
    ),
  }));
}

function readGitPublishDialog(root) {
  const dialog =
    root?.querySelector(
      "[data-slot='dialog-popup'][data-git-publish-dialog='true'], .git-publish-dialog",
    ) ?? null;
  if (!dialog) return null;
  const firstStep = dialog.querySelector("[data-git-publish-step-label]");
  const firstProvider = dialog.querySelector("[data-git-publish-provider]");
  const providerGrid =
    dialog.querySelector("[data-git-publish-providers='true']") ?? firstProvider?.parentElement;
  return {
    rect: readElementBox(dialog),
    title: readComposedText(dialog.querySelector("[data-slot='dialog-title'], .git-publish-title")),
    description: readComposedText(
      dialog.querySelector("[data-slot='dialog-description'], .git-publish-description"),
    ),
    anatomy: {
      header: readElementBox(
        dialog.querySelector("[data-slot='dialog-header'], .git-publish-header"),
      ),
      heading: readElementBox(dialog.querySelector(".git-publish-heading")),
      steps: readElementBox(
        dialog.querySelector("[data-git-publish-step], [data-git-publish-steps]") ??
          firstStep?.parentElement,
      ),
      body: readElementBox(dialog.querySelector("[data-slot='dialog-panel'], .git-publish-body")),
      providerGrid: readElementBox(providerGrid),
      providerLabel: readElementBox(dialog.querySelector(".git-publish-label")),
      footer: readElementBox(
        dialog.querySelector("[data-slot='dialog-footer'], .git-publish-footer"),
      ),
      footerButtons: [
        ...dialog.querySelectorAll(
          "[data-slot='dialog-footer'] button, .git-publish-footer .git-publish-button",
        ),
      ].map((button) => readElementBox(button)),
      title: readElementBox(dialog.querySelector("[data-slot='dialog-title'], .git-publish-title")),
      description: readElementBox(
        dialog.querySelector("[data-slot='dialog-description'], .git-publish-description"),
      ),
    },
    steps: [...dialog.querySelectorAll("[data-git-publish-step-label]")].map((step) => ({
      label: step.getAttribute("data-git-publish-step-label"),
      state: step.getAttribute("data-git-publish-step-state"),
      rect: readElementBox(step),
    })),
    providers: [...dialog.querySelectorAll("[data-git-publish-provider]")].map((provider) => ({
      kind: provider.getAttribute("data-git-publish-provider"),
      ready: provider.getAttribute("data-git-publish-provider-ready") === "true",
      text: readComposedText(provider),
      rect: readElementBox(provider),
    })),
    dismiss: readElementBox(
      root.querySelector(
        "[data-slot='dialog-backdrop'], [aria-label='Dismiss Publish repository']",
      ),
    ),
  };
}

function readComposedText(element) {
  if (!element) return "";
  const text = [];
  const visit = (node) => {
    if (node.nodeType === 3) {
      text.push(node.textContent ?? "");
      return;
    }
    if (node.nodeType !== 1) return;
    for (const child of node.childNodes) visit(child);
    if (node.shadowRoot) {
      for (const child of node.shadowRoot.childNodes) visit(child);
    }
  };
  visit(element);
  return text.join(" ").trim().replace(/\s+/g, " ");
}

function findCommandSearchSurface(panel, input, results) {
  if (!panel || !input || !results) return null;
  const panelRect = panel.getBoundingClientRect();
  const resultsRect = results.getBoundingClientRect();
  let current = input.parentElement;
  while (current && current !== panel) {
    const rect = current.getBoundingClientRect();
    if (
      Math.abs(rect.x - (panelRect.x + 1)) <= 1 &&
      Math.abs(rect.width - (panelRect.width - 2)) <= 1 &&
      Math.abs(rect.y - (panelRect.y + 1)) <= 1 &&
      Math.abs(rect.y + rect.height - resultsRect.y) <= 1
    ) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

function readJsonStringArray(element, attributeName) {
  const serialized = element?.getAttribute(attributeName);
  if (!serialized) return [];
  try {
    const value = JSON.parse(serialized);
    return Array.isArray(value) && value.every((item) => typeof item === "string") ? value : [];
  } catch {
    return [];
  }
}

function readReviewMetrics(root) {
  const rightPanel =
    root?.querySelector("[data-right-panel-open='true']") ??
    root?.querySelector("[data-preview-panel-mode]");
  const emptySurface = root?.querySelector("[data-right-panel-empty-state]");
  const diffSurface = root?.querySelector("[data-review-surface='diff']");
  const codeDiff = diffSurface?.querySelector("[data-review-code-diff], .diff-render-surface");
  const checkpointCards = [...(root?.querySelectorAll("[data-review-checkpoint-card]") ?? [])];
  const trees = [...(root?.querySelectorAll("[data-review-tree]") ?? [])];
  return {
    panelOpen: Boolean(rightPanel),
    panelEmpty: Boolean(emptySurface),
    panelRect: readElementBox(rightPanel),
    emptyRect: readElementBox(emptySurface),
    activeKind:
      rightPanel?.getAttribute("data-right-panel-active-kind") ??
      (diffSurface ? "diff" : emptySurface ? "empty" : null),
    actionKeys: [...(root?.querySelectorAll("[data-right-panel-action]") ?? [])].map((item) =>
      item.getAttribute("data-right-panel-action"),
    ),
    actions: [...(root?.querySelectorAll("[data-right-panel-action]") ?? [])].map((item) => ({
      key: item.getAttribute("data-right-panel-action"),
      text: item.textContent?.trim().replace(/\s+/g, " ") ?? "",
      rect: readElementBox(item),
    })),
    checkpointCards: checkpointCards.map((item) => ({
      status: item.getAttribute("data-review-checkpoint-status"),
      turn:
        item.getAttribute("data-review-checkpoint-turn") ??
        item.getAttribute("data-review-turn-id"),
      fileCount: Number(item.getAttribute("data-review-file-count") ?? "0"),
      expandedState: item.getAttribute("data-changed-files-state"),
      rect: readElementBox(item),
      headerRect: readElementBox(
        item.querySelector(".turn-diff-card__header") ?? item.firstElementChild,
      ),
      toggleRect: readElementBox(
        item.querySelector(".turn-diff-card__toggle") ??
          item.querySelector("button[aria-expanded]"),
      ),
      treeRect: readElementBox(item.querySelector("[data-review-tree]")),
      treeRows: [
        ...(item.querySelectorAll("[data-review-tree] [data-review-file-path]") ?? []),
      ].map((row) => ({
        rect: readElementBox(row),
        child: readElementBox(row.firstElementChild),
        childClassName: row.firstElementChild?.getAttribute("class") ?? null,
      })),
      text: item.textContent?.trim().replace(/\s+/g, " ").slice(0, 240) ?? "",
    })),
    treeCount: trees.length,
    treeFileCounts: trees.map((item) => Number(item.getAttribute("data-review-file-count") ?? "0")),
    diff: diffSurface
      ? {
          surfaceRect: readElementBox(diffSurface),
          subheaderRect: readElementBox(diffSurface.querySelector(".diff-panel-subheader")),
          viewportRect: readElementBox(
            diffSurface.querySelector(".diff-panel-viewport, .diff-panel"),
          ),
          codeDiffRect: readElementBox(codeDiff),
          codeFiles: [...diffSurface.querySelectorAll("[data-review-code-file]")].map((item) => ({
            path: item.getAttribute("data-review-code-file"),
            rect: readElementBox(item),
            headerRect: readElementBox(
              item.querySelector(".diff-code-file__header, [data-diffs-header]"),
            ),
            lineRects: [...item.querySelectorAll("[data-review-code-line]")].map((line) =>
              readElementBox(line),
            ),
          })),
          checkpointCount: Number(diffSurface.getAttribute("data-review-checkpoint-count") ?? "0"),
          selectedTurn: diffSurface.getAttribute("data-review-selected-turn") ?? null,
          fileCount: Number(diffSurface.getAttribute("data-review-file-count") ?? "0"),
          empty: Boolean(diffSurface.querySelector("[data-review-empty-state]")),
          loading: Boolean(diffSurface.querySelector("[data-review-patch-loading]")),
          error: Boolean(diffSurface.querySelector("[data-review-patch-error]")),
          codeDiff: Boolean(codeDiff),
          runtimeBlocker:
            diffSurface
              .querySelector("[data-review-runtime-blocker]")
              ?.getAttribute("data-review-runtime-blocker") ?? null,
          text: readComposedText(diffSurface).slice(0, 480),
          renderedFileTitles: [...diffSurface.querySelectorAll("[data-title]")]
            .map((item) => item.textContent?.trim())
            .filter(Boolean),
          filePaths: [...diffSurface.querySelectorAll("[data-review-file-path]")]
            .map((item) => item.getAttribute("data-review-file-path"))
            .filter(Boolean),
        }
      : null,
  };
}

function readPendingRequestMetrics(root) {
  const approval = root?.querySelector('[data-composer-pending-kind="approval"]');
  const question = root?.querySelector('[data-composer-pending-kind="question"]');
  if (approval) {
    return {
      kind: "approval",
      text: approval.textContent?.trim().replace(/\s+/g, " ") ?? "",
      detail:
        approval.querySelector('[data-approval-detail="complete"]')?.textContent?.trim() ?? null,
      options: [],
    };
  }
  if (question) {
    return {
      kind: "question",
      text: question.textContent?.trim().replace(/\s+/g, " ") ?? "",
      detail: null,
      options: [...question.querySelectorAll("[data-question-option]")].map((item) => ({
        label: item.getAttribute("data-question-option"),
        selected: item.getAttribute("data-question-option-selected") === "true",
      })),
    };
  }
  return null;
}

function readFilesBrowserMetrics(root) {
  const surface = root?.querySelector("[data-file-browser-panel], .files-panel");
  const toolbar = surface?.querySelector("[data-surface-subheader], .files-panel__toolbar");
  const refresh = surface?.querySelector('[aria-label="Refresh workspace files"]');
  const searchInput = surface?.querySelector('[placeholder="Search files"]');
  const search =
    searchInput?.closest(".files-panel__search, [data-slot='input-group']") ?? searchInput;
  const composedElements = [];
  const visit = (node) => {
    for (const child of node?.children ?? []) {
      composedElements.push(child);
      visit(child);
      if (child.shadowRoot) visit(child.shadowRoot);
    }
  };
  visit(surface);
  const shadowRows = composedElements.filter((element) =>
    element.matches?.("button[data-type='item']"),
  );
  const lightRows = [...(surface?.querySelectorAll(".file-tree-row") ?? [])];
  const rows = shadowRows.length > 0 ? shadowRows : lightRows;
  const browser =
    surface?.querySelector(".files-panel__browser") ??
    shadowRows[0]?.getRootNode()?.host ??
    composedElements.find((element) => element.getAttribute("role") === "tree");
  return {
    present: Boolean(surface),
    surface: readElementBox(surface),
    toolbar: readElementBox(toolbar),
    refresh: readElementBox(refresh),
    search: readElementBox(search),
    browser: readElementBox(browser),
    rowCount: rows.length,
    rows: rows.slice(0, 8).map((row) => {
      const name = row.querySelector?.(".file-tree-row__name") ?? null;
      return {
        text:
          row.getAttribute("aria-label") ??
          name?.textContent?.trim() ??
          row.textContent?.trim().replace(/\s+/g, " ") ??
          "",
        box: readElementBox(row),
        name: readElementBox(name),
      };
    }),
  };
}

function readFileEditorMetrics(root) {
  const lynxSurface = root?.querySelector(".file-panel");
  const webBreadcrumbs = root?.querySelector("[data-file-breadcrumbs]");
  const toolbar =
    lynxSurface?.querySelector(".file-panel__toolbar") ??
    webBreadcrumbs?.closest("[data-surface-subheader]");
  const editor =
    lynxSurface?.querySelector(".files-panel__editor") ??
    lynxSurface?.querySelector(".file-editor-preview") ??
    root?.querySelector(".file-preview-virtualizer");
  const editorInner =
    editor?.shadowRoot?.querySelector("textarea") ??
    editor?.querySelector?.("textarea, [data-line]") ??
    null;
  const explorer =
    root?.querySelector("[data-file-browser-panel]") ??
    lynxSurface?.querySelector(".file-panel__explorer") ??
    lynxSurface?.querySelector(".files-panel__browser");
  const tabs = [
    ...(root?.querySelectorAll(
      ".right-panel__tab-list [aria-label], [data-active-tab] [aria-label]",
    ) ?? []),
  ]
    .map((item) => item.getAttribute("aria-label"))
    .filter((label) => label && !label.startsWith("Close "));
  const breadcrumbText = readComposedText(
    lynxSurface?.querySelector(".file-panel__breadcrumbs") ?? webBreadcrumbs,
  )
    .replace(/\s+/g, " ")
    .trim();
  const currentFile =
    lynxSurface?.querySelector(".file-panel__breadcrumb--current")?.textContent?.trim() ??
    webBreadcrumbs?.querySelector("[data-current-file-crumb='true']")?.textContent?.trim() ??
    null;
  return {
    present: Boolean(lynxSurface || webBreadcrumbs),
    surface: readElementBox(
      lynxSurface ??
        webBreadcrumbs?.closest(".flex.min-h-0.flex-1.flex-col.overflow-hidden") ??
        toolbar?.parentElement,
    ),
    toolbar: readElementBox(toolbar),
    breadcrumbs: readElementBox(
      lynxSurface?.querySelector(".file-panel__breadcrumbs") ?? webBreadcrumbs,
    ),
    breadcrumbText,
    currentFile,
    editor: readElementBox(editor),
    editorInner: readElementBox(editorInner),
    editorValueLength:
      typeof editor?.value === "string"
        ? editor.value.length
        : typeof editorInner?.value === "string"
          ? editorInner.value.length
          : readComposedText(editor).length,
    explorer: readElementBox(explorer),
    back: readElementBox(
      lynxSurface?.querySelector('[aria-label="Back to workspace files"]') ??
        root?.querySelector('.right-panel__tab-list [aria-label="Files"]'),
    ),
    statusbar: readElementBox(lynxSurface?.querySelector(".file-panel__statusbar")),
    tabs,
  };
}

const webPane = /** @type {HTMLIFrameElement} */ (document.getElementById("web-pane"));
const lynxPane = /** @type {HTMLIFrameElement} */ (document.getElementById("lynx-pane"));
for (const frame of [webPane, lynxPane]) {
  frame.style.width = `${width}px`;
  frame.style.height = `${height}px`;
  frame.width = String(width);
  frame.height = String(height);
}

// Web pane: the real app served at the ROOT origin, entered through the pairing
// URL so it authorizes against the shared server, then routed to the view.
const webHash = pairingToken ? `#token=${encodeURIComponent(pairingToken)}` : "";
const webEntry = pairingToken ? `/pair${webHash}` : `/`;
webPane.srcdoc = `<!doctype html><script>
localStorage.setItem("t3code:theme", ${JSON.stringify(theme)});
if (${JSON.stringify(requestedSidebarWidth)} !== null) {
  localStorage.setItem(
    "chat_thread_sidebar_width",
    JSON.stringify(${JSON.stringify(requestedSidebarWidth)}),
  );
}
localStorage.setItem(
  "t3code:client-settings:v1",
  JSON.stringify({
    sidebarV2Enabled: true,
    sidebarV2ConfiguredByUser: true,
    environmentIdentificationMode: ${JSON.stringify(environmentIdentificationMode)},
  }),
);
location.replace(${JSON.stringify(webEntry)});
<\/script>`;

// Lynx pane: the compiled bundle with the live transport pointed at the server.
const lynxQuery = new URLSearchParams({
  scenario,
  route: webRoute,
  width: String(width),
  height: String(height),
  theme,
  environmentIdentificationMode,
});
if (requestedSidebarWidth !== null) {
  lynxQuery.set("sidebarWidth", String(requestedSidebarWidth));
}
if (socketUrl) {
  lynxQuery.set("live", "1");
  lynxQuery.set("socket", socketUrl);
}
lynxPane.src = `/lynx/index.html?${lynxQuery.toString()}`;

/** Read the Lynx pane diagnostics hook (single-origin, same as before). */
function readLynxPane() {
  try {
    const win = lynxPane.contentWindow;
    if (!win) return { reachable: false };
    const d = win.__T3_LYNX_WEB_PREVIEW__;
    if (!d) return { reachable: true, present: false };
    const root = win.document?.getElementById("t3-lynx-preview")?.shadowRoot;
    const text = root?.textContent ?? "";
    const heroPresent = Boolean(root?.querySelector(".hero__headline"));
    const paletteElement = root?.querySelector(".palette-panel");
    const paletteMode = paletteElement?.getAttribute("data-search-overlay-mode") ?? null;
    const overlay =
      paletteElement !== null
        ? paletteMode === "files"
          ? "file-picker"
          : "quick-switch"
        : root?.querySelector(".model-picker-panel") !== null
          ? "model-picker"
          : root?.querySelector(".sidebar-v2-scope-popup") !== null
            ? "project-scope"
            : root?.querySelector(".composer-workspace-menu") !== null
              ? "workspace-menu"
              : root?.querySelector(".composer-compact-controls-menu") !== null
                ? "compact-controls"
                : null;
    const overlayElement =
      overlay === "quick-switch" || overlay === "file-picker"
        ? paletteElement
        : overlay === "model-picker"
          ? root?.querySelector(".model-picker-panel")
          : overlay === "project-scope"
            ? root?.querySelector(".sidebar-v2-scope-popup")
            : overlay === "workspace-menu"
              ? root?.querySelector(".composer-workspace-menu")
              : overlay === "compact-controls"
                ? root?.querySelector(".composer-compact-controls-menu")
                : null;
    const overlayRect = overlayElement
      ? (() => {
          const rect = overlayElement.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        })()
      : null;
    const visibleModelLabel =
      root?.querySelector(".composer-toolbar-control--model")?.textContent?.trim() ?? null;
    const activeProjectLabel =
      root?.querySelector(".hero__project-name")?.textContent?.trim() ??
      root?.querySelector("[data-chat-header]")?.textContent?.trim() ??
      null;
    const activeThreadId =
      root?.querySelector('[data-thread-active="true"]')?.getAttribute("data-thread-id") ??
      (!heroPresent && root?.querySelector("[data-chat-header]") ? expectThread : null);
    const modelTriggerElement = root?.querySelector(".composer-toolbar-control--model") ?? null;
    const projectScopeTriggerElement =
      root?.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]') ?? null;
    const workspaceTriggerElement = root?.querySelector(".composer-workspace-control-wrap") ?? null;
    const compactControlsTriggerElement =
      root?.querySelector(".composer-compact-controls-trigger") ?? null;
    const settingsRoute = expectedSemanticRoute.startsWith("settings-");
    const quickSwitchInput = root?.querySelector(".qs-search__input") ?? null;
    const modelPickerInput = root?.querySelector(".picker-search__input") ?? null;
    const modelPickerContent = root?.querySelector(".model-picker-content") ?? null;
    const composerFrame = root?.querySelector(".composer-frame") ?? null;
    const composerEditorHost = root?.querySelector('[data-composer-editor="true"]') ?? null;
    const composerPrimaryAction = root?.querySelector("[data-composer-primary-state]") ?? null;
    const pendingRequestMetrics = readPendingRequestMetrics(root);
    const composerControlElements = [...(root?.querySelectorAll("[data-composer-control]") ?? [])];
    const composerControlBoxElement = (item) =>
      item.matches("button, [role='button']")
        ? item
        : (item.querySelector("button, [role='button'], [data-slot='button']") ?? item);
    const composerControlDetails = (item) => {
      const control = composerControlBoxElement(item);
      return {
        box: readElementBox(control),
        textLeaves: [...control.querySelectorAll("x-text, text, span")]
          .filter(
            (leaf) => leaf.querySelector("x-text, text, span") === null && leaf.textContent?.trim(),
          )
          .map((leaf) => ({
            text: leaf.textContent?.trim() ?? "",
            box: readElementBox(leaf),
          })),
        icons: [...control.querySelectorAll("x-image, image, img, svg")].map((icon) =>
          readElementBox(icon),
        ),
      };
    };
    const lynxInputValue = (element) => element?.shadowRoot?.querySelector("input")?.value ?? "";
    const lynxInputDiagnostics = (element) => {
      const input =
        element?.shadowRoot?.querySelector("input") ??
        element?.shadowRoot?.querySelector("textarea");
      const form = element?.shadowRoot?.querySelector("form");
      if (!input) return null;
      const rect = input.getBoundingClientRect();
      const style = getComputedStyle(input);
      const formStyle = form ? getComputedStyle(form) : null;
      return {
        disabled: input.disabled,
        readOnly: input.readOnly,
        tabIndex: input.tabIndex,
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        formDisplay: formStyle?.display ?? null,
        focused: element?.shadowRoot?.activeElement === input,
        hostAttributes: [...(element?.attributes ?? [])].map((attribute) => [
          attribute.name,
          attribute.value,
        ]),
      };
    };
    const overlayTriggerElement =
      overlay === "project-scope"
        ? projectScopeTriggerElement
        : overlay === "workspace-menu"
          ? workspaceTriggerElement
          : overlay === "compact-controls"
            ? compactControlsTriggerElement
            : modelTriggerElement;
    const modelTriggerRect = overlayTriggerElement
      ? (() => {
          const rect = overlayTriggerElement.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        })()
      : null;
    return {
      reachable: true,
      present: true,
      kind: d.kind,
      dataSource: d.dataSource ?? null,
      scenarioId: d.connector?.scenarioId ?? scenario,
      route: d.connector?.route ?? null,
      connected: d.connector?.connected ?? null,
      semanticReady: d.semanticReady === true,
      rendered: d.rendered === true,
      stageBackdropPresent: d.stageBackdropPresent === true,
      heroPresent,
      activeThreadTitle: d.activeThreadTitle ?? null,
      productState: {
        route: settingsRoute ? (d.connector?.route ?? "/settings/general") : "/",
        semanticRoute: expectedSemanticRoute,
        theme,
        density: "comfortable",
        selectedProject:
          !settingsRoute && expectProject && activeProjectLabel?.includes(expectProject)
            ? expectProject
            : null,
        selectedThread: settingsRoute || heroPresent ? null : activeThreadId,
        selectedModel: null,
        visibleModelLabel,
        lifecycle: d.connector?.connected ? "ready" : "connecting",
        overlay,
        overlayQuery:
          overlay === "quick-switch" || overlay === "file-picker"
            ? lynxInputValue(quickSwitchInput)
            : overlay === "model-picker"
              ? lynxInputValue(modelPickerInput)
              : "",
      },
      overlayMetrics: {
        rect: overlayRect,
        triggerRect: modelTriggerRect,
        anatomy:
          overlay === "quick-switch" || overlay === "file-picker"
            ? {
                panel: readElementBox(root?.querySelector(".palette-panel")),
                search: readElementBox(root?.querySelector(".palette-search")),
                inputHost: readElementBox(quickSwitchInput),
                resultsViewport: readElementBox(root?.querySelector(".qs-results")),
                results: readElementBox(root?.querySelector(".palette-results")),
                section: readElementBox(root?.querySelector(".qs-section")),
                sectionLabel: readElementBox(root?.querySelector(".palette-section-label")),
                row: readElementBox(root?.querySelector(".palette-row")),
                empty: readElementBox(root?.querySelector(".palette-empty")),
                emptyText: readElementBox(root?.querySelector(".palette-empty-text")),
                footer: readElementBox(root?.querySelector(".palette-footer")),
              }
            : overlay === "model-picker"
              ? {
                  panel: readElementBox(root?.querySelector(".model-picker-panel")),
                  panelAncestors: readElementAncestors(
                    root?.querySelector(".model-picker-panel"),
                    8,
                  ),
                  body: readElementBox(root?.querySelector(".model-picker-body")),
                  rail: readElementBox(root?.querySelector(".model-picker-rail")),
                  content: readElementBox(modelPickerContent),
                  search: readElementBox(root?.querySelector(".model-picker-search")),
                  inputHost: readElementBox(modelPickerInput),
                  list: readElementBox(root?.querySelector(".picker-list")),
                  row: readElementBox(root?.querySelector(".model-picker-row")),
                  empty: readElementBox(root?.querySelector(".model-picker-empty")),
                  emptyText: readElementBox(root?.querySelector(".model-picker-empty-text")),
                }
              : overlay === "workspace-menu"
                ? {
                    panel: readElementBox(overlayElement),
                    row: readElementBox(root?.querySelector(".composer-workspace-menu__item")),
                    label: readElementBox(root?.querySelector(".composer-workspace-menu__label")),
                    description: readElementBox(
                      root?.querySelector(".composer-workspace-menu__description"),
                    ),
                  }
                : overlay === "compact-controls"
                  ? {
                      panel: readElementBox(overlayElement),
                      scroll: readElementBox(
                        root?.querySelector(".composer-compact-controls-menu__scroll"),
                      ),
                      content: readElementBox(
                        root?.querySelector(".composer-compact-controls-menu__content"),
                      ),
                      sectionLabel: readElementBox(
                        root?.querySelector(".composer-compact-controls-menu__section-label"),
                      ),
                      row: readElementBox(
                        root?.querySelector(".composer-compact-controls-menu__item"),
                      ),
                      dismiss: readElementBox(
                        root?.querySelector(".composer-compact-controls-dismiss"),
                      ),
                    }
                  : null,
        query:
          overlay === "quick-switch" || overlay === "file-picker"
            ? lynxInputValue(quickSwitchInput)
            : overlay === "model-picker"
              ? lynxInputValue(modelPickerInput)
              : "",
        emptyText:
          overlay === "quick-switch" || overlay === "file-picker"
            ? (root?.querySelector(".palette-empty-text")?.textContent?.trim() ?? null)
            : overlay === "model-picker"
              ? (root?.querySelector(".model-picker-empty-text")?.textContent?.trim() ?? null)
              : null,
        inputDiagnostics:
          overlay === "quick-switch" || overlay === "file-picker"
            ? lynxInputDiagnostics(quickSwitchInput)
            : overlay === "model-picker"
              ? lynxInputDiagnostics(modelPickerInput)
              : null,
        semanticKeys:
          overlay === "model-picker"
            ? readJsonStringArray(modelPickerContent, "data-model-picker-filtered-keys")
            : [],
        selectedModelKey:
          overlay === "model-picker"
            ? (modelPickerContent?.getAttribute("data-model-picker-selected-model") ?? null)
            : null,
        selectedRowKeys:
          overlay === "model-picker"
            ? [...(root?.querySelectorAll('[data-model-picker-selected="true"]') ?? [])].map(
                (item) => item.getAttribute("data-model-picker-key"),
              )
            : [],
        selectedProviderId:
          overlay === "model-picker"
            ? (modelPickerContent?.getAttribute("data-model-picker-selected-provider") ?? null)
            : null,
        navigation:
          overlay === "model-picker"
            ? {
                provider:
                  root
                    ?.querySelector(".model-picker-panel")
                    ?.getAttribute("data-model-picker-navigation-provider") ?? null,
                scopeKey:
                  root
                    ?.querySelector(".model-picker-panel")
                    ?.getAttribute("data-model-picker-navigation-scope") ?? null,
                touched:
                  root
                    ?.querySelector(".model-picker-panel")
                    ?.getAttribute("data-model-picker-navigation-touched") === "true",
              }
            : null,
        providerIds:
          overlay === "model-picker"
            ? [...(root?.querySelectorAll("[data-model-picker-provider]") ?? [])].map((item) =>
                item.getAttribute("data-model-picker-provider"),
              )
            : [],
        providerItems:
          overlay === "model-picker"
            ? [...(root?.querySelectorAll("[data-model-picker-provider]") ?? [])].map((item) => {
                const rect = item.getBoundingClientRect();
                return {
                  id: item.getAttribute("data-model-picker-provider"),
                  active: item.getAttribute("data-model-picker-provider-active") === "true",
                  disabled: item.getAttribute("aria-disabled") === "true",
                  rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                };
              })
            : [],
        rowLabels:
          overlay === "quick-switch" || overlay === "file-picker"
            ? [...(root?.querySelectorAll(".palette-row") ?? [])].map((row) =>
                row.querySelector(".truncate")?.textContent?.trim(),
              )
            : overlay === "model-picker"
              ? [...(root?.querySelectorAll(".model-picker-row") ?? [])].map((row) =>
                  row.querySelector(".model-picker-row-name")?.textContent?.trim(),
                )
              : overlay === "project-scope"
                ? [...(root?.querySelectorAll(".lynx-menu-radio-item") ?? [])].map((row) =>
                    row.textContent?.trim(),
                  )
                : overlay === "workspace-menu"
                  ? [...(root?.querySelectorAll(".composer-workspace-menu__item") ?? [])].map(
                      (row) =>
                        row.querySelector(".composer-workspace-menu__label")?.textContent?.trim(),
                    )
                  : overlay === "compact-controls"
                    ? [
                        ...(root?.querySelectorAll(".composer-compact-controls-menu__item") ?? []),
                      ].map((row) =>
                        row
                          .querySelector(".composer-compact-controls-menu__label")
                          ?.textContent?.trim(),
                      )
                    : [],
        modelPickerRows:
          overlay === "model-picker"
            ? readModelPickerRows(root?.querySelectorAll(".model-picker-row") ?? [])
            : [],
        rowCount:
          overlay === "quick-switch" || overlay === "file-picker"
            ? (root?.querySelectorAll(".palette-row").length ?? 0)
            : overlay === "model-picker"
              ? (root?.querySelectorAll(".model-picker-row").length ?? 0)
              : overlay === "project-scope"
                ? (root?.querySelectorAll(".lynx-menu-radio-item").length ?? 0)
                : overlay === "workspace-menu"
                  ? (root?.querySelectorAll(".composer-workspace-menu__item").length ?? 0)
                  : overlay === "compact-controls"
                    ? (root?.querySelectorAll(".composer-compact-controls-menu__item").length ?? 0)
                    : 0,
      },
      sidebarDiagnostics: {
        stageIdentity: readSidebarStageIdentity(root),
        state:
          root
            ?.querySelector('[data-slot="sidebar-wrapper"]')
            ?.getAttribute("data-sidebar-state") ?? null,
        width: readElementBox(
          root?.querySelector('[data-slot="sidebar-container"]') ??
            root?.querySelector("[data-app-sidebar]"),
        )?.rect.width,
        chrome: {
          sidebar: readElementBox(root?.querySelector("[data-app-sidebar]")),
          resizeRail: readElementBox(root?.querySelector(".sidebar-resize-rail")),
          header: readElementBox(root?.querySelector(".lynx-sidebar-chrome-header")),
          brand: readElementBox(root?.querySelector(".sidebar-brand")),
          footer: readElementBox(root?.querySelector("[data-sidebar='footer']")),
          settingsRow: readElementBox(root?.querySelector(".sidebar-settings-row")),
          settingsAuthority: readElementBox(root?.querySelector(".sidebar-settings-authority")),
          search: readElementBox(root?.querySelector('[aria-label="Search threads"]')),
          projectScopeRow: readElementBox(
            root?.querySelector(".sidebar-v2-project-scope-host")?.parentElement,
          ),
          projectScopeHost: readElementBox(root?.querySelector(".sidebar-v2-project-scope-host")),
          projectScope: readElementBox(
            root?.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]'),
          ),
          newProject: readElementBox(root?.querySelector(".sidebar-v2-new-project")),
        },
        search: (() => {
          const host = root?.querySelector('[aria-label="Search threads"]');
          const dedicatedResults = [
            ...(root?.querySelectorAll(
              '[aria-label="Thread search results"] [data-sidebar-search-result]',
            ) ?? []),
          ];
          const legacyResults = [
            ...(root?.querySelectorAll('[aria-label="Thread search results"] [data-thread-id]') ??
              []),
          ];
          const results = dedicatedResults.length > 0 ? dedicatedResults : legacyResults;
          const rows = readSidebarSearchRows(results);
          return {
            value:
              host?.shadowRoot?.querySelector("input")?.value ??
              host?.value ??
              host?.getAttribute("value") ??
              "",
            resultIds: rows.map((row) => row.id),
            resultTitles: rows.map((row) => row.title),
            rows,
          };
        })(),
        threads: [...(root?.querySelectorAll("[data-thread-id]") ?? [])].map(
          readSidebarThreadMetrics,
        ),
        diffs: [...(root?.querySelectorAll("[data-sidebar-diff='true']") ?? [])].map((item) => ({
          insertions: Number(item.getAttribute("data-sidebar-diff-insertions") ?? "0"),
          deletions: Number(item.getAttribute("data-sidebar-diff-deletions") ?? "0"),
        })),
      },
      composerMetrics: composerFrame
        ? {
            ...(pendingRequestMetrics?.kind === "approval"
              ? {
                  approvalSemanticState: {
                    editorValue: pendingRequestMetrics.detail ?? "",
                    primaryState: "stop",
                  },
                }
              : {}),
            layout: heroPresent ? "hero" : "docked",
            state: composerFrame.getAttribute("data-composer-state"),
            placeholder:
              pendingRequestMetrics?.kind === "approval"
                ? (pendingRequestMetrics.detail ?? null)
                : (root?.querySelector(".composer__placeholder")?.textContent?.trim() ?? null),
            rect: readElementBox(composerFrame),
            editor: {
              value:
                pendingRequestMetrics?.kind === "approval"
                  ? (pendingRequestMetrics.detail ?? "")
                  : (composerEditorHost?.shadowRoot?.querySelector("textarea")?.value ??
                    composerEditorHost?.value ??
                    composerEditorHost?.getAttribute("value") ??
                    ""),
              disabled:
                composerEditorHost?.shadowRoot?.querySelector("textarea")?.disabled ??
                composerEditorHost?.disabled ??
                composerEditorHost?.hasAttribute("disabled") ??
                false,
              rect: readElementBox(
                composerEditorHost?.shadowRoot?.querySelector("textarea") ?? composerEditorHost,
              ),
              diagnostics: lynxInputDiagnostics(composerEditorHost),
              hostDiagnostics: composerEditorHost
                ? {
                    tagName: composerEditorHost.tagName,
                    outerHtml: composerEditorHost.outerHTML?.slice(0, 800) ?? null,
                    shadowChildren: [
                      ...(composerEditorHost.shadowRoot?.querySelectorAll("*") ?? []),
                    ]
                      .slice(0, 12)
                      .map((item) => item.tagName),
                    textareaCandidates: [
                      ...(root?.querySelectorAll("x-textarea, textarea") ?? []),
                    ].map((item) => ({
                      tagName: item.tagName,
                      className: item.getAttribute("class"),
                      attributes: [...item.attributes].map((attribute) => [
                        attribute.name,
                        attribute.value,
                      ]),
                    })),
                  }
                : null,
            },
            primaryState:
              pendingRequestMetrics?.kind === "approval"
                ? "stop"
                : (composerPrimaryAction?.getAttribute("data-composer-primary-state") ?? null),
            controls: composerControlElements.map((item) => ({
              id: item.getAttribute("data-composer-control"),
              label: item.textContent?.trim() ?? "",
            })),
            contextLabels: [...(root?.querySelectorAll(".composer-context-label") ?? [])].map(
              (item) => item.textContent?.trim() ?? "",
            ),
            anatomy: {
              statusBanner: readElementBox(root?.querySelector("[data-composer-settled-banner]")),
              statusCopy: readElementBox(root?.querySelector(".composer-settled-banner__copy")),
              statusTitle: readElementBox(root?.querySelector(".composer-settled-banner__title")),
              statusDescription: readElementBox(
                root?.querySelector(".composer-settled-banner__description"),
              ),
              statusAction: readElementBox(root?.querySelector(".composer-settled-banner__action")),
              surface: readElementBox(root?.querySelector(".composer-surface")),
              approvalBody: readElementBox(root?.querySelector(".composer-approval-body")),
              pending: readElementBox(
                root?.querySelector('[data-composer-pending-kind="approval"]'),
              ),
              detail: readElementBox(root?.querySelector(".composer-pending-approval__detail")),
              editorArea: readElementBox(root?.querySelector(".composer-editor-area")),
              footer: readElementBox(root?.querySelector(".composer-footer")),
              toolbar: readElementBox(root?.querySelector(".composer-toolbar-row")),
              toolbarAllocation: readComposerToolbarAllocation(
                composerControlElements[0]
                  ? composerControlBoxElement(composerControlElements[0])
                  : null,
                root?.querySelector(".composer-primary-actions"),
              ),
              primaryActions: readElementBox(root?.querySelector(".composer-primary-actions")),
              primaryAction: readElementBox(root?.querySelector(".composer-primary-action")),
              controlBoxes: composerControlElements.map((item) => ({
                id: item.getAttribute("data-composer-control"),
                ...composerControlDetails(item),
              })),
              actions: [...(root?.querySelectorAll(".composer-approval-action") ?? [])].map(
                (item) => readElementBox(item),
              ),
              context: readElementBox(root?.querySelector(".composer-context-strip")),
              contextControls: [...(root?.querySelectorAll(".composer-context-control") ?? [])].map(
                (item) => ({
                  text: item.textContent?.trim() ?? "",
                  ...composerControlDetails(item),
                }),
              ),
              contextItems: [...(root?.querySelectorAll(".composer-context-item") ?? [])].map(
                (item) => readElementBox(item),
              ),
              contextLabels: [...(root?.querySelectorAll(".composer-context-label") ?? [])].map(
                (item) => ({
                  text: item.textContent?.trim() ?? "",
                  box: readElementBox(item),
                }),
              ),
              contextIcons: [...(root?.querySelectorAll(".composer-context-icon") ?? [])].map(
                (item) => readElementBox(item),
              ),
              contextBackdrop: readElementBox(root?.querySelector(".composer-context-backdrop")),
              contextAuthority: (() => {
                const image = root?.querySelector(".composer-context-authority-surface");
                return image
                  ? {
                      box: readElementBox(image),
                      src: image.getAttribute("src"),
                      currentSrc: image.currentSrc ?? null,
                      complete: image.complete ?? null,
                      naturalWidth: image.naturalWidth ?? null,
                      naturalHeight: image.naturalHeight ?? null,
                    }
                  : null;
              })(),
              contextBands: [
                ...(root?.querySelectorAll(".composer-context-backdrop-band") ?? []),
              ].map((item) => readElementBox(item)),
            },
          }
        : null,
      timelineMetrics: {
        host: readElementBox(root?.querySelector(".timeline-host")),
        list: readElementBox(root?.querySelector(".timeline-list")),
        empty: readElementBox(root?.querySelector(".transcript-empty")),
        threadSyncLabel: null,
        composerOverlay: readElementBox(root?.querySelector(".composer-overlay")),
        inlineRuns: [
          ...(root?.querySelectorAll(
            ".transcript-user-bubble .md-inline, .transcript-user-bubble .md-inline-code, .transcript-user-bubble .inline-markdown-text, .transcript-user-bubble .inline-markdown-code, .transcript-assistant-row .md-inline, .transcript-assistant-row .md-inline-code, .transcript-assistant-row .inline-markdown-text, .transcript-assistant-row .inline-markdown-code",
          ) ?? []),
        ].map((item) => ({
          className: item.getAttribute("class"),
          text: item.textContent ?? "",
          box: readElementBox(item),
        })),
        anatomy: {
          rowRoot: readElementBox(root?.querySelector(".timeline-row-root")),
          userRow: readElementBox(root?.querySelector(".transcript-user-row")),
          userBubble: readElementBox(root?.querySelector(".transcript-user-bubble")),
          userBody: readElementBox(root?.querySelector(".transcript-user-body")),
          workGroup: readElementBox(root?.querySelector(".transcript-work-group")),
          workEntry: readElementBox(root?.querySelector(".transcript-work-entry")),
          workEntryBody: readElementBox(root?.querySelector(".transcript-work-entry-body")),
          workEntryBodyText: readElementBox(
            root?.querySelector(".transcript-work-entry-body .whitespace-pre-wrap"),
          ),
          workEntryBodyRawText: readElementBox(
            root?.querySelector(".transcript-work-entry-body .whitespace-pre-wrap raw-text"),
          ),
          workEntryBodyLineRects: readTextLineRects(
            root?.querySelector(".transcript-work-entry-body .whitespace-pre-wrap raw-text"),
          ),
          workingRow: readElementBox(root?.querySelector(".transcript-working-row")),
        },
        rows: [...(root?.querySelectorAll("[data-timeline-row-id]") ?? [])]
          .map((item) => ({
            id: item.getAttribute("data-timeline-row-id"),
            kind: item.getAttribute("data-timeline-row-kind"),
            role: item.getAttribute("data-message-role"),
            text: item.getAttribute("data-timeline-row-text") ?? "",
            y: item.getBoundingClientRect().y,
          }))
          .sort((left, right) => left.y - right.y)
          .map(({ y: _y, ...row }) => row),
        rowGeometry: [...(root?.querySelectorAll("[data-timeline-row-id]") ?? [])]
          .map((item) => {
            const geometryOwner = item.closest(".timeline-row-root") ?? item;
            const rect = geometryOwner.getBoundingClientRect();
            const kind = item.getAttribute("data-timeline-row-kind");
            const role = item.getAttribute("data-message-role");
            const content =
              kind === "message" && role === "user"
                ? item.querySelector(".transcript-user-row")
                : kind === "message" && role === "assistant"
                  ? item.querySelector(".transcript-assistant-row")
                  : kind === "work"
                    ? item.querySelector(".transcript-work-group")
                    : kind === "working"
                      ? item.querySelector(".transcript-working-row")
                      : item;
            const contentRect = content.getBoundingClientRect();
            return {
              id: item.getAttribute("data-timeline-row-id"),
              kind,
              role,
              text: item.getAttribute("data-timeline-row-text") ?? "",
              className: geometryOwner.getAttribute("class"),
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              contentHeight: contentRect.height,
              paddingBottom: getComputedStyle(item).paddingBottom,
            };
          })
          .sort((left, right) => left.y - right.y),
        userTextLineRects: readTextLineRects(root?.querySelector(".transcript-user-bubble")),
        assistantGeometry: {
          row: readElementBox(root?.querySelector(".transcript-assistant-row")),
          body: readElementBox(root?.querySelector(".transcript-assistant-row .markdown-body")),
        },
        codeBlocks: [
          ...(root?.querySelectorAll(
            "[data-message-role='assistant'] [data-markdown-code-block='true']",
          ) ?? []),
        ].map((item) => ({
          language: item.getAttribute("data-markdown-code-language") ?? "",
          title: item.getAttribute("data-markdown-code-title") ?? "",
          text:
            item
              .querySelector("[data-markdown-code-content='true'], pre code")
              ?.textContent?.trim() ?? "",
        })),
        codeBlockGeometry: [
          ...(root?.querySelectorAll(
            "[data-message-role='assistant'] [data-markdown-code-block='true']",
          ) ?? []),
        ].map((item) => ({
          rect: readElementBox(item),
          header: readElementBox(item.querySelector("[data-markdown-code-header='true']")),
          content: readElementBox(
            item.querySelector("[data-markdown-code-content='true'], pre code"),
          ),
        })),
        turnFolds: [...(root?.querySelectorAll("[data-transcript-turn-fold]") ?? [])].map(
          (item) => ({
            turnId: item.getAttribute("data-transcript-turn-fold"),
            state: item.getAttribute("data-transcript-turn-fold-state"),
          }),
        ),
        workGroupCount: root?.querySelectorAll(".transcript-work-group").length ?? 0,
        workEntries: [...(root?.querySelectorAll("[data-transcript-work-entry]") ?? [])].map(
          (item) => ({
            id: item.getAttribute("data-transcript-work-entry"),
            tone: item.getAttribute("data-transcript-work-tone"),
            state: item.getAttribute("data-transcript-work-state"),
            detail: item.querySelector(".transcript-work-entry-body")?.textContent?.trim() ?? "",
          }),
        ),
      },
      headerMetrics: {
        root: readElementBox(root?.querySelector("[data-chat-header]")),
        content: readElementBox(root?.querySelector(".topbar__content")),
        project: readElementBox(root?.querySelector(".chat-header-project-group")),
        thread: readElementBox(root?.querySelector(".topbar__thread")),
        actions: readElementBox(root?.querySelector("[data-chat-header-actions]")),
        actionItems: readHeaderActionItems(root?.querySelectorAll("[data-header-action]") ?? []),
      },
      gitPublishDialog: readGitPublishDialog(root),
      reviewMetrics: readReviewMetrics(root),
      filesBrowserMetrics: readFilesBrowserMetrics(root),
      fileEditorMetrics: readFileEditorMetrics(root),
      pendingRequestMetrics,
      settingsMetrics: settingsRoute
        ? (() => {
            const settingsContent = root?.querySelector(".settings-content");
            const settingsPanel =
              root?.querySelector(".settings-content--source-control > .source-control-panel") ??
              root?.querySelector(".settings-panel");
            const settingsRowIds = SETTINGS_ANCHOR_BY_ROUTE[expectedSemanticRoute] ?? [];
            return {
              navigationLabels: [
                ...(root?.querySelectorAll(".settings-nav__item-label") ?? []),
              ].map((item) => item.textContent?.trim()),
              rowIds: settingsRowIds.filter((id) => root?.getElementById(id)),
              rows: readSettingsRows(root, settingsRowIds),
              keybindings:
                expectedSemanticRoute === "settings-keybindings"
                  ? readKeybindingsMetrics(root)
                  : null,
              sectionTitles: [...(root?.querySelectorAll(".settings-section__title") ?? [])].map(
                (item) => item.textContent?.trim(),
              ),
              sectionTexts: [...(root?.querySelectorAll(".settings-section") ?? [])].map(
                (item) => item.textContent?.trim().replace(/\s+/g, " ") ?? "",
              ),
              geometry: {
                root: readElementBox(root?.querySelector(".settings-root")),
                navigation: readElementBox(root?.querySelector(".settings-nav")),
                main: readElementBox(root?.querySelector(".settings-main")),
                content: readElementBox(settingsContent),
                panel: readElementBox(settingsPanel),
                sourceControlEmpty: readElementBox(root?.querySelector(".source-control-empty")),
                panelAncestors: readElementAncestors(settingsPanel),
                sections: [
                  ...(settingsPanel?.querySelectorAll(
                    ":scope > .source-control-section, :scope > .settings-section",
                  ) ?? []),
                ].map((item) => ({
                  title: item.querySelector(".settings-section__title")?.textContent?.trim() ?? "",
                  box: readElementBox(item),
                  rows: readElementBox(item.querySelector(".settings-section__rows")),
                })),
                sourceControlRows: [...(root?.querySelectorAll(".source-control-item") ?? [])].map(
                  (item) => ({
                    text: item.textContent?.trim() ?? "",
                    box: readElementBox(item),
                    children: [...item.children].map((child) => ({
                      className: child.getAttribute("class") ?? "",
                      text: child.textContent?.trim() ?? "",
                      box: readElementBox(child),
                    })),
                  }),
                ),
                settingsRows: [...(root?.querySelectorAll(".settings-row") ?? [])].map((item) => ({
                  title: item.querySelector(".settings-row__title")?.textContent?.trim() ?? "",
                  box: readElementBox(item),
                  children: [...item.children].map((child) => ({
                    className: child.getAttribute("class") ?? "",
                    text: child.textContent?.trim() ?? "",
                    box: readElementBox(child),
                  })),
                })),
                loadingRows: [
                  ...(root?.querySelectorAll("[data-source-control-loading-row]") ?? []),
                ].map((item) => ({
                  id: item.getAttribute("data-source-control-loading-row"),
                  box: readElementBox(item),
                })),
              },
              sourceControlRows: [...(root?.querySelectorAll(".source-control-item") ?? [])].map(
                (item) => item.textContent?.trim(),
              ),
              emptyTexts: [...(root?.querySelectorAll(".settings-empty__text") ?? [])].map((item) =>
                item.textContent?.trim(),
              ),
              errorTexts: [...(root?.querySelectorAll("[data-source-control-error]") ?? [])].map(
                (item) => item.textContent?.trim(),
              ),
              sourceControlEmptyTitles: [
                ...(root?.querySelectorAll(".source-control-empty__title") ?? []),
              ].map((item) => item.textContent?.trim()),
              sourceControlRetryLabels: [
                ...(root?.querySelectorAll("[data-source-control-retry]") ?? []),
              ]
                .map((item) => item.textContent?.trim())
                .filter((label) => label === "Scan" || label === "Rescan"),
              loading:
                (root?.querySelectorAll("[data-source-control-loading-row]") ?? []).length > 0,
              hostSlotTitles: [...(root?.querySelectorAll(".settings-row:not([id])") ?? [])].map(
                (item) => item.querySelector(".settings-row__title")?.textContent?.trim(),
              ),
            };
          })()
        : null,
      rendererErrors: d.rendererErrors ?? [],
      nativeModuleCalls: d.nativeModuleCalls ?? [],
      connectorDiagnostics: d.connector ?? null,
      geometry: typeof d.measureGeometry === "function" ? d.measureGeometry() : null,
    };
  } catch (error) {
    return { reachable: false, error: String(error) };
  }
}

/**
 * The real Web app exposes no diagnostics hook, so readiness is derived from
 * its DOM: it is ready when the seeded project title is visible (i.e. it
 * connected to the shared server and rendered populated state) and it is no
 * longer showing a connecting placeholder.
 */
function readWebPane() {
  try {
    const doc = webPane.contentWindow?.document;
    if (!doc || !doc.body) return { reachable: true, present: false };
    const text = doc.body.innerText ?? "";
    const rendered = text.trim().length > 0;
    const connecting = /Connecting to T3 Code|Reconnecting/i.test(text);
    const heroPresent = Boolean(doc.querySelector(".hero__headline"));
    const chatShellReady =
      Boolean(
        heroPresent
          ? doc.querySelector('[data-chat-provider-model-picker="true"]')
          : doc.querySelector("[data-chat-header]"),
      ) && !connecting;
    const settingsReady =
      expectedSemanticRoute.startsWith("settings-") &&
      Boolean(doc.querySelector(".settings-root")) &&
      !connecting;
    const connected = settingsReady || chatShellReady;
    const resolvedTheme = doc.documentElement.classList.contains("dark") ? "dark" : "light";
    const literalRoute = webPane.contentWindow?.location.pathname ?? "/";
    const visibleModelLabel =
      doc.querySelector('[data-chat-provider-model-picker="true"]')?.textContent?.trim() ?? null;
    const activeProjectLabel =
      doc.querySelector('[aria-label="Change project"]')?.textContent?.trim() ??
      doc.querySelector("[data-chat-header]")?.textContent?.trim() ??
      null;
    const routeThreadId = /^\/[^/]+\/([^/]+)$/.exec(literalRoute)?.[1] ?? null;
    const activeThreadId =
      doc.querySelector('[data-thread-active="true"]')?.getAttribute("data-thread-id") ??
      routeThreadId;
    const settingsRoute = expectedSemanticRoute.startsWith("settings-");
    const commandPaletteElement = doc.querySelector('[data-command-palette="true"]');
    const commandPaletteMode =
      commandPaletteElement?.getAttribute("data-search-overlay-mode") ??
      commandPaletteElement?.getAttribute("data-palette-mode") ??
      null;
    const overlay =
      commandPaletteElement !== null
        ? commandPaletteMode === "files"
          ? "file-picker"
          : "quick-switch"
        : doc.querySelector("[data-model-picker-content]") !== null
          ? "model-picker"
          : doc.querySelector(".sidebar-v2-scope-popup") !== null
            ? "project-scope"
            : doc.querySelector('[data-floating-popup="composer-workspace-menu"]') !== null
              ? "workspace-menu"
              : doc.querySelector('[data-floating-popup="composer-compact-controls-menu"]') !== null
                ? "compact-controls"
                : null;
    const modelTriggerElement =
      doc.querySelector('[data-chat-provider-model-picker="true"]') ?? null;
    const projectScopeTriggerElement =
      doc.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]') ?? null;
    const workspaceTriggerElement =
      doc.querySelector('[data-floating-anchor="composer-workspace-menu"]') ?? null;
    const compactControlsTriggerElement =
      doc.querySelector('[data-floating-anchor="composer-compact-controls-menu"]') ?? null;
    const quickSwitchTriggerElement =
      doc.querySelector(".sidebar-v2-search") ??
      doc.querySelector('[data-testid="command-palette-trigger"]') ??
      doc.querySelector('[aria-label="Search threads and commands"]') ??
      null;
    const overlayTriggerElement =
      overlay === "project-scope"
        ? projectScopeTriggerElement
        : overlay === "workspace-menu"
          ? workspaceTriggerElement
          : overlay === "compact-controls"
            ? compactControlsTriggerElement
            : modelTriggerElement;
    const modelTriggerRect = overlayTriggerElement
      ? (() => {
          const rect = overlayTriggerElement.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        })()
      : null;
    const overlayElement =
      overlay === "quick-switch" || overlay === "file-picker"
        ? commandPaletteElement
        : overlay === "model-picker"
          ? doc.querySelector("[data-model-picker-content]")
          : overlay === "project-scope"
            ? doc.querySelector(".sidebar-v2-scope-popup")
            : overlay === "workspace-menu"
              ? doc.querySelector('[data-floating-popup="composer-workspace-menu"]')
              : overlay === "compact-controls"
                ? doc.querySelector('[data-floating-popup="composer-compact-controls-menu"]')
                : null;
    const overlayRect = overlayElement
      ? (() => {
          const rect = overlayElement.getBoundingClientRect();
          return {
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
          };
        })()
      : null;
    const modelPickerContent =
      overlay === "model-picker" ? doc.querySelector("[data-model-picker-content]") : null;
    const commandInput = commandPaletteElement?.querySelector('[data-slot="autocomplete-input"]');
    const commandResults =
      commandPaletteElement?.querySelector('[data-slot="command-list"]') ??
      commandPaletteElement?.querySelector(".palette-empty")?.parentElement;
    const composerFrame = doc.querySelector(".composer-frame");
    const composerEditor = doc.querySelector('[data-composer-editor="true"]');
    const composerPrimaryAction = doc.querySelector("[data-composer-primary-state]");
    const composerControlElements = [...doc.querySelectorAll("[data-composer-control]")];
    const composerControlBoxElement = (item) =>
      item.matches("button, [role='button']")
        ? item
        : (item.querySelector("button, [role='button'], [data-slot='button']") ?? item);
    const composerControlDetails = (item) => {
      const control = composerControlBoxElement(item);
      return {
        box: readElementBox(control),
        textLeaves: [...control.querySelectorAll("x-text, text, span")]
          .filter(
            (leaf) => leaf.querySelector("x-text, text, span") === null && leaf.textContent?.trim(),
          )
          .map((leaf) => ({
            text: leaf.textContent?.trim() ?? "",
            box: readElementBox(leaf),
          })),
        icons: [...control.querySelectorAll("x-image, image, img, svg")].map((icon) =>
          readElementBox(icon),
        ),
      };
    };
    return {
      reachable: true,
      present: true,
      rendered,
      connected,
      semanticReady: connected && !connecting,
      heroPresent,
      literalRoute,
      productState: {
        route: settingsRoute ? literalRoute : "/",
        semanticRoute: expectedSemanticRoute,
        theme: resolvedTheme,
        density: "comfortable",
        selectedProject:
          !settingsRoute && expectProject && activeProjectLabel?.includes(expectProject)
            ? expectProject
            : null,
        selectedThread: settingsRoute || heroPresent ? null : activeThreadId,
        selectedModel: null,
        visibleModelLabel,
        lifecycle: connected && !connecting ? "ready" : connecting ? "connecting" : "error",
        overlay,
        overlayQuery:
          overlay === "quick-switch" || overlay === "file-picker"
            ? (doc.querySelector('[data-command-palette="true"] [data-slot="autocomplete-input"]')
                ?.value ?? "")
            : overlay === "model-picker"
              ? (doc.querySelector('[data-model-picker-content] [data-slot="combobox-input"]')
                  ?.value ?? "")
              : "",
      },
      overlayMetrics: {
        rect: overlayRect,
        triggerRect: modelTriggerRect,
        query:
          overlay === "quick-switch" || overlay === "file-picker"
            ? (doc.querySelector('[data-command-palette="true"] [data-slot="autocomplete-input"]')
                ?.value ?? "")
            : overlay === "model-picker"
              ? (doc.querySelector('[data-model-picker-content] [data-slot="combobox-input"]')
                  ?.value ?? "")
              : "",
        emptyText:
          overlay === "quick-switch" || overlay === "file-picker"
            ? (doc
                .querySelector('[data-command-palette="true"] .palette-empty-text')
                ?.textContent?.trim() ??
              doc
                .querySelector('[data-command-palette="true"] [data-slot="command-empty"]')
                ?.textContent?.trim() ??
              null)
            : overlay === "model-picker"
              ? (doc
                  .querySelector('[data-model-picker-content] [data-slot="combobox-empty"]')
                  ?.textContent?.trim() ?? null)
              : null,
        semanticKeys:
          overlay === "model-picker"
            ? readJsonStringArray(modelPickerContent, "data-model-picker-filtered-keys")
            : [],
        selectedModelKey:
          overlay === "model-picker"
            ? (modelPickerContent?.getAttribute("data-model-picker-selected-model") ?? null)
            : null,
        selectedRowKeys:
          overlay === "model-picker"
            ? [...doc.querySelectorAll('[data-model-picker-selected="true"]')].map((item) =>
                item.getAttribute("data-model-picker-key"),
              )
            : [],
        selectedProviderId:
          overlay === "model-picker"
            ? (modelPickerContent?.getAttribute("data-model-picker-selected-provider") ?? null)
            : null,
        providerIds:
          overlay === "model-picker"
            ? [...doc.querySelectorAll("[data-model-picker-provider]")].map((item) =>
                item.getAttribute("data-model-picker-provider"),
              )
            : [],
        providerItems:
          overlay === "model-picker"
            ? [...doc.querySelectorAll("[data-model-picker-provider]")].map((item) => {
                const button = item.matches("button") ? item : item.querySelector("button");
                const rect = (button ?? item).getBoundingClientRect();
                return {
                  id: item.getAttribute("data-model-picker-provider"),
                  active:
                    item.getAttribute("data-model-picker-provider-active") === "true" ||
                    item.getAttribute("data-model-picker-provider") ===
                      modelPickerContent?.getAttribute("data-model-picker-selected-provider"),
                  disabled: Boolean(button?.disabled),
                  rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
                };
              })
            : [],
        anatomy:
          overlay === "model-picker"
            ? {
                panel: readElementBox(modelPickerContent),
                body: readElementBox(modelPickerContent),
                rail: readElementBox(
                  modelPickerContent?.querySelector("[data-model-picker-sidebar]"),
                ),
                content: readElementBox(
                  modelPickerContent?.querySelector('[data-slot="combobox-root"]') ??
                    modelPickerContent?.querySelector('[data-slot="combobox-list"]')?.parentElement
                      ?.parentElement,
                ),
                search: readElementBox(
                  modelPickerContent
                    ?.querySelector('[data-slot="combobox-input"]')
                    ?.closest(".px-2"),
                ),
                input: readElementBox(
                  modelPickerContent?.querySelector('[data-slot="combobox-input"]'),
                ),
                list: readElementBox(modelPickerContent?.querySelector(".model-picker-list")),
                row: readElementBox(
                  modelPickerContent?.querySelector('[data-slot="combobox-item"]'),
                ),
                empty: readElementBox(modelPickerContent?.querySelector(".model-picker-empty")),
                emptyText: readElementBox(
                  modelPickerContent?.querySelector(".model-picker-empty-text"),
                ),
              }
            : overlay === "quick-switch" || overlay === "file-picker"
              ? {
                  panel: readElementBox(overlayElement),
                  search: readElementBox(
                    findCommandSearchSurface(overlayElement, commandInput, commandResults),
                  ),
                  input: readElementBox(commandInput),
                  results: readElementBox(commandResults),
                  list: readElementBox(
                    doc.querySelector(
                      '[data-command-palette="true"] [data-slot="autocomplete-list"]',
                    ),
                  ),
                  section: readElementBox(
                    doc.querySelector('[data-command-palette="true"] [data-slot="command-group"]'),
                  ),
                  sectionLabel: readElementBox(
                    doc.querySelector(
                      '[data-command-palette="true"] [data-slot="command-group-label"]',
                    ),
                  ),
                  row: readElementBox(
                    doc.querySelector('[data-command-palette="true"] [role="option"]'),
                  ),
                  empty: readElementBox(
                    doc.querySelector('[data-command-palette="true"] .palette-empty'),
                  ),
                  emptyText: readElementBox(
                    doc.querySelector('[data-command-palette="true"] .palette-empty-text'),
                  ),
                  footer: readElementBox(
                    doc.querySelector('[data-command-palette="true"] [data-slot="command-footer"]'),
                  ),
                }
              : overlay === "workspace-menu"
                ? {
                    panel: readElementBox(overlayElement),
                    row: readElementBox(overlayElement?.querySelector('[data-slot="select-item"]')),
                    label: readElementBox(
                      overlayElement?.querySelector('[data-slot="select-item-text"]'),
                    ),
                    description: null,
                  }
                : overlay === "compact-controls"
                  ? {
                      panel: readElementBox(overlayElement),
                      scroll: readElementBox(overlayElement?.firstElementChild),
                      content: readElementBox(overlayElement?.firstElementChild),
                      sectionLabel: readElementBox(
                        overlayElement?.querySelector('[data-slot="menu-label"]'),
                      ),
                      row: readElementBox(
                        overlayElement?.querySelector('[data-slot="menu-radio-item"]'),
                      ),
                      dismiss: null,
                    }
                  : null,
        rowLabels:
          overlay === "quick-switch" || overlay === "file-picker"
            ? [...doc.querySelectorAll('[data-command-palette="true"] [role="option"]')].map(
                (row) => row.querySelector(".truncate")?.textContent?.trim(),
              )
            : overlay === "model-picker"
              ? [
                  ...doc.querySelectorAll(
                    '[data-model-picker-content] [data-slot="combobox-item"]',
                  ),
                ].map((row) => row.querySelector(".model-picker-row-name")?.textContent?.trim())
              : overlay === "project-scope"
                ? [
                    ...doc.querySelectorAll(
                      '.sidebar-v2-scope-popup [data-slot="menu-radio-item"]',
                    ),
                  ].map((row) => row.textContent?.trim())
                : overlay === "workspace-menu"
                  ? [
                      ...doc.querySelectorAll(
                        '[data-floating-popup="composer-workspace-menu"] [data-slot="select-item"]',
                      ),
                    ].map((row) => row.textContent?.trim())
                  : overlay === "compact-controls"
                    ? [
                        ...doc.querySelectorAll(
                          '[data-floating-popup="composer-compact-controls-menu"] [data-slot="menu-radio-item"]',
                        ),
                      ].map((row) => row.textContent?.trim())
                    : [],
        modelPickerRows:
          overlay === "model-picker"
            ? readModelPickerRows(
                doc.querySelectorAll('[data-model-picker-content] [data-slot="combobox-item"]'),
              )
            : [],
        rowCount:
          overlay === "quick-switch" || overlay === "file-picker"
            ? doc.querySelectorAll('[data-command-palette="true"] [role="option"]').length
            : overlay === "model-picker"
              ? doc.querySelectorAll('[data-model-picker-content] [data-slot="combobox-item"]')
                  .length
              : overlay === "project-scope"
                ? doc.querySelectorAll('.sidebar-v2-scope-popup [data-slot="menu-radio-item"]')
                    .length
                : overlay === "workspace-menu"
                  ? doc.querySelectorAll(
                      '[data-floating-popup="composer-workspace-menu"] [data-slot="select-item"]',
                    ).length
                  : overlay === "compact-controls"
                    ? doc.querySelectorAll(
                        '[data-floating-popup="composer-compact-controls-menu"] [data-slot="menu-radio-item"]',
                      ).length
                    : 0,
      },
      composerMetrics: composerFrame
        ? {
            layout: heroPresent ? "hero" : "docked",
            state: composerFrame.getAttribute("data-composer-state"),
            placeholder:
              (composerEditor?.value ?? composerEditor?.textContent ?? "").length === 0
                ? (composerEditor?.getAttribute("aria-placeholder") ?? null)
                : null,
            rect: readElementBox(composerFrame),
            editor: {
              value: composerEditor?.value ?? composerEditor?.textContent ?? "",
              disabled:
                composerEditor?.getAttribute("contenteditable") === "false" ||
                composerEditor?.hasAttribute("disabled"),
              rect: readElementBox(composerEditor),
            },
            primaryState:
              composerPrimaryAction?.getAttribute("data-composer-primary-state") ?? null,
            controls: composerControlElements.map((item) => ({
              id: item.getAttribute("data-composer-control"),
              label: item.textContent?.trim() ?? "",
            })),
            contextLabels: (() => {
              const frameBottom = composerFrame?.getBoundingClientRect().bottom ?? 0;
              return [...doc.querySelectorAll("button, span")]
                .filter((item) => {
                  const rect = item.getBoundingClientRect();
                  const text = item.textContent?.trim() ?? "";
                  return (
                    (text === "Local checkout" ||
                      text === "Worktree" ||
                      item.tagName === "BUTTON") &&
                    rect.y >= frameBottom - 20 &&
                    rect.y < frameBottom + 64 &&
                    rect.x >= composerFrame.getBoundingClientRect().x &&
                    rect.x + rect.width <= composerFrame.getBoundingClientRect().right
                  );
                })
                .map((item) => item.textContent?.trim() ?? "")
                .filter(Boolean);
            })(),
            anatomy: {
              statusBanner: readElementBox(
                [...doc.querySelectorAll('[data-slot="alert"]')].find((item) =>
                  item.textContent?.includes("This thread is settled"),
                ),
              ),
              statusCopy: readElementBox(
                [...doc.querySelectorAll('[data-slot="alert-title"]')].find((item) =>
                  item.textContent?.includes("This thread is settled"),
                )?.parentElement,
              ),
              statusTitle: readElementBox(
                [...doc.querySelectorAll('[data-slot="alert-title"]')].find((item) =>
                  item.textContent?.includes("This thread is settled"),
                ),
              ),
              statusDescription: readElementBox(
                [...doc.querySelectorAll('[data-slot="alert-description"]')].find((item) =>
                  item.textContent?.includes(
                    "Sending a message moves it back to Active in the sidebar.",
                  ),
                ),
              ),
              statusAction: readElementBox(
                [...doc.querySelectorAll('[data-slot="alert-action"]')].find((item) =>
                  item.textContent?.includes("Un-settle"),
                ),
              ),
              surface: readElementBox(doc.querySelector(".composer-surface")),
              approvalBody: readElementBox(doc.querySelector(".composer-approval-body")),
              pending: readElementBox(doc.querySelector('[data-composer-pending-kind="approval"]')),
              detail: readElementBox(doc.querySelector(".composer-pending-approval__detail")),
              editorArea: readElementBox(doc.querySelector(".composer-editor-area")),
              footer: readElementBox(doc.querySelector(".composer-footer")),
              toolbar: readElementBox(doc.querySelector(".composer-toolbar-row")),
              toolbarAllocation: readComposerToolbarAllocation(
                composerControlElements[0]
                  ? composerControlBoxElement(composerControlElements[0])
                  : null,
                doc.querySelector(".composer-primary-actions"),
              ),
              primaryActions: readElementBox(doc.querySelector(".composer-primary-actions")),
              primaryAction: readElementBox(doc.querySelector(".composer-primary-action")),
              controlBoxes: composerControlElements.map((item) => ({
                id: item.getAttribute("data-composer-control"),
                ...composerControlDetails(item),
              })),
              actions: [...doc.querySelectorAll(".composer-approval-action")].map((item) =>
                readElementBox(item),
              ),
              context: readElementBox(
                doc.querySelector(".composer-context-strip") ??
                  doc.querySelector(".chat-composer-context-strip"),
              ),
              contextControls: (() => {
                const contextStrip =
                  doc.querySelector(".composer-context-strip") ??
                  doc.querySelector(".chat-composer-context-strip");
                return [...(contextStrip?.querySelectorAll("button") ?? [])].map((item) => ({
                  text: item.textContent?.trim() ?? "",
                  ...composerControlDetails(item),
                }));
              })(),
              contextItems: [...doc.querySelectorAll(".composer-context-item")].map((item) =>
                readElementBox(item),
              ),
              contextLabels: [...doc.querySelectorAll(".composer-context-label")].map((item) => ({
                text: item.textContent?.trim() ?? "",
                box: readElementBox(item),
              })),
              contextIcons: [...doc.querySelectorAll(".composer-context-icon")].map((item) =>
                readElementBox(item),
              ),
              contextBackdrop: null,
              contextBands: [],
            },
          }
        : null,
      timelineMetrics: {
        host: readElementBox(doc.querySelector("[data-chat-messages]")),
        list: readElementBox(doc.querySelector("[data-chat-messages]")),
        empty: readElementBox(
          doc.querySelector(".transcript-empty") ??
            [...doc.querySelectorAll("[data-chat-messages] p")].find(
              (item) => item.textContent?.trim() === "Send a message to start the conversation.",
            ),
        ),
        threadSyncLabel:
          [...doc.querySelectorAll('[role="status"]')]
            .map((item) => item.textContent?.trim() ?? "")
            .find((label) => label === "Loading messages..." || label === "Syncing messages...") ??
          null,
        composerOverlay: readElementBox(doc.querySelector("[data-chat-composer-overlay]")),
        inlineRuns: [
          ...doc.querySelectorAll(
            ".transcript-user-bubble p, .transcript-user-bubble code, .transcript-assistant-row p, .transcript-assistant-row code",
          ),
        ].map((item) => ({
          className: item.getAttribute("class"),
          text: item.textContent ?? "",
          box: readElementBox(item),
        })),
        anatomy: {
          rowRoot: readElementBox(doc.querySelector("[data-timeline-root]")),
          userRow: readElementBox(doc.querySelector(".transcript-user-row")),
          userBubble: readElementBox(doc.querySelector(".transcript-user-bubble")),
          userBody: readElementBox(doc.querySelector(".transcript-user-body")),
          workGroup: readElementBox(doc.querySelector(".transcript-work-group")),
          workEntry: readElementBox(doc.querySelector(".transcript-work-entry")),
          workEntryBody: readElementBox(doc.querySelector(".transcript-work-entry-body")),
          workEntryBodyText: readElementBox(
            doc.querySelector(".transcript-work-entry-body .whitespace-pre-wrap"),
          ),
          workEntryBodyRawText: readElementBox(
            doc.querySelector(".transcript-work-entry-body .whitespace-pre-wrap raw-text"),
          ),
          workEntryBodyLineRects: readTextLineRects(
            doc.querySelector(".transcript-work-entry-body .whitespace-pre-wrap"),
          ),
          workingRow: readElementBox(doc.querySelector(".transcript-working-row")),
        },
        rows: [...doc.querySelectorAll("[data-timeline-row-id]")]
          .map((item) => ({
            id: item.getAttribute("data-timeline-row-id"),
            kind: item.getAttribute("data-timeline-row-kind"),
            role: item.getAttribute("data-message-role"),
            text: item.getAttribute("data-timeline-row-text") ?? "",
            y: item.getBoundingClientRect().y,
          }))
          .sort((left, right) => left.y - right.y)
          .map(({ y: _y, ...row }) => row),
        rowGeometry: [...doc.querySelectorAll("[data-timeline-row-id]")]
          .map((item) => {
            const rect = item.getBoundingClientRect();
            const kind = item.getAttribute("data-timeline-row-kind");
            const role = item.getAttribute("data-message-role");
            const content =
              kind === "message" && role === "user"
                ? item.querySelector(".transcript-user-row")
                : kind === "message" && role === "assistant"
                  ? item.querySelector(".transcript-assistant-row")
                  : kind === "work"
                    ? item.querySelector(".transcript-work-group")
                    : kind === "working"
                      ? item.querySelector(".transcript-working-row")
                      : item;
            const contentRect = content.getBoundingClientRect();
            return {
              id: item.getAttribute("data-timeline-row-id"),
              kind,
              role,
              text: item.getAttribute("data-timeline-row-text") ?? "",
              className: item.getAttribute("class"),
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              contentHeight: contentRect.height,
              paddingBottom: getComputedStyle(item).paddingBottom,
            };
          })
          .sort((left, right) => left.y - right.y),
        userTextLineRects: readTextLineRects(doc.querySelector(".transcript-user-bubble")),
        assistantGeometry: {
          row: readElementBox(doc.querySelector(".transcript-assistant-row")),
          body: readElementBox(doc.querySelector(".transcript-assistant-row .chat-markdown")),
        },
        codeBlocks: [
          ...doc.querySelectorAll(
            "[data-message-role='assistant'] [data-markdown-code-block='true']",
          ),
        ].map((item) => ({
          language: item.getAttribute("data-markdown-code-language") ?? "",
          title: item.getAttribute("data-markdown-code-title") ?? "",
          text:
            item
              .querySelector("[data-markdown-code-content='true'], pre code")
              ?.textContent?.trim() ?? "",
        })),
        codeBlockGeometry: [
          ...doc.querySelectorAll(
            "[data-message-role='assistant'] [data-markdown-code-block='true']",
          ),
        ].map((item) => ({
          rect: readElementBox(item),
          header: readElementBox(item.querySelector("[data-markdown-code-header='true']")),
          content: readElementBox(
            item.querySelector("[data-markdown-code-content='true'], pre code"),
          ),
        })),
        turnFolds: [...doc.querySelectorAll("[data-transcript-turn-fold]")].map((item) => ({
          turnId: item.getAttribute("data-transcript-turn-fold"),
          state: item.getAttribute("data-transcript-turn-fold-state"),
        })),
        workGroupCount: doc.querySelectorAll(".transcript-work-group").length,
        workEntries: [...doc.querySelectorAll("[data-transcript-work-entry]")].map((item) => ({
          id: item.getAttribute("data-transcript-work-entry"),
          tone: item.getAttribute("data-transcript-work-tone"),
          state: item.getAttribute("data-transcript-work-state"),
          detail: item.querySelector(".transcript-work-entry-body")?.textContent?.trim() ?? "",
        })),
      },
      headerMetrics: {
        root: readElementBox(doc.querySelector("[data-chat-header]")),
        content: readElementBox(doc.querySelector(".topbar__content")),
        project: readElementBox(doc.querySelector(".chat-header-project-group")),
        thread: readElementBox(doc.querySelector(".topbar__thread")),
        actions: readElementBox(doc.querySelector("[data-chat-header-actions]")),
        actionItems: readHeaderActionItems(doc.querySelectorAll("[data-chat-header-actions] > *"), [
          "add",
          "open",
          "commit",
        ]),
      },
      gitPublishDialog: readGitPublishDialog(doc),
      reviewMetrics: readReviewMetrics(doc),
      filesBrowserMetrics: readFilesBrowserMetrics(doc),
      fileEditorMetrics: readFileEditorMetrics(doc),
      pendingRequestMetrics: readPendingRequestMetrics(doc),
      sidebarDiagnostics: {
        stageIdentity: readSidebarStageIdentity(doc),
        state:
          doc.querySelector('[data-slot="sidebar-wrapper"]')?.getAttribute("data-sidebar-state") ??
          null,
        width: readElementBox(
          doc.querySelector('[data-slot="sidebar-container"]') ??
            doc.querySelector("[data-app-sidebar]"),
        )?.rect.width,
        chrome: {
          sidebar: readElementBox(doc.querySelector("[data-app-sidebar]")),
          resizeRail: readElementBox(doc.querySelector(".sidebar-resize-rail")),
          header: readElementBox(doc.querySelector(".lynx-sidebar-chrome-header")),
          brand: readElementBox(doc.querySelector(".sidebar-brand")),
          footer: readElementBox(doc.querySelector("[data-sidebar='footer']")),
          settingsRow: readElementBox(doc.querySelector(".sidebar-settings-row")),
          settingsAuthority: readElementBox(doc.querySelector(".sidebar-settings-authority")),
          search: readElementBox(doc.querySelector('[aria-label="Search threads"]')),
          projectScopeRow: readElementBox(
            doc.querySelector(".sidebar-v2-project-scope-host")?.parentElement,
          ),
          projectScopeHost: readElementBox(doc.querySelector(".sidebar-v2-project-scope-host")),
          projectScope: readElementBox(
            doc.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]'),
          ),
          newProject: readElementBox(doc.querySelector(".sidebar-v2-new-project")),
        },
        search: (() => {
          const input = doc.querySelector('[aria-label="Search threads"]');
          const rows = readSidebarSearchRows(
            doc.querySelectorAll('[aria-label="Thread search results"] [role="option"]'),
          );
          return {
            value: input?.value ?? input?.getAttribute("value") ?? "",
            resultIds: rows.map((row) => row.id),
            resultTitles: rows.map((row) => row.title),
            rows,
          };
        })(),
        threads: [...doc.querySelectorAll("[data-thread-id]")].map(readSidebarThreadMetrics),
        diffs: [...doc.querySelectorAll("[data-sidebar-diff='true']")].map((item) => ({
          insertions: Number(item.getAttribute("data-sidebar-diff-insertions") ?? "0"),
          deletions: Number(item.getAttribute("data-sidebar-diff-deletions") ?? "0"),
        })),
      },
      projectScopeDiagnostics: {
        triggerRect: projectScopeTriggerElement
          ? (() => {
              const rect = projectScopeTriggerElement.getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            })()
          : null,
        triggerExpanded: projectScopeTriggerElement?.getAttribute("aria-expanded") ?? null,
        popupClasses: [...doc.querySelectorAll('[data-slot="menu-popup"]')].map(
          (popup) => popup.className,
        ),
        radioLabels: [...doc.querySelectorAll('[data-slot="menu-radio-item"]')].map((item) =>
          item.textContent?.trim(),
        ),
      },
      quickSwitchDiagnostics: {
        triggerRect: quickSwitchTriggerElement
          ? (() => {
              const rect = quickSwitchTriggerElement.getBoundingClientRect();
              return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
            })()
          : null,
        tagName: quickSwitchTriggerElement?.tagName ?? null,
        ariaExpanded: quickSwitchTriggerElement?.getAttribute("aria-expanded") ?? null,
        dataState: quickSwitchTriggerElement?.getAttribute("data-state") ?? null,
        outerHtml: quickSwitchTriggerElement?.outerHTML?.slice(0, 800) ?? null,
        popupCount: doc.querySelectorAll('[data-slot="command-dialog-popup"]').length,
        searchCandidates: [...doc.querySelectorAll("button, [role=button], [data-sidebar]")]
          .filter((element) => element.textContent?.trim().startsWith("Search"))
          .slice(0, 8)
          .map((element) => {
            const rect = element.getBoundingClientRect();
            return {
              tagName: element.tagName,
              text: element.textContent?.trim().slice(0, 120),
              className: element.className,
              role: element.getAttribute("role"),
              testId: element.getAttribute("data-testid"),
              ariaLabel: element.getAttribute("aria-label"),
              rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
              outerHtml: element.outerHTML.slice(0, 800),
            };
          }),
      },
      settingsMetrics: settingsRoute
        ? (() => {
            const settingsPanel = doc.querySelector(".settings-page-scroll-fade > div");
            const settingsContent = settingsPanel;
            const settingsRowIds = SETTINGS_ANCHOR_BY_ROUTE[expectedSemanticRoute] ?? [];
            return {
              navigationLabels: [
                ...(doc.querySelectorAll(
                  '[data-slot="sidebar-menu-button"] span, .settings-nav [role="link"]',
                ) ?? []),
              ]
                .map((item) => item.textContent?.trim())
                .filter((label) => SETTINGS_NAV_LABELS.includes(label)),
              rowIds: settingsRowIds.filter((id) => doc.getElementById(id)),
              rows: readSettingsRows(doc, settingsRowIds),
              keybindings:
                expectedSemanticRoute === "settings-keybindings"
                  ? readKeybindingsMetrics(doc)
                  : null,
              sectionTitles: [
                ...(settingsPanel?.querySelectorAll(":scope > section > div:first-child h2") ?? []),
              ].map((item) => item.textContent?.trim()),
              sectionTexts: [...(settingsPanel?.querySelectorAll(":scope > section") ?? [])].map(
                (item) => item.textContent?.trim().replace(/\s+/g, " ") ?? "",
              ),
              geometry: {
                root: readElementBox(doc.querySelector(".settings-root")),
                navigation: readElementBox(doc.querySelector(".settings-nav")),
                main: readElementBox(doc.querySelector(".settings-main")),
                content: readElementBox(settingsContent),
                panel: readElementBox(settingsPanel),
                sourceControlEmpty: readElementBox(
                  settingsPanel?.querySelector('[data-slot="empty"]'),
                ),
                panelAncestors: readElementAncestors(settingsPanel),
                sections: [...(settingsPanel?.querySelectorAll(":scope > section") ?? [])].map(
                  (item) => ({
                    title:
                      item.querySelector(":scope > div:first-child h2")?.textContent?.trim() ?? "",
                    box: readElementBox(item),
                    rows: readElementBox(item.querySelector(":scope > div:nth-child(2)")),
                  }),
                ),
                sourceControlRows: [...doc.querySelectorAll(".source-control-item")].map(
                  (item) => ({
                    text: item.textContent?.trim() ?? "",
                    box: readElementBox(item),
                    children: [...item.children].map((child) => ({
                      className: child.getAttribute("class") ?? "",
                      text: child.textContent?.trim() ?? "",
                      box: readElementBox(child),
                    })),
                  }),
                ),
                settingsRows: [...doc.querySelectorAll(".settings-row")].map((item) => ({
                  title: item.querySelector(".settings-row__title, h3")?.textContent?.trim() ?? "",
                  box: readElementBox(item),
                  children: [...item.children].map((child) => ({
                    className: child.getAttribute("class") ?? "",
                    text: child.textContent?.trim() ?? "",
                    box: readElementBox(child),
                  })),
                })),
                loadingRows: [...doc.querySelectorAll('[data-slot="skeleton"]')].map((item) => ({
                  id: item.getAttribute("data-source-control-loading-row"),
                  box: readElementBox(item),
                })),
              },
              sourceControlRows: [...doc.querySelectorAll(".source-control-item")].map((item) =>
                item.textContent?.trim(),
              ),
              emptyTexts: [...doc.querySelectorAll(".settings-empty__text")].map((item) =>
                item.textContent?.trim(),
              ),
              errorTexts: [...doc.querySelectorAll("[data-source-control-error]")].map((item) =>
                item.textContent?.trim(),
              ),
              sourceControlEmptyTitles: [...doc.querySelectorAll('[data-slot="empty-title"]')].map(
                (item) => item.textContent?.trim(),
              ),
              sourceControlRetryLabels: [...doc.querySelectorAll("[data-source-control-retry]")]
                .map((item) => item.textContent?.trim() || item.getAttribute("aria-label"))
                .filter(Boolean),
              loading: doc.querySelectorAll('[data-slot="skeleton"]').length > 0,
              hostSlotTitles: [...doc.querySelectorAll(".settings-row:not([id])")].map((item) =>
                item.querySelector(".settings-row__title")?.textContent?.trim(),
              ),
            };
          })()
        : null,
      textSample: text.slice(0, 200),
    };
  } catch (error) {
    // Cross-origin would throw; single-origin serving avoids that.
    return { reachable: false, error: String(error) };
  }
}

const workbench = {
  kind: "single-server-dual-frontend-workbench",
  scenario,
  viewport: { width, height, devicePixelRatio: window.devicePixelRatio },
  server: {
    pairingToken: Boolean(pairingToken),
    socketUrl: Boolean(socketUrl),
    expectProject,
    expectThread,
  },
  read() {
    return {
      scenario,
      viewport: this.viewport,
      web: readWebPane(),
      lynx: readLynxPane(),
    };
  },
  bothReady() {
    const s = this.read();
    return s.web.semanticReady === true && s.lynx.semanticReady === true;
  },
};
window.__T3_WORKBENCH__ = workbench;

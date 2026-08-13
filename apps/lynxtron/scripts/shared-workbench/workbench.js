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
  "settings-connections": ["remote-environments"],
  "settings-source-control": ["source-control"],
  "settings-beta": ["sidebar-v2"],
  "settings-archive": ["archive"],
};

function readElementBox(element) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  return {
    rect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    style: {
      display: style.display,
      position: style.position,
      zIndex: style.zIndex,
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
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      opacity: style.opacity,
    },
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
  const checkpointCards = [...(root?.querySelectorAll("[data-review-checkpoint-card]") ?? [])];
  const trees = [...(root?.querySelectorAll("[data-review-tree]") ?? [])];
  return {
    panelOpen: Boolean(rightPanel),
    panelEmpty: Boolean(emptySurface),
    activeKind:
      rightPanel?.getAttribute("data-right-panel-active-kind") ??
      (diffSurface ? "diff" : emptySurface ? "empty" : null),
    actionKeys: [...(root?.querySelectorAll("[data-right-panel-action]") ?? [])].map((item) =>
      item.getAttribute("data-right-panel-action"),
    ),
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
          checkpointCount: Number(diffSurface.getAttribute("data-review-checkpoint-count") ?? "0"),
          selectedTurn: diffSurface.getAttribute("data-review-selected-turn") ?? null,
          fileCount: Number(diffSurface.getAttribute("data-review-file-count") ?? "0"),
          empty: Boolean(diffSurface.querySelector("[data-review-empty-state]")),
          runtimeBlocker:
            diffSurface
              .querySelector("[data-review-runtime-blocker]")
              ?.getAttribute("data-review-runtime-blocker") ?? null,
          text: diffSurface.textContent?.trim().replace(/\s+/g, " ").slice(0, 480) ?? "",
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
localStorage.setItem(
  "t3code:client-settings:v1",
  JSON.stringify({ sidebarV2Enabled: true, sidebarV2ConfiguredByUser: true }),
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
});
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
            : null;
    const overlayElement =
      overlay === "quick-switch" || overlay === "file-picker"
        ? paletteElement
        : overlay === "model-picker"
          ? root?.querySelector(".model-picker-panel")
          : overlay === "project-scope"
            ? root?.querySelector(".sidebar-v2-scope-popup")
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
    const settingsRoute = expectedSemanticRoute.startsWith("settings-");
    const quickSwitchInput = root?.querySelector(".qs-search__input") ?? null;
    const modelPickerInput = root?.querySelector(".picker-search__input") ?? null;
    const modelPickerContent = root?.querySelector(".model-picker-content") ?? null;
    const composerFrame = root?.querySelector(".composer-frame") ?? null;
    const composerEditorHost = root?.querySelector('[data-composer-editor="true"]') ?? null;
    const composerPrimaryAction = root?.querySelector("[data-composer-primary-state]") ?? null;
    const composerControlElements = [...(root?.querySelectorAll("[data-composer-control]") ?? [])];
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
      overlay === "project-scope" ? projectScopeTriggerElement : modelTriggerElement;
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
                : [],
        rowCount:
          overlay === "quick-switch" || overlay === "file-picker"
            ? (root?.querySelectorAll(".palette-row").length ?? 0)
            : overlay === "model-picker"
              ? (root?.querySelectorAll(".model-picker-row").length ?? 0)
              : overlay === "project-scope"
                ? (root?.querySelectorAll(".lynx-menu-radio-item").length ?? 0)
                : 0,
      },
      sidebarDiagnostics: {
        state:
          root
            ?.querySelector('[data-slot="sidebar-wrapper"]')
            ?.getAttribute("data-sidebar-state") ?? null,
        chrome: {
          sidebar: readElementBox(root?.querySelector("[data-app-sidebar]")),
          header: readElementBox(root?.querySelector(".lynx-sidebar-chrome-header")),
          brand: readElementBox(root?.querySelector(".sidebar-brand")),
          search: readElementBox(root?.querySelector('[aria-label="Search threads"]')),
          projectScope: readElementBox(
            root?.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]'),
          ),
        },
        search: (() => {
          const host = root?.querySelector('[aria-label="Search threads"]');
          return {
            value:
              host?.shadowRoot?.querySelector("input")?.value ??
              host?.value ??
              host?.getAttribute("value") ??
              "",
            resultIds: [
              ...(root?.querySelectorAll('[aria-label="Thread search results"] [data-thread-id]') ??
                []),
            ].map((item) => item.getAttribute("data-thread-id")),
            resultTitles: [
              ...(root?.querySelectorAll('[aria-label="Thread search results"] [data-thread-id]') ??
                []),
            ].map((item) => item.querySelector(".sidebar-v2-row-title")?.textContent?.trim() ?? ""),
          };
        })(),
        threads: [...(root?.querySelectorAll("[data-thread-id]") ?? [])].map((item) => {
          const rect = item.getBoundingClientRect();
          const child = item.querySelector('[role="button"]');
          const childRect = child?.getBoundingClientRect();
          return {
            tagName: item.tagName,
            id: item.id || null,
            threadId: item.getAttribute("data-thread-id"),
            active: item.getAttribute("data-thread-active"),
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
                  }
                : null,
          };
        }),
        diffs: [...(root?.querySelectorAll("[data-sidebar-diff='true']") ?? [])].map((item) => ({
          insertions: Number(item.getAttribute("data-sidebar-diff-insertions") ?? "0"),
          deletions: Number(item.getAttribute("data-sidebar-diff-deletions") ?? "0"),
        })),
      },
      composerMetrics: composerFrame
        ? {
            layout: heroPresent ? "hero" : "docked",
            state: composerFrame.getAttribute("data-composer-state"),
            placeholder: root?.querySelector(".composer__placeholder")?.textContent?.trim() ?? null,
            rect: readElementBox(composerFrame),
            editor: {
              value:
                composerEditorHost?.shadowRoot?.querySelector("textarea")?.value ??
                composerEditorHost?.value ??
                composerEditorHost?.getAttribute("value") ??
                "",
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
              composerPrimaryAction?.getAttribute("data-composer-primary-state") ?? null,
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
              pending: readElementBox(
                root?.querySelector('[data-composer-pending-kind="approval"]'),
              ),
              detail: readElementBox(root?.querySelector(".composer-pending-approval__detail")),
              editorArea: readElementBox(root?.querySelector(".composer-editor-area")),
              footer: readElementBox(root?.querySelector(".composer-footer")),
              actions: [...(root?.querySelectorAll(".composer-approval-action") ?? [])].map(
                (item) => readElementBox(item),
              ),
              context: readElementBox(root?.querySelector(".composer-context-strip")),
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
        composerOverlay: readElementBox(root?.querySelector(".composer-overlay")),
        inlineRuns: [
          ...(root?.querySelectorAll(
            ".transcript-user-bubble .md-inline, .transcript-user-bubble .md-inline-code, .transcript-assistant-row .md-inline, .transcript-assistant-row .md-inline-code",
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
        actionItems: [...(root?.querySelectorAll("[data-header-action]") ?? [])].map((item) => ({
          id: item.getAttribute("data-header-action"),
          box: readElementBox(item),
        })),
      },
      reviewMetrics: readReviewMetrics(root),
      pendingRequestMetrics: readPendingRequestMetrics(root),
      settingsMetrics: settingsRoute
        ? {
            navigationLabels: [...(root?.querySelectorAll(".settings-nav__item-label") ?? [])].map(
              (item) => item.textContent?.trim(),
            ),
            rowIds: (SETTINGS_ANCHOR_BY_ROUTE[expectedSemanticRoute] ?? []).filter((id) =>
              root?.getElementById(id),
            ),
            sectionTitles: [...(root?.querySelectorAll(".settings-section__title") ?? [])].map(
              (item) => item.textContent?.trim(),
            ),
            sourceControlRows: [...(root?.querySelectorAll(".source-control-item") ?? [])].map(
              (item) => item.textContent?.trim(),
            ),
            emptyTexts: [...(root?.querySelectorAll(".settings-empty__text") ?? [])].map((item) =>
              item.textContent?.trim(),
            ),
            errorTexts: [...(root?.querySelectorAll("[data-source-control-error]") ?? [])].map(
              (item) => item.textContent?.trim(),
            ),
            sourceControlRetryLabels: [
              ...(root?.querySelectorAll("[data-source-control-retry]") ?? []),
            ]
              .map((item) => item.textContent?.trim())
              .filter((label) => label === "Scan" || label === "Rescan"),
            loading: (root?.querySelector(".settings-empty__text")?.textContent ?? "").includes(
              "Scanning",
            ),
            hostSlotTitles: [...(root?.querySelectorAll(".settings-row:not([id])") ?? [])].map(
              (item) => item.querySelector(".settings-row__title")?.textContent?.trim(),
            ),
          }
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
            : null;
    const modelTriggerElement =
      doc.querySelector('[data-chat-provider-model-picker="true"]') ?? null;
    const projectScopeTriggerElement =
      doc.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]') ?? null;
    const quickSwitchTriggerElement =
      doc.querySelector(".sidebar-v2-search") ??
      doc.querySelector('[data-testid="command-palette-trigger"]') ??
      doc.querySelector('[aria-label="Search threads and commands"]') ??
      null;
    const overlayTriggerElement =
      overlay === "project-scope" ? projectScopeTriggerElement : modelTriggerElement;
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
    const composerFrame = doc.querySelector(".composer-frame");
    const composerEditor = doc.querySelector('[data-composer-editor="true"]');
    const composerPrimaryAction = doc.querySelector("[data-composer-primary-state]");
    const composerControlElements = [...doc.querySelectorAll("[data-composer-control]")];
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
        anatomy:
          overlay === "quick-switch" || overlay === "file-picker"
            ? {
                panel: readElementBox(overlayElement),
                search: readElementBox(
                  doc
                    .querySelector('[data-command-palette="true"] [data-slot="autocomplete-input"]')
                    ?.closest(".relative")?.parentElement,
                ),
                input: readElementBox(
                  doc.querySelector(
                    '[data-command-palette="true"] [data-slot="autocomplete-input"]',
                  ),
                ),
                results: readElementBox(
                  doc.querySelector('[data-command-palette="true"] [data-slot="command-list"]') ??
                    doc.querySelector('[data-command-palette="true"] .palette-empty')
                      ?.parentElement,
                ),
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
              pending: readElementBox(doc.querySelector('[data-composer-pending-kind="approval"]')),
              detail: readElementBox(doc.querySelector(".composer-pending-approval__detail")),
              editorArea: readElementBox(doc.querySelector(".composer-editor-area")),
              footer: readElementBox(doc.querySelector(".composer-footer")),
              actions: [...doc.querySelectorAll(".composer-approval-action")].map((item) =>
                readElementBox(item),
              ),
              context: readElementBox(
                doc.querySelector(".composer-context-strip") ??
                  doc.querySelector(".chat-composer-context-strip"),
              ),
            },
          }
        : null,
      timelineMetrics: {
        host: readElementBox(doc.querySelector("[data-chat-messages]")),
        list: readElementBox(doc.querySelector("[data-chat-messages]")),
        empty: readElementBox(doc.querySelector(".transcript-empty")),
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
        actionItems: [...doc.querySelectorAll("[data-chat-header-actions] > *")].map(
          (item, index) => ({
            id: ["add", "open", "commit"][index] ?? String(index),
            box: readElementBox(item),
          }),
        ),
      },
      reviewMetrics: readReviewMetrics(doc),
      pendingRequestMetrics: readPendingRequestMetrics(doc),
      sidebarDiagnostics: {
        state:
          doc.querySelector('[data-slot="sidebar-wrapper"]')?.getAttribute("data-sidebar-state") ??
          null,
        chrome: {
          sidebar: readElementBox(doc.querySelector("[data-app-sidebar]")),
          header: readElementBox(doc.querySelector(".lynx-sidebar-chrome-header")),
          brand: readElementBox(doc.querySelector(".sidebar-brand")),
          search: readElementBox(doc.querySelector('[aria-label="Search threads"]')),
          projectScope: readElementBox(
            doc.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]'),
          ),
        },
        search: (() => {
          const input = doc.querySelector('[aria-label="Search threads"]');
          return {
            value: input?.value ?? input?.getAttribute("value") ?? "",
            resultIds: [
              ...doc.querySelectorAll('[aria-label="Thread search results"] [data-thread-id]'),
            ].map((item) => item.getAttribute("data-thread-id")),
            resultTitles: [
              ...doc.querySelectorAll('[aria-label="Thread search results"] [role="option"]'),
            ].map((item) => item.querySelector(".truncate")?.textContent?.trim() ?? ""),
          };
        })(),
        threads: [...doc.querySelectorAll("[data-thread-id]")].map((item) => {
          const rect = item.getBoundingClientRect();
          const child = item.querySelector('[role="button"]');
          const childRect = child?.getBoundingClientRect();
          return {
            tagName: item.tagName,
            id: item.id || null,
            threadId: item.getAttribute("data-thread-id"),
            active: item.getAttribute("data-thread-active"),
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
                  }
                : null,
          };
        }),
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
        ? {
            navigationLabels: [
              ...(doc.querySelectorAll(
                '[data-slot="sidebar-menu-button"] span, .settings-nav [role="link"]',
              ) ?? []),
            ]
              .map((item) => item.textContent?.trim())
              .filter((label) => SETTINGS_NAV_LABELS.includes(label)),
            rowIds: (SETTINGS_ANCHOR_BY_ROUTE[expectedSemanticRoute] ?? []).filter((id) =>
              doc.getElementById(id),
            ),
            sectionTitles: [...doc.querySelectorAll(".settings-section__title")].map((item) =>
              item.textContent?.trim(),
            ),
            sourceControlRows: [...doc.querySelectorAll(".source-control-item")].map((item) =>
              item.textContent?.trim(),
            ),
            emptyTexts: [...doc.querySelectorAll(".settings-empty__text")].map((item) =>
              item.textContent?.trim(),
            ),
            errorTexts: [...doc.querySelectorAll("[data-source-control-error]")].map((item) =>
              item.textContent?.trim(),
            ),
            sourceControlRetryLabels: [...doc.querySelectorAll("[data-source-control-retry]")]
              .map((item) => item.textContent?.trim() || item.getAttribute("aria-label"))
              .filter(Boolean),
            loading: doc.querySelectorAll('[data-slot="skeleton"]').length > 0,
            hostSlotTitles: [...doc.querySelectorAll(".settings-row:not([id])")].map((item) =>
              item.querySelector(".settings-row__title")?.textContent?.trim(),
            ),
          }
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

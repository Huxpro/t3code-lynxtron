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
const expectedComponentStoryCount = Number(url.searchParams.get("componentStoryCount") ?? "0");
const theme = url.searchParams.get("theme") === "light" ? "light" : "dark";
const requestedModelSelection = (() => {
  const value = url.searchParams.get("modelSelection");
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
})();
const expectedOverlay = url.searchParams.get("overlay") || null;
const legacySidebarEnabled = url.searchParams.get("legacySidebarEnabled") === "true";
const betaMutationEnabled = url.searchParams.get("betaMutationEnabled") === "true";
const initialOverlay = url.searchParams.get("initialOverlay") || null;
const requestedSidebarWidthRaw = url.searchParams.get("sidebarWidth");
const requestedSidebarWidthValue =
  requestedSidebarWidthRaw === null ? Number.NaN : Number(requestedSidebarWidthRaw);
const requestedSidebarWidth =
  Number.isFinite(requestedSidebarWidthValue) && requestedSidebarWidthValue > 0
    ? requestedSidebarWidthValue
    : null;
const requestedRightPanelWidthRaw = url.searchParams.get("rightPanelWidth");
const requestedRightPanelWidthValue =
  requestedRightPanelWidthRaw === null ? Number.NaN : Number(requestedRightPanelWidthRaw);
const requestedRightPanelWidth =
  Number.isFinite(requestedRightPanelWidthValue) && requestedRightPanelWidthValue > 0
    ? requestedRightPanelWidthValue
    : null;
const environmentIdentificationMode = "none";
const SETTINGS_NAV_LABELS = [
  "General",
  "Appearance",
  "Keybindings",
  "Providers",
  "Source Control",
  "Connections",
  "Archive",
];
const SETTINGS_ANCHOR_BY_ROUTE = {
  "settings-general": [
    "project-grouping",
    "time-format",
    "hide-whitespace-changes",
    "assistant-output",
    "provider-update-checks",
    "background-activity",
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
  "settings-beta": ["background-activity", "legacy-sidebar"],
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
    scroll: {
      width: element.scrollWidth,
      height: element.scrollHeight,
      clientWidth: element.clientWidth,
      clientHeight: element.clientHeight,
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
      webkitTextFillColor: style.webkitTextFillColor,
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
      transform: style.transform,
      transitionDuration: style.transitionDuration,
      transitionProperty: style.transitionProperty,
      animationDuration: style.animationDuration,
      animationName: style.animationName,
    },
  };
}

function readComponentLabMetrics(root) {
  const lab = root?.querySelector('[data-component-lab="web-lynx-shared"]');
  if (!lab) return null;
  return {
    expectedStoryCount: expectedComponentStoryCount,
    tooltip: (() => {
      const popup = root.querySelector('[data-floating-popup="component-lab-tooltip"]');
      return popup ? { text: readComposedText(popup), box: readElementBox(popup) } : null;
    })(),
    menu: (() => {
      const popup = root.querySelector('[data-floating-popup="component-lab-menu"]');
      return popup
        ? {
            text: readComposedText(popup),
            box: readElementBox(popup),
            items: [...popup.querySelectorAll("[data-component-lab-menu-item]")].map((item) =>
              readComposedText(item),
            ),
            groupCount: popup.querySelectorAll('[data-slot="menu-group"]').length,
            labelCount: popup.querySelectorAll('[data-slot="menu-label"]').length,
            separatorCount: popup.querySelectorAll('[data-slot="menu-separator"]').length,
            shortcutCount: popup.querySelectorAll('[data-slot="menu-shortcut"]').length,
          }
        : null;
    })(),
    select: (() => {
      const trigger = root.querySelector('[data-component-lab-select-trigger="default"]');
      const popup = root.querySelector(
        '[data-floating-popup="component-lab-select"]:not(.ui-select-popup--closed)',
      );
      return {
        value: readComposedText(
          trigger?.querySelector('[data-slot="select-value"], .ui-select-value'),
        ),
        trigger: readElementBox(trigger),
        popup: popup
          ? {
              text: readComposedText(popup),
              box: readElementBox(popup),
              items: [...popup.querySelectorAll("[data-component-lab-select-item]")].map(
                (item) => ({
                  box: readElementBox(item),
                  id: item.getAttribute("data-component-lab-select-item"),
                  selected:
                    item.hasAttribute("data-selected") ||
                    item.classList.contains("ui-select-item--selected"),
                  text: readComposedText(item),
                }),
              ),
              groupCount: popup.querySelectorAll('[data-slot="select-group"], .ui-select-group')
                .length,
              labelCount: popup.querySelectorAll(
                '[data-slot="select-group-label"], .ui-select-group-label',
              ).length,
            }
          : null,
      };
    })(),
    numberField: (() => {
      const rootField = root.querySelector('[data-component-lab-number-field="default"]');
      const input = root.querySelector('[data-component-lab-number-input="value"]');
      return {
        root: readElementBox(rootField),
        input: readElementBox(input),
        value: input?.value ?? input?.getAttribute("value") ?? null,
      };
    })(),
    scrollArea: (() => {
      const host = root.querySelector(".component-lab-scroll-area");
      const shadowScroller = [...(host?.shadowRoot?.querySelectorAll("*") ?? [])].find(
        (candidate) => candidate.scrollHeight > candidate.clientHeight,
      );
      const viewport =
        host?.querySelector('[data-slot="scroll-area-viewport"]') ?? shadowScroller ?? host;
      const content = host?.querySelector(".component-lab-scroll-area__content");
      return {
        host: readElementBox(host),
        viewport: readElementBox(viewport),
        content: readElementBox(content),
        scrollTop: typeof viewport?.scrollTop === "number" ? viewport.scrollTop : null,
        scrollHeight: typeof viewport?.scrollHeight === "number" ? viewport.scrollHeight : null,
        clientHeight: typeof viewport?.clientHeight === "number" ? viewport.clientHeight : null,
      };
    })(),
    dialog: (() => {
      const popup = root.querySelector('[data-component-lab-dialog-popup="default"]');
      return popup
        ? {
            popup: readElementBox(popup),
            title: readComposedText(popup.querySelector('[data-slot="dialog-title"]')),
            description: readComposedText(popup.querySelector('[data-slot="dialog-description"]')),
            panel: readElementBox(popup.querySelector('[data-slot="dialog-panel"]')),
            footer: readElementBox(popup.querySelector('[data-slot="dialog-footer"]')),
            backdropCount: root.querySelectorAll('[data-slot="dialog-backdrop"]').length,
            viewportCount: root.querySelectorAll('[data-slot="dialog-viewport"]').length,
          }
        : null;
    })(),
    sheet: (() => {
      const popup = root.querySelector('[data-component-lab-sheet-popup="default"]');
      const viewport = root.querySelector('[data-slot="sheet-viewport"]');
      return popup
        ? {
            popup: readElementBox(popup),
            viewport: readElementBox(viewport),
            header: readElementBox(popup.querySelector('[data-slot="sheet-header"]')),
            panelScroll: readElementBox(
              popup.querySelector('[data-slot="sheet-panel-scroll"]') ??
                popup.querySelector(".ui-sheet-panel-scroll"),
            ),
            panel: readElementBox(popup.querySelector('[data-slot="sheet-panel"]')),
            footer: readElementBox(popup.querySelector('[data-slot="sheet-footer"]')),
            title: readComposedText(popup.querySelector('[data-slot="sheet-title"]')),
            description: readComposedText(popup.querySelector('[data-slot="sheet-description"]')),
            text: readComposedText(popup),
          }
        : null;
    })(),
    sheetViewportCount: root.querySelectorAll('[data-slot="sheet-viewport"]').length,
    sheetBackdropCount: root.querySelectorAll('[data-slot="sheet-backdrop"]').length,
    popover: (() => {
      const popup = root.querySelector('[data-component-lab-popover-popup="default"]');
      return popup
        ? {
            popup: readElementBox(popup),
            text: readComposedText(popup),
          }
        : null;
    })(),
    projectFavicon: (() => {
      const element = root.querySelector(".component-lab-project-favicon");
      const tagName = element?.tagName?.toLowerCase() ?? null;
      const src = element?.getAttribute("src") ?? null;
      return {
        box: readElementBox(element),
        mode:
          tagName === "svg" || (typeof src === "string" && src.startsWith("data:"))
            ? "fallback"
            : src
              ? "asset"
              : "unknown",
        src,
        tagName,
      };
    })(),
    settingReset: (() => {
      const button = root.querySelector('[aria-label="Reset appearance to default"]');
      return {
        button: readElementBox(button),
        count: readComposedText(root.querySelector('[data-component-lab-reset-count="value"]')),
      };
    })(),
    sidebarPrimitive: (() => {
      const button = root.querySelector('[data-component-lab-sidebar-menu-button="default"]');
      return {
        button: readElementBox(button),
        count: readComposedText(root.querySelector('[data-component-lab-sidebar-count="value"]')),
        content: readElementBox(root.querySelector(".component-lab-sidebar-content")),
        inset: readElementBox(root.querySelector(".component-lab-sidebar-inset")),
        providerState:
          root
            .querySelector(".component-lab-sidebar-provider")
            ?.getAttribute("data-sidebar-state") ?? null,
        trigger: readElementBox(root.querySelector(".component-lab-sidebar-trigger")),
      };
    })(),
    command: (() => {
      const rootCommand = root.querySelector(".component-lab-command");
      const inputHost = rootCommand?.querySelector('[aria-label="Component lab command input"]');
      const input = inputHost?.shadowRoot?.querySelector("input") ?? inputHost;
      const items = [...(rootCommand?.querySelectorAll('[data-slot="command-item"]') ?? [])];
      return {
        root: readElementBox(rootCommand),
        input: readElementBox(inputHost),
        inputValue: input?.value ?? input?.getAttribute("value") ?? null,
        inputPlaceholder: input?.placeholder ?? input?.getAttribute("placeholder") ?? null,
        list: readElementBox(rootCommand?.querySelector('[data-slot="command-list"]')),
        group: readElementBox(rootCommand?.querySelector('[data-slot="command-group"]')),
        panel: readElementBox(
          rootCommand?.querySelector('[data-slot="command-panel"]') ??
            rootCommand?.querySelector(".component-lab-command__panel"),
        ),
        footer: readElementBox(rootCommand?.querySelector('[data-slot="command-footer"]')),
        label: readElementBox(rootCommand?.querySelector('[data-slot="command-group-label"]')),
        labelText: readComposedText(
          rootCommand?.querySelector('[data-slot="command-group-label"]'),
        ),
        itemBoxes: items.map(readElementBox),
        itemTexts: items.map(readComposedText),
        separatorCount:
          rootCommand?.querySelectorAll('[data-slot="command-separator"]').length ?? 0,
        shortcutText: readComposedText(
          rootCommand?.querySelector('[data-slot="command-shortcut"]'),
        ),
        footerText: readComposedText(rootCommand?.querySelector('[data-slot="command-footer"]')),
        empty: readElementBox(rootCommand?.querySelector('[data-slot="command-empty"]')),
        emptyText: readComposedText(rootCommand?.querySelector('[data-slot="command-empty"]')),
      };
    })(),
    commandDialog: (() => {
      const popup = root.querySelector('[data-component-lab-command-dialog-popup="default"]');
      return popup
        ? {
            popup: readElementBox(popup),
            text: readComposedText(popup),
            backdropCount: root.querySelectorAll(
              '[data-slot="dialog-backdrop"], [data-slot="command-dialog-backdrop"]',
            ).length,
            viewportCount: root.querySelectorAll(
              '[data-slot="dialog-viewport"], [data-slot="command-dialog-viewport"]',
            ).length,
          }
        : null;
    })(),
    commandDialogTrigger: readElementBox(
      root.querySelector('[data-component-lab-command-dialog-trigger="default"]'),
    ),
    commandDialogBackdropCount: root.querySelectorAll(
      '[data-slot="dialog-backdrop"], [data-slot="command-dialog-backdrop"]',
    ).length,
    commandDialogViewportCount: root.querySelectorAll(
      '[data-slot="dialog-viewport"], [data-slot="command-dialog-viewport"]',
    ).length,
    threadErrorBanner: (() => {
      const banner = root.querySelector(".thread-error-banner");
      return banner
        ? {
            banner: readElementBox(banner),
            alert: readElementBox(banner.querySelector(".thread-error-alert")),
            title: readComposedText(banner.querySelector(".thread-error-title")),
            description: readComposedText(banner.querySelector(".thread-error-description")),
            action: readElementBox(banner.querySelector(".thread-error-action")),
          }
        : null;
    })(),
    threadStatusLabels: [
      ...root.querySelectorAll(".component-lab-thread-statuses [aria-label]"),
    ].map((element) => ({
      label: element.getAttribute("aria-label"),
      box: readElementBox(element),
    })),
    changeRequests: [...root.querySelectorAll(".component-lab-change-request")].map((element) => ({
      box: readElementBox(element),
      icon: readElementBox(element.querySelector(".component-lab-change-request__icon")),
      text: readComposedText(element),
    })),
    worktreeIndicator: (() => {
      const host = root.querySelector(".component-lab-worktree-indicator [aria-label]");
      const icon = host?.querySelector("svg, image, x-image") ?? host?.firstElementChild;
      return {
        host: readElementBox(host),
        icon: readElementBox(icon),
        label: host?.getAttribute("aria-label") ?? null,
      };
    })(),
    sidebarChrome: (() => {
      const rootChrome = root.querySelector(".component-lab-sidebar-chrome");
      return {
        root: readElementBox(rootChrome),
        header: readElementBox(rootChrome?.querySelector('[data-slot="sidebar-header"]')),
        footer: readElementBox(rootChrome?.querySelector('[data-slot="sidebar-footer"]')),
        brandText: readComposedText(rootChrome?.querySelector(".sidebar-brand-host")),
        settingsText: readComposedText(rootChrome?.querySelector(".sidebar-settings-row")),
      };
    })(),
    fileTree: (() => {
      const tree = root.querySelector(".component-lab-file-tree");
      const directory = tree?.querySelector('[data-item-path="src"]');
      const file = tree?.querySelector('[data-item-path="src/index.ts"]');
      return {
        root: readElementBox(tree),
        directory: readElementBox(directory),
        directoryText: readComposedText(directory),
        expanded: directory?.getAttribute("aria-expanded") === "true",
        children: readElementBox(tree?.querySelector(".file-tree-children")),
        file: readElementBox(file),
        fileText: readComposedText(file),
        selected: file?.classList?.contains("file-tree-row--selected") ?? false,
        lynxHovered: file?.getAttribute("data-lynx-hover") ?? null,
      };
    })(),
    changedFilesCard: (() => {
      const card = root.querySelector(".component-lab-changed-files-card .turn-diff-card");
      return card
        ? {
            box: readElementBox(card),
            state: card.getAttribute("data-changed-files-state"),
            header: readElementBox(card.querySelector(".turn-diff-card__header")),
            toggle: readElementBox(card.querySelector(".turn-diff-card__toggle")),
            preview: readElementBox(card.querySelector(".turn-diff-card__preview")),
            expandedBody: readElementBox(card.querySelector(".file-tree-children")),
            text: readComposedText(card),
          }
        : null;
    })(),
    chatHeader: (() => {
      const rootHeader = root.querySelector(".component-lab-chat-header");
      return {
        root: readElementBox(rootHeader?.querySelector(".topbar__content")),
        project: readElementBox(rootHeader?.querySelector(".chat-header-project-main")),
        projectName: readComposedText(rootHeader?.querySelector(".topbar__proj-name")),
        title: readElementBox(rootHeader?.querySelector(".topbar__thread")),
        titleText: readComposedText(rootHeader?.querySelector(".topbar__thread")),
        actions: readElementBox(rootHeader?.querySelector("[data-chat-header-actions]")),
        actionText: readComposedText(rootHeader?.querySelector("[data-chat-header-actions]")),
        count: readComposedText(
          rootHeader?.querySelector('[data-component-lab-chat-header-count="value"]'),
        ),
      };
    })(),
    hostList: (() => {
      const scroll = root.querySelector(".component-lab-host-scroll");
      const list = scroll?.querySelector(".component-lab-host-list");
      const items = [...(list?.querySelectorAll(".component-lab-host-list__item") ?? [])];
      return {
        scroll: readElementBox(scroll),
        scrollTop: Number(scroll?.scrollTop ?? 0),
        list: readElementBox(list),
        items: items.map((item) => ({ box: readElementBox(item), text: readComposedText(item) })),
      };
    })(),
    hostLayout: (() => {
      const layout = root.querySelector(".component-lab-host-layout");
      const headline = layout?.querySelector(".component-lab-host-headline");
      return {
        layout: readElementBox(layout),
        headline: readElementBox(headline),
        headlineText: readComposedText(headline),
      };
    })(),
    t3Wordmarks: [...root.querySelectorAll(".component-lab-t3-wordmark")].map((host) => ({
      host: readElementBox(host),
      mark: readElementBox(
        host.querySelector('svg, image, x-image, [class*="lynx-sidebar-wordmark"]'),
      ),
    })),
    updatePills: [...root.querySelectorAll(".sidebar-update-pill-surface")].map((pill) => ({
      box: readElementBox(pill),
      tone: pill.getAttribute("data-update-tone"),
      title: pill.getAttribute("data-update-title"),
      hasProgress: pill.getAttribute("data-has-progress") === "true",
      main: readElementBox(pill.querySelector(".sidebar-update-pill-surface__main")),
      dismiss: readElementBox(pill.querySelector(".sidebar-update-pill-surface__dismiss")),
      progress: readElementBox(pill.querySelector(".sidebar-update-pill-surface__progress")),
    })),
    updateDismissed: root.querySelector('[data-component-lab-update-dismissed="true"]') !== null,
    baseUiInertCount: root.querySelectorAll("[data-base-ui-inert]").length,
    draftInput: (() => {
      const committed = root.querySelector('[data-component-lab-draft-committed="value"]');
      const control = root.querySelector(".component-lab-draft-input__control");
      const frame = root.querySelector(".component-lab-draft-input__frame");
      const host =
        root.querySelector('[aria-label="Component lab draft input"]') ??
        control?.querySelector?.("input, x-input") ??
        control;
      const input = host?.shadowRoot?.querySelector("input") ?? host;
      return {
        box: readElementBox(frame),
        committed: readComposedText(committed),
        value: input?.value ?? input?.getAttribute("value") ?? null,
      };
    })(),
    label: (() => {
      const label = root.querySelector('[data-component-lab-label="project-name"]');
      const input = root.querySelector("#component-lab-project-name");
      return {
        box: readElementBox(label),
        htmlFor: label?.getAttribute("for") ?? label?.getAttribute("htmlFor") ?? null,
        inputId: input?.getAttribute("id") ?? null,
        text: readComposedText(label),
      };
    })(),
    lab: readElementBox(lab),
    rail: readElementBox(lab.querySelector(".component-lab__rail")),
    content: readElementBox(lab.querySelector(".component-lab__content")),
    stories: [...lab.querySelectorAll("[data-component-story]")].map((story) => ({
      id: story.getAttribute("data-component-story"),
      states: (story.getAttribute("data-component-states") ?? "").split(",").filter(Boolean),
      title: readComposedText(story.querySelector(".component-lab-story__title")),
      box: readElementBox(story),
      canvas: readElementBox(story.querySelector(".component-lab-story__canvas")),
      slots: [...story.querySelectorAll("[data-slot]")].map((element) => ({
        slot: element.getAttribute("data-slot"),
        box: readElementBox(element),
      })),
    })),
    slots: [...lab.querySelectorAll("[data-slot]")].reduce((counts, element) => {
      const slot = element.getAttribute("data-slot");
      if (slot) counts[slot] = (counts[slot] ?? 0) + 1;
      return counts;
    }, {}),
  };
}

function readPseudoElementBox(element, pseudoElement, visibleInsetTop = 0) {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element, pseudoElement);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    style.content === "none" ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null;
  }
  return {
    tagName: `${element.tagName.toLowerCase()}${pseudoElement}`,
    pseudoElement,
    sourceRect: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
    rect: {
      x: rect.x,
      y: rect.y + visibleInsetTop,
      width: rect.width,
      height: rect.height - visibleInsetTop,
    },
    style: {
      position: style.position,
      zIndex: style.zIndex,
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      borderTopColor: style.borderTopColor,
      borderRightColor: style.borderRightColor,
      borderBottomColor: style.borderBottomColor,
      borderLeftColor: style.borderLeftColor,
      borderBottomLeftRadius: style.borderBottomLeftRadius,
      borderBottomRightRadius: style.borderBottomRightRadius,
      boxShadow: style.boxShadow,
      backdropFilter: style.backdropFilter,
      webkitBackdropFilter: style.webkitBackdropFilter,
      maskImage: style.maskImage,
      webkitMaskImage: style.webkitMaskImage,
    },
  };
}

function findComposedElement(root, selector) {
  if (!root) return null;
  const direct = root.querySelector?.(selector) ?? null;
  if (direct) return direct;
  const visit = (node) => {
    for (const child of node?.children ?? []) {
      if (child.matches?.(selector)) return child;
      const nested = visit(child) ?? visit(child.shadowRoot);
      if (nested) return nested;
    }
    return null;
  };
  return visit(root.shadowRoot) ?? visit(root);
}

function readComposerPrimaryAction(primaryActions) {
  if (!primaryActions) return null;
  const action = findComposedElement(
    primaryActions,
    ".composer-primary-action, [data-composer-primary-state]",
  );
  return readElementBox(
    action ??
      (primaryActions.getAttribute("data-composer-primary-state") !== null ? primaryActions : null),
  );
}

function readHeroMetrics(root) {
  return {
    root: readElementBox(root?.querySelector(".hero")),
    inner: readElementBox(root?.querySelector(".hero__inner")),
    headlineSlot: readElementBox(root?.querySelector(".hero__headline-slot")),
    headline: readElementBox(root?.querySelector(".hero__headline")),
    projectName: readElementBox(root?.querySelector(".hero__project-name")),
  };
}

function readProviderStatusBannerMetrics(root) {
  const overlay = root?.querySelector(
    "[data-provider-status-banner], .provider-status-banner-flow, .provider-status-banner-overlay",
  );
  const alert = overlay?.querySelector('.thread-error-alert, [role="alert"]');
  if (!alert) return null;
  const action = alert.querySelector(".thread-error-action");
  const dismiss = alert.querySelector('[aria-label^="Dismiss "], button[aria-label^="Dismiss "]');
  const copy = alert.querySelector(".thread-error-copy") ?? alert.children[1];
  return {
    overlay: readElementBox(overlay ?? alert.parentElement),
    alert: readElementBox(alert),
    icon: readElementBox(alert.querySelector(".thread-error-icon, svg")),
    description: readElementBox(copy),
    title: readElementBox(alert.querySelector(".thread-error-title") ?? copy?.children[0]),
    message: readElementBox(alert.querySelector(".thread-error-description") ?? copy?.children[1]),
    action: readElementBox(action),
    dismiss: readElementBox(dismiss),
    text: alert.textContent?.trim() ?? "",
    actionLabels: [...alert.querySelectorAll("button[aria-label], [aria-label]")]
      .map((element) => element.getAttribute("aria-label"))
      .filter(Boolean),
  };
}

function readThreadErrorBannerMetrics(root) {
  const banner = [...(root?.querySelectorAll(".thread-error-banner") ?? [])].find(
    (candidate) =>
      !candidate.closest(
        "[data-provider-status-banner], .provider-status-banner-flow, .provider-status-banner-overlay",
      ),
  );
  const alert = banner?.querySelector(".thread-error-alert");
  if (!banner || !alert) return null;
  return {
    banner: readElementBox(banner),
    alert: readElementBox(alert),
    icon: readElementBox(alert.querySelector(".thread-error-icon")),
    copy: readElementBox(alert.querySelector(".thread-error-copy")),
    title: readElementBox(alert.querySelector(".thread-error-title")),
    description: readElementBox(alert.querySelector(".thread-error-description")),
    action: readElementBox(alert.querySelector(".thread-error-action")),
    text: alert.textContent?.trim() ?? "",
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
    jumpLabel:
      item
        .querySelector("[data-sidebar-thread-jump-hint]")
        ?.getAttribute("data-sidebar-thread-jump-hint") ?? null,
    snoozeTrigger: Boolean(item.querySelector("[data-sidebar-snooze-trigger]")),
    overflowTrigger: Boolean(item.querySelector("[data-sidebar-thread-action-trigger]")),
    settleAction: Boolean(item.querySelector('[aria-label="Settle thread"]')),
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
                      flexDirection: contentStyle?.flexDirection ?? null,
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
    projectLine: readElementBox(item.querySelector(".sidebar-v2-row-project-line")),
    projectTitle: readElementBox(item.querySelector(".sidebar-v2-row-project-title")),
    titleLine: readElementBox(item.querySelector(".sidebar-v2-row-title-line")),
    title: readElementBox(item.querySelector(".sidebar-v2-row-title")),
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

function readComposerInteractionSeparator(root, interactionControl) {
  if (!root || !interactionControl) return null;
  const controlRect = interactionControl.getBoundingClientRect();
  const separators = [
    ...root.querySelectorAll(
      ".composer-toolbar-row [data-slot='separator'], .composer-toolbar-sep, .composer-interaction-mode-separator",
    ),
  ]
    .map((element) => ({ element, box: readElementBox(element) }))
    .filter(
      ({ box }) =>
        box?.rect &&
        box.rect.x + box.rect.width <= controlRect.x + 1 &&
        Math.abs(box.rect.y + box.rect.height / 2 - (controlRect.y + controlRect.height / 2)) <= 2,
    )
    .sort(
      (left, right) =>
        controlRect.x -
        (left.box.rect.x + left.box.rect.width) -
        (controlRect.x - (right.box.rect.x + right.box.rect.width)),
    );
  return separators[0]?.box ?? null;
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
        titleAccessoryBox: readElementBox(
          row.querySelector('[aria-label="Background policy details"]'),
        ),
        descriptionBox: readElementBox(description),
        statusBox: readElementBox(status),
        controlBox: readElementBox(control),
      },
    ];
  });
}

function readSettingsRowGeometry(item) {
  const text = item.querySelector(".settings-row__text");
  const webGrid = text ? null : item.firstElementChild;
  const control =
    item.querySelector(".settings-row__control") ??
    (webGrid && webGrid.children.length > 1 ? webGrid.children[1] : null);
  const controlLeaf = control?.matches(
    'select, input, button, [role="switch"], [data-settings-select], [data-setting-control]',
  )
    ? control
    : control?.querySelector(
        'select, input, button, [role="switch"], [data-settings-select], [data-setting-control]',
      );
  return {
    title: item.querySelector(".settings-row__title, h3")?.textContent?.trim() ?? "",
    titleBox: readElementBox(item.querySelector(".settings-row__title, h3")),
    descriptionBox: readElementBox(item.querySelector(".settings-row__desc, p")),
    controlText: control?.textContent?.trim().replace(/\s+/g, " ") ?? "",
    controlBox: readElementBox(control),
    controlLeafBox: readElementBox(controlLeaf),
    box: readElementBox(item),
    children: [...item.children].map((child) => ({
      className: child.getAttribute("class") ?? "",
      text: child.textContent?.trim() ?? "",
      box: readElementBox(child),
    })),
  };
}

function readSettingsScroll(root) {
  const scroller = root?.querySelector(".settings-scroll, .settings-page-scroll-fade");
  return {
    box: readElementBox(scroller),
    scrollTop: typeof scroller?.scrollTop === "number" ? scroller.scrollTop : null,
  };
}

function readSettingsTopbar(root) {
  const frameWindow = root?.defaultView ?? root?.ownerDocument?.defaultView;
  const topbar = root?.querySelector(".settings-topbar");
  const title = topbar?.querySelector(".settings-topbar__title") ?? topbar?.querySelector("span");
  const restore =
    topbar?.querySelector(".settings-topbar__restore") ?? topbar?.querySelector("button");
  return {
    desktopVisualHost: frameWindow?.__T3_WORKBENCH_DESKTOP_VISUAL__ === true,
    box: readElementBox(topbar),
    title: readElementBox(title),
    titleText: title?.textContent?.trim() ?? "",
    restore: readElementBox(restore),
    restoreText: restore?.textContent?.trim().replace(/\s+/g, " ") ?? "",
    restoreChildren: [...(restore?.children ?? [])].map(readElementBox),
  };
}

function readLegacySidebarSettings(root) {
  const trigger = root?.querySelector(".settings-legacy-section__trigger");
  const control = root?.querySelector('[data-setting-control="legacy-sidebar"]');
  const rowMetrics = readSettingsRows(root, ["legacy-sidebar"])[0] ?? null;
  return {
    trigger: readElementBox(trigger),
    expanded: trigger?.getAttribute("aria-expanded") === "true",
    row: readElementBox(root?.getElementById("legacy-sidebar")),
    title: rowMetrics?.title ?? "",
    description: rowMetrics?.description ?? "",
    control: readElementBox(control),
    checked:
      control?.getAttribute("aria-checked") ??
      (control?.getAttribute("class")?.includes("ui-switch--checked")
        ? "true"
        : control?.getAttribute("class")?.includes("ui-switch--unchecked")
          ? "false"
          : null),
    controlClass: control?.getAttribute("class") ?? "",
  };
}

function readBetaMutationSettings(root) {
  const settingTitles = [...(root?.querySelectorAll(".settings-row__title, h3") ?? [])];
  const autoSettleTitle =
    settingTitles.find((title) => readComposedText(title) === "Auto-settle inactive threads") ??
    null;
  const autoSettleRow =
    autoSettleTitle?.closest(".settings-row") ??
    autoSettleTitle?.parentElement?.parentElement?.parentElement?.parentElement ??
    null;
  const control =
    root?.querySelector('[data-setting-control="auto-settle"]') ??
    autoSettleRow?.querySelector('[role="switch"]') ??
    null;
  const daysTitle =
    settingTitles.find(
      (title) => readComposedText(title) === "Days of inactivity before auto-settle",
    ) ?? null;
  const daysRow =
    daysTitle?.closest(".settings-row") ??
    daysTitle?.parentElement?.parentElement?.parentElement?.parentElement ??
    null;
  const daysInput =
    root?.querySelector(
      '[aria-label="Days of inactivity before auto-settle"], [accessibility-label="Days of inactivity before auto-settle"]',
    ) ??
    daysRow?.querySelector("input") ??
    null;
  return {
    titleCandidates: settingTitles.map((title) => readComposedText(title)),
    autoSettleTitle: autoSettleTitle ? readComposedText(autoSettleTitle) : null,
    autoSettleRowClass: autoSettleRow?.getAttribute("class") ?? null,
    autoSettleRow: readElementBox(autoSettleRow),
    checked:
      control?.getAttribute("aria-checked") ??
      (control?.getAttribute("class")?.includes("ui-switch--checked")
        ? "true"
        : control?.getAttribute("class")?.includes("ui-switch--unchecked")
          ? "false"
          : null),
    control: readElementBox(control),
    daysInput: readElementBox(daysInput),
    daysValue:
      daysInput?.value ??
      daysInput?.getAttribute("value") ??
      daysRow?.textContent?.match(/\b(\d{1,2})\b/u)?.[1] ??
      null,
  };
}

function readConnectionsMutationSettings(root) {
  const sections = [...(root?.querySelectorAll(".settings-section, section") ?? [])];
  const authorizedSection = sections.find((section) =>
    readComposedText(section).includes("Authorized clients"),
  );
  const buttons = [
    ...(authorizedSection?.querySelectorAll("button, [role='button'], .ui-button") ?? []),
  ];
  const labels = buttons.map((button) => readComposedText(button).trim());
  const pairingRevokeButtons = [
    ...(authorizedSection?.querySelectorAll('[class*="settings-connections-revoke-pairing--"]') ??
      []),
  ];
  const createButton = authorizedSection?.querySelector(".settings-connections-create-pairing");
  const error = [...(authorizedSection?.querySelectorAll(".settings-row__desc, p") ?? [])].find(
    (item) => /error|failed|forbidden|scope|unauthorized/iu.test(readComposedText(item)),
  );
  return {
    authorizedSection: readElementBox(authorizedSection),
    canCreate: Boolean(authorizedSection?.querySelector(".settings-connections-create-pairing")),
    createButton: readElementBox(createButton),
    createLabel: readComposedText(createButton).trim(),
    createDisabled:
      createButton?.disabled === true || createButton?.getAttribute("aria-disabled") === "true",
    error: error ? readComposedText(error).trim() : null,
    createDialogOpen: [...(root?.querySelectorAll('[data-slot="dialog-popup"]') ?? [])].some(
      (dialog) => readComposedText(dialog).includes("Create pairing link"),
    ),
    pairingLinkCount: pairingRevokeButtons.length,
    revokeCount: pairingRevokeButtons.filter(
      (button) => readComposedText(button).trim() === "Revoke",
    ).length,
  };
}

function readSettingsNavigationChrome(root) {
  const back =
    root?.querySelector(".settings-nav__back") ??
    [...(root?.querySelectorAll("button") ?? [])].find(
      (element) =>
        readComposedText(element) === "Back" && element.closest("[data-app-sidebar]") !== null,
    ) ??
    null;
  return {
    footer: readElementBox(root?.querySelector(".settings-nav__footer") ?? back?.parentElement),
    back: readElementBox(back),
    backLabel: readElementBox(
      back?.querySelector(".settings-nav__back-label") ??
        [...(back?.querySelectorAll("span") ?? [])].find(
          (element) => readComposedText(element) === "Back",
        ),
    ),
  };
}

function readSettingsNavigationItems(root) {
  const lynxItems = [...(root?.querySelectorAll(".settings-nav__item") ?? [])];
  const webItems =
    lynxItems.length > 0
      ? []
      : [...(root?.querySelectorAll("[data-app-sidebar] button") ?? [])].filter((element) =>
          SETTINGS_NAV_LABELS.includes(readComposedText(element)),
        );
  return (lynxItems.length > 0 ? lynxItems : webItems).map((item) => {
    const itemText = readComposedText(item);
    const labelElement =
      item.querySelector(".settings-nav__item-label") ??
      [...item.querySelectorAll("span")].find(
        (element) => readComposedText(element) === itemText,
      ) ??
      null;
    const label = labelElement?.textContent?.trim() ?? itemText;
    const box = readElementBox(item);
    const backgroundColor = box?.style?.backgroundColor ?? "";
    const active =
      item.getAttribute("data-active") === "true" ||
      item.classList.contains("settings-nav__item--active");
    return {
      label,
      active,
      visuallySelected:
        active ||
        (backgroundColor !== "" &&
          backgroundColor !== "transparent" &&
          backgroundColor !== "rgba(0, 0, 0, 0)" &&
          backgroundColor !== "rgba(0,0,0,0)"),
      className: item.getAttribute("class") ?? "",
      box,
      labelBox: readElementBox(labelElement),
    };
  });
}

function readProviderSettingsMetrics(root) {
  const cards = [...(root?.querySelectorAll(".provider-instance-card") ?? [])];
  const healthTitle =
    [...(root?.querySelectorAll(".settings-row__title, h3") ?? [])].find(
      (title) => readComposedText(title) === "Health check interval",
    ) ?? null;
  const healthRow =
    healthTitle?.closest(".settings-row") ??
    healthTitle?.parentElement?.parentElement?.parentElement?.parentElement ??
    null;
  const healthDecrement =
    root?.querySelector(".provider-health-number-field__stepper") ??
    root?.querySelector('[aria-label="Decrease provider health check interval"]') ??
    null;
  const healthIncrement =
    root?.querySelectorAll(".provider-health-number-field__stepper")?.[1] ??
    root?.querySelector('[aria-label="Increase provider health check interval"]') ??
    null;
  const healthGroup =
    root?.querySelector(".provider-health-number-field") ??
    healthDecrement?.closest('[data-slot="number-field-group"]') ??
    null;
  const healthControl =
    root?.querySelector(".provider-health-control") ??
    healthGroup?.parentElement?.parentElement ??
    null;
  const healthUnit =
    root?.querySelector(".provider-health-unit") ??
    [...(healthRow?.querySelectorAll("span, text, x-text") ?? [])].find(
      (item) => readComposedText(item) === "seconds",
    ) ??
    null;
  return {
    panel: readElementBox(root?.querySelector(".settings-panel")),
    addTrigger: readElementBox(root?.querySelector('[aria-label="Add provider instance"]')),
    refreshTrigger: readElementBox(root?.querySelector('[aria-label="Refresh provider status"]')),
    inlineCreate: readElementBox(root?.querySelector(".provider-instance-create")),
    healthRow: readElementBox(healthRow),
    healthControl: {
      root: readElementBox(healthControl),
      group: readElementBox(healthGroup),
      decrement: readElementBox(healthDecrement),
      input: readElementBox(
        root?.querySelector(
          '.provider-health-number-field__input, [aria-label="Provider health check interval in seconds"]',
        ),
      ),
      increment: readElementBox(healthIncrement),
      unit: readElementBox(healthUnit),
    },
    cards: cards.map((card) => {
      const toggleExpanded = card.querySelector(
        ".provider-instance-card__chevron, [data-provider-card-expanded]",
      );
      const titleElement = card.querySelector(".provider-instance-card__title");
      const toggleLabel =
        toggleExpanded
          ?.getAttribute("aria-label")
          ?.replace(/^Toggle /, "")
          .replace(/ details$/, "") ?? "";
      const title =
        card.getAttribute("data-provider-instance-title") ||
        toggleLabel ||
        readComposedText(titleElement);
      return {
        title,
        text: readComposedText(card),
        box: readElementBox(card),
        header: readElementBox(card.querySelector(".provider-instance-card__header")),
        layout: readElementBox(card.querySelector(".provider-instance-card__layout")),
        copy: readElementBox(card.querySelector(".provider-instance-card__copy")),
        titleRow: readElementBox(card.querySelector(".provider-instance-card__title-row")),
        summary: readElementBox(card.querySelector(".provider-instance-card__summary")),
        summaryChildren: [...card.querySelectorAll(".provider-instance-card__summary > *")].map(
          readElementBox,
        ),
        titleButtons: [
          ...card.querySelectorAll(".provider-instance-card__title-row .ui-button"),
        ].map(readElementBox),
        actions: readElementBox(card.querySelector(".provider-instance-card__actions")),
        toggleExpanded: readElementBox(toggleExpanded),
        enabledControl: readElementBox(
          card.querySelector('[role="switch"], .ui-switch, button[aria-checked]'),
        ),
      };
    }),
  };
}

function readAddProviderDialog(root) {
  const lynxDialog = root?.querySelector("[data-provider-instance-dialog='true']") ?? null;
  const webDialog = [...(root?.querySelectorAll("[data-slot='dialog-popup']") ?? [])].find(
    (dialog) =>
      readComposedText(dialog.querySelector("[data-slot='dialog-title']")) ===
      "Add provider instance",
  );
  const dialog = lynxDialog ?? webDialog ?? null;
  if (!dialog) return null;
  const backdrop =
    root.querySelector(".provider-instance-dialog-overlay") ??
    root.querySelector("[data-slot='dialog-backdrop']");
  const stepElements = [
    ...dialog.querySelectorAll(".provider-instance-dialog__step, button[aria-label*=', step ']"),
  ];
  const driverElements = [
    ...dialog.querySelectorAll(
      ".provider-instance-dialog__driver, [role='radio'], [data-base-ui-radio-root]",
    ),
  ];
  const dialogBox = readElementBox(dialog);
  const backdropBox = readElementBox(backdrop);
  const wizardStepAttribute = dialog.getAttribute("data-provider-wizard-step");
  const wizardStep = Number(wizardStepAttribute);
  const hasExplicitWizardStep = wizardStepAttribute !== null && Number.isInteger(wizardStep);
  return {
    present: true,
    text: readComposedText(dialog),
    box: dialogBox,
    backdrop: backdropBox,
    header: readElementBox(
      dialog.querySelector("[data-slot='dialog-header'], .provider-instance-dialog__header"),
    ),
    title: readElementBox(
      dialog.querySelector("[data-slot='dialog-title'], .provider-instance-dialog__title"),
    ),
    description: readElementBox(
      dialog.querySelector(
        "[data-slot='dialog-description'], .provider-instance-dialog__description",
      ),
    ),
    stepRail: readElementBox(
      dialog.querySelector("ol[role='list'], .provider-instance-dialog__steps"),
    ),
    body: readElementBox(
      dialog.querySelector("[data-slot='dialog-panel'], .provider-instance-dialog__body"),
    ),
    stepContent: readElementBox(
      dialog.querySelector(
        "[data-slot='animated-height'], .provider-instance-dialog__step-content",
      ),
    ),
    driverHeading: readElementBox(
      dialog.querySelector(".provider-instance-dialog__driver-heading"),
    ),
    identityFields: [
      ...dialog.querySelectorAll(
        ".provider-instance-dialog__identity-field, [data-slot='animated-height'] > div > label, [data-slot='animated-height'] > div > div",
      ),
    ].map((field) => ({
      text: readComposedText(field),
      box: readElementBox(field),
      children: [...(field.children ?? [])].map((child) => ({
        text: readComposedText(child),
        box: readElementBox(child),
      })),
    })),
    hint: readElementBox(dialog.querySelector(".provider-instance-dialog__hint")),
    errorBox: readElementBox(
      dialog.querySelector(".provider-instance-dialog__error, .text-destructive"),
    ),
    inputs: [...dialog.querySelectorAll(".provider-instance-dialog__input")].map(readElementBox),
    swatches: readElementBox(dialog.querySelector(".provider-instance-dialog__swatches")),
    footer: readElementBox(
      dialog.querySelector("[data-slot='dialog-footer'], .provider-instance-dialog__footer"),
    ),
    close: readElementBox(dialog.querySelector("[aria-label='Close']")),
    motion:
      dialog.getAttribute("data-provider-dialog-motion") ??
      (dialogBox?.style?.opacity === "1" ? "open" : null),
    transitionDuration: dialogBox?.style?.transitionDuration ?? "",
    transitionProperty: dialogBox?.style?.transitionProperty ?? "",
    animationDuration: dialogBox?.style?.animationDuration ?? "",
    animationName: dialogBox?.style?.animationName ?? "",
    activeStep: hasExplicitWizardStep
      ? wizardStep
      : stepElements.findIndex((step) => step.getAttribute("aria-current") === "step"),
    steps: stepElements.map((step) => ({
      label: step.getAttribute("aria-label") ?? readComposedText(step),
      current: hasExplicitWizardStep
        ? stepElements.indexOf(step) === wizardStep
        : step.getAttribute("aria-current") === "step",
      box: readElementBox(step),
      number: readElementBox(
        step.querySelector(".provider-instance-dialog__step-number") ??
          step.querySelector("[aria-hidden='true']"),
      ),
      labelBox: readElementBox(
        step.querySelector(".provider-instance-dialog__step-label") ??
          [...step.querySelectorAll("span")].find(
            (leaf) => leaf.getAttribute("aria-hidden") !== "true",
          ),
      ),
      textLeaves: [...step.querySelectorAll("span, text, x-text")]
        .filter(
          (leaf) => leaf.querySelector("span, text, x-text") === null && readComposedText(leaf),
        )
        .map((leaf) => ({ text: readComposedText(leaf), box: readElementBox(leaf) })),
    })),
    drivers: driverElements.map((driver) => ({
      label: readComposedText(driver),
      checked:
        driver.getAttribute("aria-checked") === "true" ||
        driver.getAttribute("data-checked") === "",
      disabled:
        driver.getAttribute("aria-disabled") === "true" ||
        driver.getAttribute("data-disabled") === "",
      box: readElementBox(driver),
      textLeaves: [...driver.querySelectorAll("span, text, x-text")]
        .filter(
          (leaf) => leaf.querySelector("span, text, x-text") === null && readComposedText(leaf),
        )
        .map((leaf) => ({ text: readComposedText(leaf), box: readElementBox(leaf) })),
    })),
    error: readComposedText(
      dialog.querySelector(
        ".provider-instance-dialog__error, .text-destructive, [aria-invalid='true'] + *",
      ),
    ),
    next: (() => {
      const control = [...dialog.querySelectorAll("button, .provider-instance-dialog__save")].find(
        (button) => readComposedText(button) === "Next",
      );
      return {
        box: readElementBox(control),
        label: readElementBox(control?.querySelector("span, text, x-text")),
      };
    })(),
    cancel: (() => {
      const control = [...dialog.querySelectorAll("button, .ui-button")].find((button) =>
        ["Cancel", "Back"].includes(readComposedText(button)),
      );
      return {
        box: readElementBox(control),
        label: readElementBox(control?.querySelector("span, text, x-text")),
      };
    })(),
  };
}

function readKeybindingsMetrics(root) {
  const header = root?.querySelector("[data-keybindings-table-header]") ?? null;
  const searchHost = root?.querySelector('[aria-label="Search keybindings"]') ?? null;
  const searchInput =
    searchHost?.shadowRoot?.querySelector("input") ??
    (searchHost?.matches?.("input") ? searchHost : null);
  const rows = [
    ...(root?.querySelectorAll("[data-keybinding-command][data-keybinding-shortcut]") ?? []),
  ];
  return {
    actions: {
      search: readElementBox(searchHost),
      add: readElementBox(root?.querySelector('[aria-label="Add keybinding"]')),
      openFile: readElementBox(root?.querySelector('[aria-label="Open keybindings.json"]')),
    },
    search: {
      expanded: searchInput !== null,
      value: searchInput?.value ?? searchInput?.getAttribute?.("value") ?? "",
      box: readElementBox(searchHost),
    },
    addRow: (() => {
      const row = root?.querySelector('[data-keybinding-add-row="true"]');
      const inputValue = (selector) => {
        const host = row?.querySelector(selector);
        const input = host?.shadowRoot?.querySelector("input") ?? host;
        return input?.value ?? input?.getAttribute?.("value") ?? null;
      };
      const save = row?.querySelector('[aria-label="Save keybinding"]');
      return row
        ? {
            box: readElementBox(row),
            command: readElementBox(row.querySelector('[aria-label="Keybinding command"]')),
            shortcut: readElementBox(row.querySelector('[aria-label="Keybinding shortcut"]')),
            when: readElementBox(row.querySelector('[aria-label="Keybinding when clause"]')),
            values: {
              command: inputValue('[aria-label="Keybinding command"]'),
              shortcut: inputValue('[aria-label="Keybinding shortcut"]'),
              when: inputValue('[aria-label="Keybinding when clause"]'),
            },
            save: readElementBox(save),
            saveDisabled:
              save?.getAttribute("class")?.includes("keybindings-add-row__save--disabled") ?? true,
            cancel: readElementBox(row.querySelector('[aria-label="Cancel new keybinding"]')),
            error: row.querySelector(".keybindings-add-row__error")?.textContent?.trim() ?? null,
          }
        : null;
    })(),
    header: readElementBox(header),
    headerColumns: [...(header?.children ?? [])].map((item) => ({
      text: item.textContent?.trim() ?? "",
      box: readElementBox(item),
    })),
    rows: rows.map((row) => {
      const inputValue = (selector) => {
        const host = row.querySelector(selector);
        const input = host?.shadowRoot?.querySelector("input") ?? host;
        return input?.value ?? input?.getAttribute?.("value") ?? null;
      };
      return {
        command: row.getAttribute("data-keybinding-command"),
        shortcut: row.getAttribute("data-keybinding-shortcut"),
        when: row.getAttribute("data-keybinding-when"),
        source: row.getAttribute("data-keybinding-source"),
        conflicts: JSON.parse(row.getAttribute("data-keybinding-conflicts") ?? "[]"),
        editing: row.querySelector('[aria-label^="Save "][aria-label$=" keybinding"]')
          ? {
              shortcut: inputValue('[aria-label^="Keybinding for "]'),
              when: inputValue('[aria-label^="When clause for "]'),
            }
          : null,
        keycaps: [
          ...(row.querySelectorAll("[data-slot='kbd'], .keybindings-table__keycap") ?? []),
        ].map((keycap) => ({
          text: keycap.textContent?.trim() ?? "",
          box: readElementBox(keycap),
        })),
        box: readElementBox(row),
        columns: [...row.children].map((item) => ({
          text: item.textContent?.trim().replace(/\s+/g, " ") ?? "",
          box: readElementBox(item),
        })),
      };
    }),
  };
}

function readSourceControlRows(root) {
  return [...(root?.querySelectorAll(".source-control-item") ?? [])].map((item) => ({
    text: item.textContent?.trim() ?? "",
    box: readElementBox(item),
    badge: readElementBox(item.querySelector("[data-slot='badge'], .source-control-item__badge")),
    layout: readElementBox(item.querySelector(".source-control-item__layout")),
    copy: readElementBox(item.querySelector(".source-control-item__copy")),
    headline: readElementBox(item.querySelector(".source-control-item__headline")),
    summary: readElementBox(item.querySelector(".source-control-item__summary")),
    children: [...item.children].map((child) => ({
      className: child.getAttribute("class") ?? "",
      text: child.textContent?.trim() ?? "",
      box: readElementBox(child),
    })),
  }));
}

function readSourceControlDetails(root) {
  const details = root?.querySelector(".source-control-git-details");
  if (!details) return null;
  const inputHost = details.querySelector("input");
  const input = inputHost?.shadowRoot?.querySelector("input") ?? inputHost;
  return {
    box: readElementBox(details),
    copy: readElementBox(details.querySelector(".source-control-git-details__copy")),
    control: readElementBox(details.querySelector(".source-control-git-details__control")),
    numberField: readElementBox(details.querySelector(".source-control-git-number-field")),
    title: details.querySelector(".source-control-git-details__title")?.textContent?.trim() ?? "",
    description:
      details.querySelector(".source-control-git-details__description")?.textContent?.trim() ?? "",
    value:
      details.getAttribute("data-git-fetch-seconds") ??
      input?.value ??
      input?.getAttribute("value") ??
      "",
    updatePending: details.getAttribute("data-settings-update-pending") === "true",
    unit: details.querySelector(".source-control-git-details__unit")?.textContent?.trim() ?? "",
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
    const favicon = row.querySelector(".sidebar-v2-search-result__favicon, img, svg, x-image");
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
      faviconBox: readElementBox(favicon),
      titleBox: readElementBox(title),
    };
  });
}

function readPaletteRows(elements) {
  return [...elements].slice(0, 6).map((row) => {
    const copy = row.querySelector(".palette-row__copy");
    const titleLine = row.querySelector(".palette-row__title-line");
    const trailing = (copy ?? titleLine)?.nextElementSibling;
    return {
      box: readElementBox(row),
      icon: readElementBox(row.querySelector("[data-file-icon-tone], svg, img, x-image")),
      copy: readElementBox(copy),
      titleLine: readElementBox(titleLine),
      title: readElementBox(row.querySelector(".palette-row__title")),
      description: readElementBox(row.querySelector(".palette-row__description")),
      trailing: readElementBox(trailing),
      trailingLeaf: readElementBox(
        trailing?.querySelector("button, kbd, x-view, x-text, text") ?? trailing,
      ),
    };
  });
}

function readSidebarProjectGroups(root) {
  const list = root?.querySelector(".lynx-sidebar-project-list");
  const group = root?.querySelector(".lynx-sidebar-projects-group");
  return {
    list: readElementBox(list),
    listParent: readElementBox(list?.parentElement),
    group: readElementBox(group),
    rows: [...(root?.querySelectorAll(".sidebar-project-row-reference") ?? [])].map((row) => ({
      title: readComposedText(row.querySelector(".sidebar-project-title-reference")),
      text: readComposedText(row),
      box: readElementBox(row),
    })),
  };
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

function readProjectActionControl(element) {
  if (!element) return null;
  const input = element.matches?.("input, textarea")
    ? element
    : (element.shadowRoot?.querySelector("input, textarea") ?? null);
  return {
    box: readElementBox(input) ?? readElementBox(element),
    value: input?.value ?? element.getAttribute("value") ?? "",
    placeholder: input?.placeholder ?? element.getAttribute("placeholder") ?? null,
    readOnly: input?.readOnly ?? element.hasAttribute("readonly"),
    disabled: input?.disabled ?? element.getAttribute("aria-disabled") === "true",
  };
}

function readProjectActionDialog(root) {
  const lynxDialog = root?.querySelector(".project-action-dialog") ?? null;
  const webDialog = [...(root?.querySelectorAll("[data-slot='dialog-popup']") ?? [])].find(
    (dialog) =>
      readComposedText(dialog.querySelector("[data-slot='dialog-title']")) === "Add Action",
  );
  const dialog = lynxDialog ?? webDialog ?? null;
  if (!dialog) return null;
  const lynxFields = [...dialog.querySelectorAll(".project-action-field")];
  const field = (webId, lynxIndex, lynxSelector) =>
    readProjectActionControl(
      dialog.querySelector(`#${webId}`) ??
        lynxFields[lynxIndex]?.querySelector(lynxSelector) ??
        null,
    );
  const lynxOptions = [...dialog.querySelectorAll(".project-action-option")];
  const webOptions = [...dialog.querySelectorAll("label")].filter((label) => {
    const text = readComposedText(label);
    return (
      text === "Run automatically on worktree creation" ||
      text === "Open preview automatically when this action runs"
    );
  });
  const options = (lynxOptions.length > 0 ? lynxOptions : webOptions).map((option) => {
    const control =
      option.querySelector("[aria-checked]") ??
      option.querySelector("[data-slot='switch']") ??
      option.querySelector("button");
    return {
      label: readComposedText(
        option.querySelector(".project-action-option__label") ?? option.querySelector("span"),
      ),
      box: readElementBox(option),
      checked: control?.getAttribute("aria-checked") === "true",
      disabled:
        option.classList.contains("project-action-option--disabled") ||
        control?.getAttribute("aria-disabled") === "true" ||
        control?.disabled === true,
    };
  });
  const footer =
    dialog.querySelector("[data-slot='dialog-footer']") ??
    dialog.querySelector(".project-action-dialog__footer");
  const fieldLabels = [...dialog.querySelectorAll("label, .project-action-field__label")].filter(
    (label) =>
      ["Name", "Keybinding", "Command", "Preview URL (optional)"].includes(readComposedText(label)),
  );
  const webNameInput = dialog.querySelector("#script-name");
  return {
    rect: readElementBox(dialog),
    title: readComposedText(
      dialog.querySelector("[data-slot='dialog-title'], .project-action-dialog__title"),
    ),
    description: readComposedText(
      dialog.querySelector("[data-slot='dialog-description'], .project-action-dialog__description"),
    ),
    anatomy: {
      backdrop: readElementBox(
        root.querySelector("[data-slot='dialog-backdrop'], .project-action-overlay"),
      ),
      header: readElementBox(
        dialog.querySelector("[data-slot='dialog-header'], .project-action-dialog__header"),
      ),
      title: readElementBox(
        dialog.querySelector("[data-slot='dialog-title'], .project-action-dialog__title"),
      ),
      description: readElementBox(
        dialog.querySelector(
          "[data-slot='dialog-description'], .project-action-dialog__description",
        ),
      ),
      body: readElementBox(
        dialog.querySelector("[data-slot='dialog-panel'], .project-action-dialog__body"),
      ),
      footer: readElementBox(footer),
      close: readElementBox(dialog.querySelector("[aria-label='Close']")),
    },
    fieldLabels: fieldLabels.map((label) => readComposedText(label)),
    fieldAnatomy: fieldLabels.map((label) => {
      const wrapper = label.closest(".project-action-field") ?? label.parentElement;
      return {
        label: readComposedText(label),
        wrapper: readElementBox(wrapper),
        labelBox: readElementBox(label),
        nameRow: readElementBox(
          wrapper?.querySelector(".project-action-field__name-row") ??
            (readComposedText(label) === "Name" ? webNameInput?.parentElement : null),
        ),
        icon: readElementBox(
          wrapper?.querySelector(".project-action-field__icon, [aria-label='Choose icon']"),
        ),
        hint: readElementBox(
          wrapper?.querySelector(".project-action-field__hint, p.text-muted-foreground"),
        ),
      };
    }),
    fields: {
      name: field("script-name", 0, ".project-action-field__input--name"),
      keybinding: field("script-keybinding", 1, ".project-action-field__input"),
      command: field("script-command", 2, ".project-action-field__textarea"),
      previewUrl: field("script-preview-url", 3, ".project-action-field__input"),
    },
    options,
    footerButtons: [...(footer?.querySelectorAll("button, .project-action-dialog__button") ?? [])]
      .map((button) => ({
        label: readComposedText(button),
        box: readElementBox(button),
      }))
      .filter(({ label }) => label),
  };
}

function readProjectSettingsDialog(root) {
  const lynxDialog = root?.querySelector(".project-settings-dialog") ?? null;
  const webDialog = [...(root?.querySelectorAll("[data-slot='dialog-popup']") ?? [])].find(
    (dialog) =>
      readComposedText(dialog.querySelector("[data-slot='dialog-title']")) === "Project settings",
  );
  const dialog = lynxDialog ?? webDialog ?? null;
  if (!dialog) return null;
  const footer =
    dialog.querySelector("[data-slot='dialog-footer']") ??
    dialog.querySelector(".project-settings-dialog__footer");
  const fieldLabels = [...dialog.querySelectorAll("label, .project-settings-field__label")]
    .map((label) =>
      readComposedText(
        label.querySelector(".project-settings-field__label") ??
          label.querySelector("span") ??
          label,
      ),
    )
    .filter((label) => label === "Project name" || label === "Grouping rule");
  return {
    rect: readElementBox(dialog),
    title: readComposedText(
      dialog.querySelector("[data-slot='dialog-title'], .project-settings-dialog__title"),
    ),
    description: readComposedText(
      dialog.querySelector(
        "[data-slot='dialog-description'], .project-settings-dialog__description",
      ),
    ),
    anatomy: {
      backdrop: readElementBox(
        root.querySelector("[data-slot='dialog-backdrop'], .project-settings-overlay"),
      ),
      header: readElementBox(
        dialog.querySelector("[data-slot='dialog-header'], .project-settings-dialog__header"),
      ),
      body: readElementBox(
        dialog.querySelector("[data-slot='dialog-panel'], .project-settings-dialog__body"),
      ),
      footer: readElementBox(footer),
      title: readElementBox(
        dialog.querySelector("[data-slot='dialog-title'], .project-settings-dialog__title"),
      ),
      description: readElementBox(
        dialog.querySelector(
          "[data-slot='dialog-description'], .project-settings-dialog__description",
        ),
      ),
      summary: readElementBox(dialog.querySelector("[data-project-settings-path]")?.parentElement),
      path: readElementBox(dialog.querySelector("[data-project-settings-path]")),
      copyPath: readElementBox(dialog.querySelector("[data-project-settings-copy-path]")),
      environmentIcon: readElementBox(
        dialog.querySelector(
          "[data-project-settings-environment-icon], .project-settings-environment-icon",
        ),
      ),
      environment: readElementBox(dialog.querySelector("[data-project-settings-environment]")),
      fields: readElementBox(dialog.querySelector(".project-settings-fields")),
      fieldColumns: [...dialog.querySelectorAll(".project-settings-field")].map((field) =>
        readElementBox(field),
      ),
    },
    paths: [...dialog.querySelectorAll("[data-project-settings-path]")]
      .map((element) => readComposedText(element))
      .filter(Boolean),
    environments: [...dialog.querySelectorAll("[data-project-settings-environment]")]
      .map((element) => readComposedText(element))
      .filter(Boolean),
    summaryActions: {
      copyPath: dialog.querySelector("[data-project-settings-copy-path]") !== null,
      environmentIcon:
        dialog.querySelector(
          "[data-project-settings-environment-icon], .project-settings-environment-icon",
        ) !== null,
    },
    fieldLabels,
    controls: {
      projectNames: [
        ...dialog.querySelectorAll("[aria-label^='Project name in'], .project-settings-name-input"),
      ].map(readProjectActionControl),
      groupingRules: [
        ...dialog.querySelectorAll(
          "[aria-label^='Grouping rule for'], .project-settings-grouping-trigger",
        ),
      ].map((control) => ({
        box: readElementBox(control),
        text: readComposedText(control),
        ariaLabel: control.getAttribute("aria-label"),
      })),
    },
    removeLabels: [...dialog.querySelectorAll("button, .project-settings-dialog__button")]
      .map((button) => readComposedText(button))
      .filter((label) => label === "Remove project" || label === "Remove all entries"),
    footerButtons: [...(footer?.querySelectorAll("button, .project-settings-dialog__button") ?? [])]
      .map((button) => ({
        label: readComposedText(button),
        box: readElementBox(button),
      }))
      .filter(({ label }) => label),
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
    if (node.tagName === "STYLE" || node.tagName === "SCRIPT") return;
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
  const composedDiffElements = [];
  const visitDiffTree = (node) => {
    for (const child of node?.children ?? []) {
      composedDiffElements.push(child);
      visitDiffTree(child);
      if (child.shadowRoot) visitDiffTree(child.shadowRoot);
    }
  };
  visitDiffTree(codeDiff);
  const composedDiffHeaders = composedDiffElements.filter((element) =>
    element.matches?.("[data-diffs-header], .diff-code-file__header"),
  );
  const composedDiffLines = composedDiffElements.filter((element) =>
    element.matches?.("[data-line], [data-line-type], [data-review-code-line], .diff-code-line"),
  );
  const checkpointCards = [...(root?.querySelectorAll("[data-review-checkpoint-card]") ?? [])];
  const trees = [...(root?.querySelectorAll("[data-review-tree]") ?? [])];
  const terminal =
    root?.querySelector(".terminal-panel") ?? root?.querySelector("[data-terminal-id]");
  const terminalIsWebSurface = terminal?.matches?.("[data-terminal-id]") === true;
  return {
    panelOpen: Boolean(rightPanel),
    panelEmpty: Boolean(emptySurface),
    panelRect: readElementBox(rightPanel),
    emptyRect: readElementBox(emptySurface),
    emptyTitle: readElementBox(emptySurface?.querySelector(".right-panel-empty__title")),
    emptyDescription: readElementBox(
      emptySurface?.querySelector(".right-panel-empty__description"),
    ),
    emptyGrid: readElementBox(emptySurface?.querySelector(".right-panel-empty-grid")),
    activeKind:
      rightPanel?.getAttribute("data-right-panel-active-kind") ??
      (diffSurface ? "diff" : emptySurface ? "empty" : null),
    terminal: terminal
      ? {
          root: readElementBox(terminal),
          sessionId:
            terminal.getAttribute("data-terminal-session-id") ??
            terminal.getAttribute("data-terminal-id"),
          status:
            terminal.getAttribute("data-terminal-session-status") ??
            terminal.getAttribute("data-terminal-status"),
          viewport: readElementBox(
            terminalIsWebSurface ? terminal : terminal.querySelector(".terminal-panel__viewport"),
          ),
          outputText: terminal.querySelector(".terminal-panel__output")?.textContent ?? null,
          output: readElementBox(terminal.querySelector(".terminal-panel__output")),
          commandRow: readElementBox(terminal.querySelector(".terminal-panel__command-row")),
        }
      : null,
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
      statusText: readElementBox(item.querySelector(".turn-diff-card__status")),
      hintText: readElementBox(item.querySelector(".turn-diff-card__hint")),
      openLabel: readElementBox(item.querySelector(".turn-diff-card__open-label")),
      treeRect: readElementBox(item.querySelector("[data-review-tree]")),
      fileNames: [...(item.querySelectorAll(".file-tree-row__name") ?? [])].map(readElementBox),
      fileStats: [...(item.querySelectorAll(".file-tree-row__stat") ?? [])].map(readElementBox),
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
          composedCodeGeometry: {
            headers: composedDiffHeaders.map(readElementBox).filter(Boolean),
            lines: composedDiffLines.map(readElementBox).filter(Boolean),
            gutters: composedDiffElements
              .filter((element) => element.matches?.("[data-column-number]"))
              .map(readElementBox)
              .filter(Boolean),
            contents: composedDiffElements
              .filter((element) => element.matches?.("[data-line]"))
              .map(readElementBox)
              .filter(Boolean),
            lynxNumbers: [...diffSurface.querySelectorAll(".diff-code-line__number")].map(
              readElementBox,
            ),
            lynxMarkers: [...diffSurface.querySelectorAll(".diff-code-line__marker")].map(
              readElementBox,
            ),
            lynxContents: [...diffSurface.querySelectorAll(".diff-code-line__content")].map(
              readElementBox,
            ),
          },
          codeFiles: [...diffSurface.querySelectorAll("[data-review-code-file]")].map((item) => ({
            path: item.getAttribute("data-review-code-file"),
            expanded: item.getAttribute("data-review-file-expanded"),
            rect: readElementBox(item),
            headerRect: readElementBox(
              item.querySelector(".diff-code-file__header, [data-diffs-header]"),
            ),
            chevronRect: readElementBox(item.querySelector(".diff-code-file__chevron")),
            changeIconRect: readElementBox(
              item.querySelector(".diff-code-file__change-icon, [data-change-icon]"),
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
    const primaryAction = root?.querySelector(
      '[data-pending-question-action="next"], [data-pending-question-action="submit"]',
    );
    const previousAction = root?.querySelector('[data-pending-question-action="previous"]');
    const options = question.querySelector(".composer-pending-question__options");
    return {
      kind: "question",
      text: question.textContent?.trim().replace(/\s+/g, " ") ?? "",
      detail: null,
      questionIndex: Number(question.getAttribute("data-question-index") ?? "0"),
      questionCount: Number(question.getAttribute("data-question-count") ?? "1"),
      multiSelect: question.getAttribute("data-question-multi-select") === "true",
      geometry: {
        panel: readElementBox(question),
        heading: readElementBox(question.querySelector(".composer-pending-question__heading")),
        prompt: readElementBox(question.querySelector(".composer-pending-question__prompt")),
        hint: readElementBox(
          [...question.children].find((child) =>
            child.textContent?.includes("Select one or more options."),
          ),
        ),
        options: readElementBox(options),
        optionRows: [...(options?.querySelectorAll("[data-question-option]") ?? [])].map(
          readElementBox,
        ),
        primaryAction: readElementBox(primaryAction),
        previousAction: readElementBox(previousAction),
      },
      options: [...question.querySelectorAll("[data-question-option]")].map((item) => ({
        label: item.getAttribute("data-question-option"),
        selected: item.getAttribute("data-question-option-selected") === "true",
      })),
      primaryAction: primaryAction
        ? {
            action: primaryAction.getAttribute("data-pending-question-action"),
            disabled:
              primaryAction.disabled === true ||
              primaryAction.getAttribute("aria-disabled") === "true",
            text: primaryAction.textContent?.trim().replace(/\s+/g, " ") ?? "",
          }
        : null,
      previousAction: previousAction
        ? {
            disabled:
              previousAction.disabled === true ||
              previousAction.getAttribute("aria-disabled") === "true",
          }
        : null,
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
      const rowElements = [];
      const visitRow = (node) => {
        for (const child of node?.children ?? []) {
          rowElements.push(child);
          visitRow(child);
          if (child.shadowRoot) visitRow(child.shadowRoot);
        }
      };
      visitRow(row);
      const composedName = rowElements
        .filter(
          (element) =>
            element.children.length === 0 &&
            !/^[…▸◆]+$/u.test(element.textContent?.trim() ?? "") &&
            element.getBoundingClientRect().width > 0,
        )
        .sort(
          (left, right) =>
            (right.textContent?.trim().length ?? 0) - (left.textContent?.trim().length ?? 0) ||
            right.getBoundingClientRect().width - left.getBoundingClientRect().width,
        )[0];
      const name =
        row.querySelector?.(".file-tree-row__name") ??
        rowElements.find((element) => element.matches?.(".file-tree-row__name")) ??
        composedName ??
        null;
      const icon =
        rowElements.find((element) => element.getAttribute?.("data-pierre-icon")) ??
        rowElements.find((element) => element.getAttribute?.("data-file-icon-tone")) ??
        rowElements.find((element) => element.tagName?.toLowerCase() === "use") ??
        null;
      return {
        text:
          row.getAttribute("aria-label") ??
          name?.textContent?.trim() ??
          row.textContent?.trim().replace(/\s+/g, " ") ??
          "",
        box: readElementBox(row),
        name: readElementBox(name),
        icon: icon
          ? {
              pierre: icon.getAttribute("data-pierre-icon"),
              token: icon.getAttribute("data-icon-token"),
              href: icon.getAttribute("href") ?? icon.getAttribute("xlink:href"),
              tone: icon.getAttribute("data-file-icon-tone"),
              label: icon.textContent?.trim() ?? "",
              box: readElementBox(icon),
            }
          : null,
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
  const composedElements = [];
  const visit = (node) => {
    for (const child of node?.children ?? []) {
      composedElements.push(child);
      visit(child);
      if (child.shadowRoot) visit(child.shadowRoot);
    }
  };
  visit(editor);
  const contentEditable =
    composedElements.find((element) =>
      element.matches?.('[contenteditable="true"], [contenteditable="plaintext-only"]'),
    ) ?? null;
  const editorInner =
    editor?.shadowRoot?.querySelector("textarea") ??
    editor?.querySelector?.("textarea") ??
    contentEditable ??
    editor?.querySelector?.("[data-line]") ??
    null;
  const projectedLines = [...(lynxSurface?.querySelectorAll(".file-editor-line__content") ?? [])];
  const projectedLineNumbers = [
    ...(lynxSurface?.querySelectorAll(".file-editor-line__number") ?? []),
  ];
  const webFirstLineContent =
    composedElements.find(
      (element) =>
        contentEditable?.contains(element) &&
        element.matches?.('[data-line="1"][data-line-index="0"]'),
    ) ?? null;
  const webFirstLineNumber =
    composedElements.find((element) =>
      element.matches?.('[data-column-number="1"][data-line-index="0"]'),
    ) ?? null;
  const editorValue =
    typeof editor?.value === "string"
      ? editor.value
      : typeof editorInner?.value === "string"
        ? editorInner.value
        : (contentEditable?.innerText ??
          (projectedLines.length > 0
            ? projectedLines.map((line) => readComposedText(line)).join("\n")
            : readComposedText(editor)));
  const explorer =
    root?.querySelector("[data-file-browser-panel]") ??
    lynxSurface?.querySelector(".file-panel__explorer") ??
    lynxSurface?.querySelector(".files-panel__browser");
  const activeTab = root?.querySelector('[data-active-tab="true"]');
  const statusbar = lynxSurface?.querySelector(".file-panel__statusbar");
  const saveError = root?.querySelector(
    '[data-file-save-error]:not([data-file-save-error="false"])',
  );
  const saveErrorLabel =
    root?.querySelector(".files-panel__preview-status--error") ??
    saveError?.querySelector("span") ??
    null;
  const saveRetry = root?.querySelector(
    '[data-file-save-retry]:not([data-file-save-retry="false"])',
  );
  const contentRevisionHost =
    lynxSurface?.querySelector("[data-file-content-revision]") ??
    editor?.closest?.("[data-file-content-revision]") ??
    contentEditable?.closest?.("[data-file-content-revision]");
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
  const editorBox = readElementBox(editor);
  const editorInnerBox = readElementBox(editorInner);
  const firstLineNumberBox = readElementBox(projectedLineNumbers[0] ?? webFirstLineNumber);
  const firstLineContentBox = readElementBox(projectedLines[0] ?? webFirstLineContent);
  const gutterWidth =
    firstLineNumberBox?.rect?.width ??
    (editorBox?.rect && editorInnerBox?.rect ? editorInnerBox.rect.x - editorBox.rect.x : null);
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
    breadcrumbList: readElementBox(
      lynxSurface?.querySelector(".file-panel__breadcrumb-list") ??
        webBreadcrumbs?.querySelector("[data-slot='scroll-area-viewport'] > div"),
    ),
    breadcrumbParts: [...(lynxSurface?.querySelectorAll(".file-panel__breadcrumb-part") ?? [])].map(
      readElementBox,
    ),
    breadcrumbText,
    currentFile,
    editor: editorBox,
    editorInner: editorInnerBox,
    firstLineNumber: firstLineNumberBox,
    firstLineContent: firstLineContentBox ?? editorInnerBox,
    gutterWidth,
    editorKernel:
      editorInner?.tagName?.toLowerCase() ??
      (contentEditable?.isContentEditable ? "contenteditable" : null),
    editorMode:
      editor?.getAttribute("data-file-editor-mode") ??
      (contentEditable?.isContentEditable ? "editing" : "preview"),
    editorValueLength: editorValue.length,
    editorValueIncludesFidelitySentinel: editorValue.includes("T3_FILE_SAVE_FIDELITY_SENTINEL"),
    editorValueTail: editorValue.slice(-256),
    contentRevision: contentRevisionHost?.getAttribute("data-file-content-revision") ?? null,
    explorer: readElementBox(explorer),
    back: readElementBox(root?.querySelector('[aria-label="Back to workspace files"]')),
    pending: activeTab?.getAttribute("data-pending-tab") === "true",
    statusbar: readElementBox(statusbar),
    statusbarText: readComposedText(statusbar),
    saveError: readElementBox(saveError),
    saveErrorText: readComposedText(saveError),
    saveErrorLabel: readElementBox(saveErrorLabel),
    saveErrorLabelText: readComposedText(saveErrorLabel),
    saveRetry: readElementBox(saveRetry),
    saveRetryText: readComposedText(saveRetry),
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
const webEntry =
  expectedSemanticRoute === "components-lab" ? webRoute : pairingToken ? `/pair${webHash}` : `/`;
webPane.srcdoc = `<!doctype html><script>
localStorage.setItem("t3code:theme", ${JSON.stringify(theme)});
if (${JSON.stringify(requestedSidebarWidth)} !== null) {
  localStorage.setItem(
    "chat_thread_sidebar_width",
    JSON.stringify(${JSON.stringify(requestedSidebarWidth)}),
  );
}
if (${JSON.stringify(requestedRightPanelWidth)} !== null) {
  localStorage.setItem(
    "t3code:preview-panel-width",
    JSON.stringify(${JSON.stringify(requestedRightPanelWidth)}),
  );
}
localStorage.setItem(
  "t3code:client-settings:v1",
  JSON.stringify({
    legacySidebarEnabled: ${JSON.stringify(legacySidebarEnabled)},
    ...(${JSON.stringify(betaMutationEnabled)}
      ? { sidebarV2Enabled: true, sidebarAutoSettleAfterDays: 3 }
      : {}),
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
  legacySidebarEnabled: String(legacySidebarEnabled),
  betaMutationEnabled: String(betaMutationEnabled),
});
if (requestedModelSelection) {
  lynxQuery.set("modelSelection", JSON.stringify(requestedModelSelection));
}
if (initialOverlay) {
  lynxQuery.set("initialOverlay", initialOverlay);
}
if (requestedSidebarWidth !== null) {
  lynxQuery.set("sidebarWidth", String(requestedSidebarWidth));
}
if (requestedRightPanelWidth !== null) {
  lynxQuery.set("rightPanelWidth", String(requestedRightPanelWidth));
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
    const projectActionDialog = readProjectActionDialog(root);
    const projectSettingsDialog = readProjectSettingsDialog(root);
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
                : root?.querySelector(".right-panel__add-menu") !== null
                  ? "right-panel-add-menu"
                  : root?.querySelector(".diff-panel-header__scope-menu") !== null
                    ? "diff-scope-menu"
                    : projectSettingsDialog !== null
                      ? "project-settings-dialog"
                      : projectActionDialog !== null
                        ? "project-action-dialog"
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
                : overlay === "right-panel-add-menu"
                  ? root?.querySelector(".right-panel__add-menu")
                  : overlay === "diff-scope-menu"
                    ? root?.querySelector(".diff-panel-header__scope-menu")
                    : overlay === "project-settings-dialog"
                      ? root?.querySelector(".project-settings-dialog")
                      : overlay === "project-action-dialog"
                        ? root?.querySelector(".project-action-dialog")
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
    const rightPanelAddTriggerElement = root?.querySelector(".right-panel__add-btn") ?? null;
    const diffScopeTriggerElement =
      root?.querySelector('[data-floating-anchor="diff-scope-menu"]') ?? null;
    const settingsRoute = expectedSemanticRoute.startsWith("settings-");
    const quickSwitchInput = root?.querySelector(".qs-search__input") ?? null;
    const modelPickerInput = root?.querySelector(".picker-search__input") ?? null;
    const modelPickerContent = root?.querySelector(".model-picker-content") ?? null;
    const composerFrame = root?.querySelector(".composer-frame") ?? null;
    const composerEditorHost = root?.querySelector('[data-composer-editor="true"]') ?? null;
    const composerPrimaryAction = root?.querySelector("[data-composer-primary-state]") ?? null;
    const chatSurface = root?.querySelector(".chat-view-surface-reference") ?? null;
    const pendingRequestMetrics = readPendingRequestMetrics(root);
    const composerControlElements = [...(root?.querySelectorAll("[data-composer-control]") ?? [])];
    const composerInteractionControl =
      composerControlElements.find(
        (item) => item.getAttribute("data-composer-control") === "interaction",
      ) ?? null;
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
            : overlay === "right-panel-add-menu"
              ? rightPanelAddTriggerElement
              : overlay === "diff-scope-menu"
                ? diffScopeTriggerElement
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
      heroMetrics: readHeroMetrics(root),
      componentLabMetrics: readComponentLabMetrics(root),
      providerStatusBannerMetrics: readProviderStatusBannerMetrics(root),
      threadErrorBannerMetrics: readThreadErrorBannerMetrics(root),
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
        activeThreadKind: chatSurface?.getAttribute("data-active-thread-kind") ?? null,
        activeThreadId: chatSurface?.getAttribute("data-active-thread-id") ?? null,
        connectionStatus: chatSurface?.getAttribute("data-connection-status") ?? null,
        connectionStatusDetail: chatSurface?.getAttribute("data-connection-status-detail") ?? null,
        selectedModel: null,
        visibleModelLabel,
        interactionMode:
          composerInteractionControl?.textContent?.trim() === "Plan" ? "plan" : "default",
        lifecycle: d.connector?.connected ? "ready" : "connecting",
        overlay,
        overlayQuery:
          overlay === "quick-switch" || overlay === "file-picker"
            ? lynxInputValue(quickSwitchInput)
            : overlay === "model-picker"
              ? lynxInputValue(modelPickerInput)
              : "",
        sidebarVersion:
          root?.querySelector("[data-app-sidebar]")?.getAttribute("data-sidebar-version") ?? null,
      },
      overlayMetrics: {
        rect: overlayRect,
        triggerRect: modelTriggerRect,
        triggerLabel: overlayTriggerElement?.textContent?.trim() ?? null,
        paletteView: paletteElement?.getAttribute("data-quick-switch-view") ?? null,
        activeRowLabels: [...(root?.querySelectorAll('[data-palette-active="true"]') ?? [])].map(
          (row) => readComposedText(row),
        ),
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
                rows: readPaletteRows(root?.querySelectorAll("[data-palette-row='true']") ?? []),
                empty: readElementBox(root?.querySelector(".palette-empty")),
                emptyText: readElementBox(root?.querySelector(".palette-empty-text")),
                footer: readElementBox(root?.querySelector(".palette-footer")),
                footerGroups: [
                  ...(root?.querySelectorAll(".palette-footer .quick-switch-footer-group") ?? []),
                ].map((group) => ({
                  box: readElementBox(group),
                  children: [...group.children].map((child) => readElementBox(child)),
                })),
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
                  ? (() => {
                      const rows = [
                        ...(root?.querySelectorAll(".composer-compact-controls-menu__item") ?? []),
                      ];
                      return {
                        panel: readElementBox(overlayElement),
                        scroll: readElementBox(
                          root?.querySelector(".composer-compact-controls-menu__scroll"),
                        ),
                        content: readElementBox(
                          root?.querySelector(".composer-compact-controls-menu__content"),
                        ),
                        contentChildren: [
                          ...(root?.querySelector(".composer-compact-controls-menu__content")
                            ?.children ?? []),
                        ].map((child) => readElementBox(child)),
                        wrappers: [
                          ...(root?.querySelectorAll(
                            ".composer-compact-controls-menu__content lynx-wrapper",
                          ) ?? []),
                        ].map((wrapper) => readElementBox(wrapper)),
                        sections: [
                          ...(root?.querySelectorAll(".composer-compact-controls-menu__section") ??
                            []),
                        ].map((section) => readElementBox(section)),
                        sectionLabel: readElementBox(
                          root?.querySelector(".composer-compact-controls-menu__section-label"),
                        ),
                        row: readElementBox(
                          root?.querySelector(".composer-compact-controls-menu__item"),
                        ),
                        firstRow: readElementBox(rows[0]),
                        lastRow: readElementBox(rows.at(-1)),
                        rows: rows.map((row) => readElementBox(row)),
                        sectionLabels: [
                          ...(root?.querySelectorAll(
                            ".composer-compact-controls-menu__section-label",
                          ) ?? []),
                        ].map((label) => readElementBox(label)),
                        separators: [
                          ...(root?.querySelectorAll(
                            ".composer-compact-controls-menu__separator",
                          ) ?? []),
                        ].map((separator) => readElementBox(separator)),
                        dismiss: readElementBox(
                          root?.querySelector(".composer-compact-controls-dismiss"),
                        ),
                      };
                    })()
                  : overlay === "right-panel-add-menu"
                    ? {
                        panel: readElementBox(overlayElement),
                        rows: [...(root?.querySelectorAll(".right-panel__add-item") ?? [])].map(
                          (row) => ({
                            kind: row.getAttribute("data-right-panel-add-kind"),
                            label:
                              row
                                .querySelector(".right-panel__add-item-label")
                                ?.textContent?.trim() ?? "",
                            disabled: row.classList.contains("right-panel__add-item--disabled"),
                            rect: readElementBox(row),
                            icon: readElementBox(
                              row.querySelector(".right-panel__add-item-icon, image, img, svg"),
                            ),
                            labelBox: readElementBox(
                              row.querySelector(".right-panel__add-item-label, text, x-text"),
                            ),
                          }),
                        ),
                      }
                    : overlay === "diff-scope-menu"
                      ? {
                          panel: readElementBox(overlayElement),
                          rows: [
                            ...(root?.querySelectorAll(".diff-panel-header__scope-item") ?? []),
                          ].map((row) => ({
                            label:
                              row
                                .querySelector(".diff-panel-header__scope-item-label")
                                ?.textContent?.trim() ??
                              row.textContent?.trim() ??
                              "",
                            active: row.classList.contains("diff-panel-header__scope-item--active"),
                            rect: readElementBox(row),
                          })),
                        }
                      : overlay === "project-settings-dialog"
                        ? projectSettingsDialog
                        : overlay === "project-action-dialog"
                          ? projectActionDialog
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
                  box: readElementBox(item),
                  icon: readElementBox(
                    item.querySelector(".model-picker-rail-icon, image, img, svg"),
                  ),
                };
              })
            : [],
        rowLabels:
          overlay === "quick-switch" || overlay === "file-picker"
            ? [...(root?.querySelectorAll('[data-palette-row="true"]') ?? [])].map((row) =>
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
                    : overlay === "right-panel-add-menu"
                      ? [...(root?.querySelectorAll(".right-panel__add-item") ?? [])].map((row) =>
                          row.querySelector(".right-panel__add-item-label")?.textContent?.trim(),
                        )
                      : overlay === "diff-scope-menu"
                        ? [...(root?.querySelectorAll(".diff-panel-header__scope-item") ?? [])].map(
                            (row) =>
                              row
                                .querySelector(".diff-panel-header__scope-item-label")
                                ?.textContent?.trim() ?? row.textContent?.trim(),
                          )
                        : [],
        modelPickerRows:
          overlay === "model-picker"
            ? readModelPickerRows(root?.querySelectorAll(".model-picker-row") ?? [])
            : [],
        rowCount:
          overlay === "quick-switch" || overlay === "file-picker"
            ? (root?.querySelectorAll('[data-palette-row="true"]').length ?? 0)
            : overlay === "model-picker"
              ? (root?.querySelectorAll(".model-picker-row").length ?? 0)
              : overlay === "project-scope"
                ? (root?.querySelectorAll(".lynx-menu-radio-item").length ?? 0)
                : overlay === "workspace-menu"
                  ? (root?.querySelectorAll(".composer-workspace-menu__item").length ?? 0)
                  : overlay === "compact-controls"
                    ? (root?.querySelectorAll(".composer-compact-controls-menu__item").length ?? 0)
                    : overlay === "right-panel-add-menu"
                      ? (root?.querySelectorAll(".right-panel__add-item").length ?? 0)
                      : overlay === "diff-scope-menu"
                        ? (root?.querySelectorAll(".diff-panel-header__scope-item").length ?? 0)
                        : overlay === "project-settings-dialog"
                          ? (projectSettingsDialog?.fieldLabels.length ?? 0)
                          : overlay === "project-action-dialog"
                            ? (projectActionDialog?.fieldLabels.length ?? 0)
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
          settingsFooter: readSettingsNavigationChrome(root).footer,
          settingsBack: readSettingsNavigationChrome(root).back,
          settingsBackLabel: readSettingsNavigationChrome(root).backLabel,
          settingsRow: readElementBox(root?.querySelector(".sidebar-settings-row")),
          settingsAuthority: readElementBox(root?.querySelector(".sidebar-settings-authority")),
          searchRow: readElementBox(root?.querySelector(".sidebar-v2-control-row--search")),
          searchPrimary: readElementBox(root?.querySelector(".sidebar-v2-control-primary")),
          search: readElementBox(
            root?.querySelector('[aria-label="Search threads"], .sidebar-inline-search'),
          ),
          searchText: (() => {
            const host = root?.querySelector('[aria-label="Search threads"]');
            return (
              host?.shadowRoot?.querySelector("input")?.placeholder ??
              host?.getAttribute("placeholder") ??
              host?.textContent?.trim() ??
              ""
            );
          })(),
          newThread: readElementBox(root?.querySelector(".sidebar-v2-new-thread")),
          projectScopeRow: readElementBox(
            root?.querySelector(".sidebar-v2-project-scope-host")?.parentElement,
          ),
          projectScopeHost: readElementBox(root?.querySelector(".sidebar-v2-project-scope-host")),
          projectScope: readElementBox(
            root?.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]'),
          ),
          projectScopeOptions: [
            ...(root?.querySelectorAll("[data-sidebar-project-scope-option]") ?? []),
          ].map((option) => ({
            scopeKey: option.getAttribute("data-sidebar-project-scope-option"),
            text: readComposedText(option),
            box: readElementBox(option),
            actions: [
              ...option.querySelectorAll(
                "[data-sidebar-project-action], [aria-label^='Project actions for']",
              ),
            ].map((action) => ({
              ariaLabel: action.getAttribute("aria-label"),
              box: readElementBox(action),
            })),
          })),
          newProject: readElementBox(root?.querySelector(".sidebar-v2-new-project")),
        },
        search: (() => {
          const host = root?.querySelector('[aria-label="Search threads"]');
          const input = host?.shadowRoot?.querySelector("input") ?? null;
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
            value: input?.value ?? host?.value ?? host?.getAttribute("value") ?? "",
            inputBox: readElementBox(input ?? host),
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
              statusBannerText:
                root
                  ?.querySelector(
                    "[data-connection-lifecycle-phase], .connection-lifecycle-banner-reference, [data-composer-settled-banner]",
                  )
                  ?.textContent?.trim() ?? null,
              statusTitleText:
                (
                  root?.querySelector("[data-connection-lifecycle-title]") ??
                  root?.querySelector(".composer-settled-banner__title")
                )?.textContent?.trim() ?? null,
              statusDescriptionText:
                (
                  root?.querySelector("[data-connection-lifecycle-description]") ??
                  root?.querySelector(".composer-settled-banner__description")
                )?.textContent?.trim() ?? null,
              statusActionText:
                (
                  root?.querySelector("[data-connection-lifecycle-actions]") ??
                  root?.querySelector(".composer-settled-banner__action")
                )?.textContent?.trim() ?? null,
              statusBanner: readElementBox(
                root?.querySelector(
                  "[data-connection-lifecycle-phase], .connection-lifecycle-banner-reference, [data-composer-settled-banner]",
                ),
              ),
              statusCopy: readElementBox(
                root?.querySelector("[data-connection-lifecycle-copy]") ??
                  root?.querySelector(".composer-settled-banner__copy"),
              ),
              statusTitle: readElementBox(
                root?.querySelector("[data-connection-lifecycle-title]") ??
                  root?.querySelector(".composer-settled-banner__title"),
              ),
              statusDescription: readElementBox(
                root?.querySelector("[data-connection-lifecycle-description]") ??
                  root?.querySelector(".composer-settled-banner__description"),
              ),
              statusAction: readElementBox(
                root?.querySelector("[data-connection-lifecycle-actions]") ??
                  root?.querySelector(".composer-settled-banner__action"),
              ),
              statusReconnect: readElementBox(
                root?.querySelector("[data-connection-lifecycle-reconnect]"),
              ),
              statusConnections: readElementBox(
                root?.querySelector("[data-connection-lifecycle-connections]"),
              ),
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
              primaryAction: readComposerPrimaryAction(
                root?.querySelector(".composer-primary-actions"),
              ),
              interactionSeparator: readComposerInteractionSeparator(
                root,
                composerInteractionControl,
              ),
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
        minimap: readElementBox(root?.querySelector("[data-timeline-minimap]")),
        minimapItems: [...(root?.querySelectorAll("[data-timeline-minimap-item]") ?? [])].map(
          (item) => readElementBox(item),
        ),
        minimapPreview: readElementBox(root?.querySelector("[data-timeline-minimap-preview]")),
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
          userMeta: readElementBox(root?.querySelector(".transcript-user-meta")),
          assistantMeta: readElementBox(root?.querySelector(".transcript-assistant-meta")),
          changedFilesCard: readElementBox(root?.querySelector(".turn-diff-card")),
          changedFilesHeader: readElementBox(root?.querySelector(".turn-diff-card__header")),
          changedFilesPreview: readElementBox(root?.querySelector(".turn-diff-card__preview")),
          changedFilesBody: readElementBox(root?.querySelector(".lynx-changed-files-tree")),
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
          turnFold: readElementBox(root?.querySelector(".transcript-turn-fold")),
          workEntryLine: readElementBox(root?.querySelector(".transcript-work-entry-line")),
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
            box: readElementBox(item),
            ancestors: readElementAncestors(item),
            line: readElementBox(item.querySelector(".transcript-work-entry-line")),
            icon: readElementBox(item.querySelector(".transcript-work-entry-icon")),
            iconImage: readElementBox(
              item.querySelector(
                ".transcript-work-entry-icon image, .transcript-work-entry-icon x-image",
              ),
            ),
            heading: readElementBox(item.querySelector(".transcript-work-entry-heading")),
            preview: readElementBox(item.querySelector(".transcript-work-entry-preview")),
            body: readElementBox(item.querySelector(".transcript-work-entry-body")),
            bodyText: readElementBox(
              item.querySelector(".transcript-work-entry-body .whitespace-pre-wrap"),
            ),
            detail: item.querySelector(".transcript-work-entry-body")?.textContent?.trim() ?? "",
          }),
        ),
      },
      headerMetrics: {
        root: readElementBox(root?.querySelector("[data-chat-header]")),
        content: readElementBox(root?.querySelector(".topbar__content")),
        project: readElementBox(root?.querySelector(".chat-header-project-group")),
        projectIcon: readElementBox(root?.querySelector(".chat-header-project-icon-reference")),
        thread: readElementBox(root?.querySelector(".topbar__thread")),
        actions: readElementBox(root?.querySelector("[data-chat-header-actions]")),
        actionItems: readHeaderActionItems(root?.querySelectorAll("[data-header-action]") ?? []),
      },
      gitPublishDialog: readGitPublishDialog(root),
      addProviderDialog: readAddProviderDialog(root),
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
            const settingsSections = [
              ...(settingsPanel?.querySelectorAll(
                ":scope > .source-control-section, :scope > .settings-section",
              ) ?? []),
            ];
            const settingsRowIds = SETTINGS_ANCHOR_BY_ROUTE[expectedSemanticRoute] ?? [];
            return {
              navigationLabels: [
                ...(root?.querySelectorAll(".settings-nav__item-label") ?? []),
              ].map((item) => item.textContent?.trim()),
              navigationItems: readSettingsNavigationItems(root),
              scroll: readSettingsScroll(root),
              topbar: readSettingsTopbar(root),
              rowIds: settingsRowIds.filter((id) => root?.getElementById(id)),
              rows: readSettingsRows(root, settingsRowIds),
              legacySidebar: readLegacySidebarSettings(root),
              betaMutation: readBetaMutationSettings(root),
              connectionsMutation: readConnectionsMutationSettings(root),
              keybindings:
                expectedSemanticRoute === "settings-keybindings"
                  ? readKeybindingsMetrics(root)
                  : null,
              providers:
                expectedSemanticRoute === "settings-providers"
                  ? readProviderSettingsMetrics(root)
                  : null,
              sectionTitles: settingsSections.map((item) =>
                item.querySelector(".settings-section__title")?.textContent?.trim(),
              ),
              sectionTexts: settingsSections.map(
                (item) => item.textContent?.trim().replace(/\s+/g, " ") ?? "",
              ),
              geometry: {
                root: readElementBox(root?.querySelector(".settings-root")),
                navigation: readElementBox(root?.querySelector(".settings-nav")),
                main: readElementBox(root?.querySelector(".settings-main")),
                content: readElementBox(settingsContent),
                panel: readElementBox(settingsPanel),
                sourceControlEmpty: readElementBox(
                  root?.querySelector('[data-slot="empty"], .source-control-empty'),
                ),
                sourceControlEmptyMedia: readElementBox(
                  root?.querySelector('[data-slot="empty-media"], .source-control-empty__media'),
                ),
                sourceControlEmptyHeader: readElementBox(
                  root?.querySelector('[data-slot="empty-header"], .source-control-empty__header'),
                ),
                sourceControlEmptyTitle: readElementBox(
                  root?.querySelector('[data-slot="empty-title"], .source-control-empty__title'),
                ),
                sourceControlEmptyDescription: readElementBox(
                  root?.querySelector(
                    '[data-slot="empty-description"], .source-control-empty__description',
                  ),
                ),
                sourceControlEmptyContent: readElementBox(
                  root?.querySelector("[data-source-control-retry]"),
                ),
                sourceControlRetryButton: readElementBox(
                  root?.querySelector("[data-source-control-retry] .ui-button"),
                ),
                sourceControlRetryLabel: readElementBox(
                  root?.querySelector("[data-source-control-retry] .ui-button__label"),
                ),
                panelAncestors: readElementAncestors(settingsPanel),
                sections: settingsSections.map((item) => ({
                  title: item.querySelector(".settings-section__title")?.textContent?.trim() ?? "",
                  box: readElementBox(item),
                  rows: readElementBox(item.querySelector(".settings-section__rows")),
                })),
                sourceControlRows: readSourceControlRows(root),
                settingsRows: [...(root?.querySelectorAll('[data-settings-row="true"]') ?? [])].map(
                  readSettingsRowGeometry,
                ),
                loadingRows: [
                  ...(root?.querySelectorAll("[data-source-control-loading-row]") ?? []),
                ].map((item) => ({
                  id: item.getAttribute("data-source-control-loading-row"),
                  box: readElementBox(item),
                  layout: readElementBox(item.querySelector(".source-control-loading-row__layout")),
                  copy: readElementBox(item.querySelector(".source-control-loading-row__copy")),
                  headline: readElementBox(
                    item.querySelector(".source-control-loading-row__headline"),
                  ),
                  actions: readElementBox(
                    item.querySelector(".source-control-loading-row__actions"),
                  ),
                  parts: ["icon", "dot", "label", "badge", "detail", "button", "switch"].map(
                    (part) => ({
                      part,
                      box: readElementBox(
                        item.querySelector(`.source-control-loading-row__${part}`),
                      ),
                    }),
                  ),
                })),
              },
              sourceControlRows: [...(root?.querySelectorAll(".source-control-item") ?? [])].map(
                (item) => item.textContent?.trim(),
              ),
              sourceControlRowMetrics: readSourceControlRows(root),
              sourceControlDetails: readSourceControlDetails(root),
              emptyTexts: [...(root?.querySelectorAll(".settings-empty__text") ?? [])].map((item) =>
                item.textContent?.trim(),
              ),
              errorTexts: [...(root?.querySelectorAll("[data-source-control-error]") ?? [])].map(
                (item) => item.textContent?.trim(),
              ),
              sourceControlEmptyTitles: [
                ...(root?.querySelectorAll(
                  '[data-slot="empty-title"], .source-control-empty__title',
                ) ?? []),
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
      sidebarProjectGroups: readSidebarProjectGroups(root),
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
    const projectActionDialog = readProjectActionDialog(doc);
    const projectSettingsDialog = readProjectSettingsDialog(doc);
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
                : doc.querySelector('[data-floating-popup="right-panel-add-menu"]') !== null
                  ? "right-panel-add-menu"
                  : doc.querySelector('[data-floating-popup="diff-scope-menu"]') !== null
                    ? "diff-scope-menu"
                    : projectSettingsDialog !== null
                      ? "project-settings-dialog"
                      : projectActionDialog !== null
                        ? "project-action-dialog"
                        : null;
    const modelTriggerElement =
      doc.querySelector('[data-chat-provider-model-picker="true"]') ?? null;
    const projectScopeTriggerElement =
      doc.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]') ?? null;
    const workspaceTriggerElement =
      doc.querySelector('[data-floating-anchor="composer-workspace-menu"]') ?? null;
    const compactControlsTriggerElement =
      doc.querySelector('[data-floating-anchor="composer-compact-controls-menu"]') ?? null;
    const rightPanelAddTriggerElement =
      doc.querySelector('[data-floating-anchor="right-panel-add-menu"]') ?? null;
    const diffScopeTriggerElement =
      doc.querySelector('[data-floating-anchor="diff-scope-menu"]') ?? null;
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
            : overlay === "right-panel-add-menu"
              ? rightPanelAddTriggerElement
              : overlay === "diff-scope-menu"
                ? diffScopeTriggerElement
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
                : overlay === "right-panel-add-menu"
                  ? doc.querySelector('[data-floating-popup="right-panel-add-menu"]')
                  : overlay === "diff-scope-menu"
                    ? doc.querySelector('[data-floating-popup="diff-scope-menu"]')
                    : overlay === "project-settings-dialog"
                      ? projectSettingsDialog?.rect
                        ? [...doc.querySelectorAll("[data-slot='dialog-popup']")].find(
                            (dialog) =>
                              readComposedText(
                                dialog.querySelector("[data-slot='dialog-title']"),
                              ) === "Project settings",
                          )
                        : null
                      : overlay === "project-action-dialog"
                        ? projectActionDialog?.rect
                          ? [...doc.querySelectorAll("[data-slot='dialog-popup']")].find(
                              (dialog) =>
                                readComposedText(
                                  dialog.querySelector("[data-slot='dialog-title']"),
                                ) === "Add Action",
                            )
                          : null
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
    const rightPanelAddRows =
      overlay === "right-panel-add-menu"
        ? ["Browser", "Terminal", "Files", "Diff"]
            .map((label) => {
              const panelRect = overlayElement?.getBoundingClientRect();
              const candidates = [
                ...doc.querySelectorAll(
                  '[data-slot="menu-item"], [data-slot="tooltip-trigger"], [role="menuitem"]',
                ),
              ].filter((row) => {
                const rowRect = row.getBoundingClientRect();
                return (
                  panelRect &&
                  row.textContent?.trim() === label &&
                  rowRect.width > 0 &&
                  rowRect.height > 0 &&
                  rowRect.x >= panelRect.x &&
                  rowRect.y >= panelRect.y &&
                  rowRect.x + rowRect.width <= panelRect.x + panelRect.width &&
                  rowRect.y + rowRect.height <= panelRect.y + panelRect.height
                );
              });
              return candidates.sort((left, right) => {
                const leftRect = left.getBoundingClientRect();
                const rightRect = right.getBoundingClientRect();
                return leftRect.width * leftRect.height - rightRect.width * rightRect.height;
              })[0];
            })
            .filter(Boolean)
        : [];
    const modelPickerContent =
      overlay === "model-picker" ? doc.querySelector("[data-model-picker-content]") : null;
    const commandInput = commandPaletteElement?.querySelector('[data-slot="autocomplete-input"]');
    const commandResults =
      commandPaletteElement?.querySelector('[data-slot="command-list"]') ??
      commandPaletteElement?.querySelector(".palette-empty")?.parentElement;
    const composerFrame = doc.querySelector(".composer-frame");
    const composerEditor = doc.querySelector('[data-composer-editor="true"]');
    const composerPrimaryAction = doc.querySelector("[data-composer-primary-state]");
    const chatSurface = doc.querySelector(".chat-view-surface-reference");
    const composerControlElements = [...doc.querySelectorAll("[data-composer-control]")];
    const composerInteractionControl =
      composerControlElements.find(
        (item) => item.getAttribute("data-composer-control") === "interaction",
      ) ?? null;
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
      heroMetrics: readHeroMetrics(doc),
      componentLabMetrics: readComponentLabMetrics(doc),
      providerStatusBannerMetrics: readProviderStatusBannerMetrics(doc),
      threadErrorBannerMetrics: readThreadErrorBannerMetrics(doc),
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
        activeThreadKind: chatSurface?.getAttribute("data-active-thread-kind") ?? null,
        activeThreadId: chatSurface?.getAttribute("data-active-thread-id") ?? null,
        selectedModel: null,
        visibleModelLabel,
        interactionMode:
          composerInteractionControl?.textContent?.trim() === "Plan" ? "plan" : "default",
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
        sidebarVersion:
          doc.querySelector("[data-app-sidebar]")?.getAttribute("data-sidebar-version") ?? null,
      },
      overlayMetrics: {
        rect: overlayRect,
        triggerRect: modelTriggerRect,
        triggerLabel: overlayTriggerElement?.textContent?.trim() ?? null,
        paletteView:
          commandPaletteElement
            ?.querySelector("[data-palette-view]")
            ?.getAttribute("data-palette-view") ?? null,
        activeRowLabels: [
          ...doc.querySelectorAll('[data-command-palette="true"] [data-palette-active="true"]'),
        ].map((row) => readComposedText(row)),
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
                  box: readElementBox(button ?? item),
                  icon: readElementBox((button ?? item).querySelector("image, img, svg")),
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
                  rows: readPaletteRows(
                    doc.querySelectorAll('[data-command-palette="true"] [data-palette-row="true"]'),
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
                  footerGroups: [
                    ...doc.querySelectorAll(
                      '[data-command-palette="true"] [data-slot="command-footer"] [data-slot="kbd-group"]',
                    ),
                  ].map((group) => ({
                    box: readElementBox(group),
                    children: [...group.children].map((child) => readElementBox(child)),
                  })),
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
                  ? (() => {
                      const rows = [
                        ...(overlayElement?.querySelectorAll('[data-slot="menu-radio-item"]') ??
                          []),
                      ];
                      return {
                        panel: readElementBox(overlayElement),
                        scroll: readElementBox(overlayElement?.firstElementChild),
                        content: readElementBox(overlayElement?.firstElementChild),
                        contentChildren: [
                          ...(overlayElement?.firstElementChild?.children ?? []),
                        ].map((child) => readElementBox(child)),
                        wrappers: [],
                        sections: [],
                        rows: rows.map((row) => readElementBox(row)),
                        sectionLabels: [
                          ...(overlayElement?.querySelectorAll('[data-slot="menu-label"]') ?? []),
                        ].map((label) => readElementBox(label)),
                        separators: [
                          ...(overlayElement?.querySelectorAll('[data-slot="menu-separator"]') ??
                            []),
                        ].map((separator) => readElementBox(separator)),
                        sectionLabel: readElementBox(
                          overlayElement?.querySelector('[data-slot="menu-label"]'),
                        ),
                        row: readElementBox(
                          overlayElement?.querySelector('[data-slot="menu-radio-item"]'),
                        ),
                        firstRow: readElementBox(rows[0]),
                        lastRow: readElementBox(rows.at(-1)),
                        dismiss: null,
                      };
                    })()
                  : overlay === "right-panel-add-menu"
                    ? {
                        panel: readElementBox(overlayElement),
                        rows: rightPanelAddRows.map((row) => ({
                          kind: row.textContent?.trim().toLowerCase() ?? "",
                          label: row.textContent?.trim() ?? "",
                          disabled:
                            row.getAttribute("data-disabled") !== null ||
                            row.getAttribute("aria-disabled") === "true" ||
                            row.querySelector("[data-disabled], [aria-disabled='true']") !== null,
                          rect: readElementBox(row),
                          icon: readElementBox(row.querySelector("image, img, svg")),
                          labelBox: readElementBox(
                            [...row.querySelectorAll("span, text, x-text")].find(
                              (leaf) => readComposedText(leaf) === row.textContent?.trim(),
                            ),
                          ),
                        })),
                      }
                    : overlay === "diff-scope-menu"
                      ? {
                          panel: readElementBox(overlayElement),
                          rows: [
                            ...(overlayElement?.querySelectorAll(
                              '[data-slot="menu-item"], [data-slot="menu-sub-trigger"]',
                            ) ?? []),
                          ].map((row) => ({
                            label: row.textContent?.trim() ?? "",
                            active: row.className.includes("bg-foreground"),
                            rect: readElementBox(row),
                          })),
                        }
                      : overlay === "project-settings-dialog"
                        ? projectSettingsDialog
                        : overlay === "project-action-dialog"
                          ? projectActionDialog
                          : null,
        rowLabels:
          overlay === "quick-switch" || overlay === "file-picker"
            ? [
                ...doc.querySelectorAll('[data-command-palette="true"] [data-palette-row="true"]'),
              ].map((row) => row.querySelector(".truncate")?.textContent?.trim())
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
                    : overlay === "right-panel-add-menu"
                      ? rightPanelAddRows.map((row) => row.textContent?.trim())
                      : overlay === "diff-scope-menu"
                        ? [
                            ...(overlayElement?.querySelectorAll(
                              '[data-slot="menu-item"], [data-slot="menu-sub-trigger"]',
                            ) ?? []),
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
            ? doc.querySelectorAll('[data-command-palette="true"] [data-palette-row="true"]').length
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
                    : overlay === "right-panel-add-menu"
                      ? rightPanelAddRows.length
                      : overlay === "diff-scope-menu"
                        ? (overlayElement?.querySelectorAll(
                            '[data-slot="menu-item"], [data-slot="menu-sub-trigger"]',
                          ).length ?? 0)
                        : overlay === "project-settings-dialog"
                          ? (projectSettingsDialog?.fieldLabels.length ?? 0)
                          : overlay === "project-action-dialog"
                            ? (projectActionDialog?.fieldLabels.length ?? 0)
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
              statusBannerText:
                (
                  doc.querySelector("[data-connection-lifecycle-phase]") ??
                  doc.querySelector(".connection-lifecycle-banner-reference") ??
                  [...doc.querySelectorAll('[data-slot="alert"]')].find((item) =>
                    /Failed to connect|Reconnecting|Connection failed|This thread is settled/.test(
                      item.textContent ?? "",
                    ),
                  )
                )?.textContent?.trim() ?? null,
              statusTitleText:
                (
                  doc.querySelector("[data-connection-lifecycle-title]") ??
                  [...doc.querySelectorAll('[data-slot="alert-title"]')].find((item) =>
                    /Failed to connect|Reconnecting|Connection failed|This thread is settled/.test(
                      item.textContent ?? "",
                    ),
                  )
                )?.textContent?.trim() ?? null,
              statusDescriptionText:
                (
                  doc.querySelector("[data-connection-lifecycle-description]") ??
                  [...doc.querySelectorAll('[data-slot="alert-description"]')].find(
                    (item) =>
                      item.textContent?.includes("WebSocket connection") ||
                      item.textContent?.includes(
                        "Sending a message moves it back to Active in the sidebar.",
                      ),
                  )
                )?.textContent?.trim() ?? null,
              statusActionText:
                (
                  doc.querySelector("[data-connection-lifecycle-actions]") ??
                  [...doc.querySelectorAll('[data-slot="alert-action"]')].find((item) =>
                    /Connections|Un-settle/.test(item.textContent ?? ""),
                  )
                )?.textContent?.trim() ?? null,
              statusBanner: readElementBox(
                doc.querySelector("[data-connection-lifecycle-phase]") ??
                  doc.querySelector(".connection-lifecycle-banner-reference") ??
                  [...doc.querySelectorAll('[data-slot="alert"]')].find((item) =>
                    /Failed to connect|Reconnecting|Connection failed/.test(item.textContent ?? ""),
                  ) ??
                  [...doc.querySelectorAll('[data-slot="alert"]')].find((item) =>
                    item.textContent?.includes("This thread is settled"),
                  ),
              ),
              statusCopy: readElementBox(
                doc.querySelector("[data-connection-lifecycle-copy]") ??
                  [...doc.querySelectorAll('[data-slot="alert"]')]
                    .find((item) =>
                      /Failed to connect|Reconnecting|Connection failed/.test(
                        item.textContent ?? "",
                      ),
                    )
                    ?.querySelector('[data-slot="alert-title"]')?.parentElement ??
                  [...doc.querySelectorAll('[data-slot="alert-title"]')].find((item) =>
                    item.textContent?.includes("This thread is settled"),
                  )?.parentElement,
              ),
              statusTitle: readElementBox(
                doc.querySelector("[data-connection-lifecycle-title]") ??
                  [...doc.querySelectorAll('[data-slot="alert-title"]')].find((item) =>
                    /Failed to connect|Reconnecting|Connection failed|This thread is settled/.test(
                      item.textContent ?? "",
                    ),
                  ),
              ),
              statusDescription: readElementBox(
                doc.querySelector("[data-connection-lifecycle-description]") ??
                  [...doc.querySelectorAll('[data-slot="alert-description"]')].find(
                    (item) =>
                      item.textContent?.includes("WebSocket connection") ||
                      item.textContent?.includes(
                        "Sending a message moves it back to Active in the sidebar.",
                      ),
                  ),
              ),
              statusAction: readElementBox(
                doc.querySelector("[data-connection-lifecycle-actions]") ??
                  [...doc.querySelectorAll('[data-slot="alert-action"]')].find((item) =>
                    item.textContent?.includes("Connections"),
                  ) ??
                  [...doc.querySelectorAll('[data-slot="alert-action"]')].find((item) =>
                    item.textContent?.includes("Un-settle"),
                  ),
              ),
              statusReconnect: readElementBox(
                doc.querySelector("[data-connection-lifecycle-reconnect]") ??
                  [...(doc.querySelectorAll('[data-slot="alert-action"] button') ?? [])].find(
                    (item) =>
                      /^(?:Reconnect|Reconnecting(?:\.\.\.|…))$/.test(
                        item.textContent?.trim() ?? "",
                      ),
                  ),
              ),
              statusConnections: readElementBox(
                doc.querySelector("[data-connection-lifecycle-connections]") ??
                  [...(doc.querySelectorAll('[data-slot="alert-action"] button') ?? [])].find(
                    (item) => item.textContent?.trim() === "Connections",
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
              primaryAction: readComposerPrimaryAction(
                doc.querySelector(".composer-primary-actions"),
              ),
              interactionSeparator: readComposerInteractionSeparator(
                doc,
                composerInteractionControl,
              ),
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
              contextBackdrop: readPseudoElementBox(
                doc.querySelector(".chat-composer-context-strip"),
                "::before",
                16,
              ),
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
        minimap: readElementBox(doc.querySelector("[data-testid='timeline-minimap']")),
        minimapItems: [...doc.querySelectorAll("[data-minimap-strip]")].map((item) =>
          readElementBox(item),
        ),
        minimapPreview: readElementBox(doc.querySelector("[data-minimap-preview]")),
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
          userMeta: readElementBox(doc.querySelector(".transcript-user-meta")),
          assistantMeta: readElementBox(doc.querySelector(".transcript-assistant-meta")),
          changedFilesCard: readElementBox(doc.querySelector(".turn-diff-card")),
          changedFilesHeader: readElementBox(doc.querySelector(".turn-diff-card__header")),
          changedFilesPreview: readElementBox(doc.querySelector(".turn-diff-card__preview")),
          changedFilesBody: readElementBox(doc.querySelector(".turn-diff-card [data-review-tree]")),
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
          turnFold: readElementBox(doc.querySelector(".transcript-turn-fold")),
          workEntryLine: readElementBox(doc.querySelector(".transcript-work-entry-line")),
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
          box: readElementBox(item),
          ancestors: readElementAncestors(item),
          line: readElementBox(item.querySelector(".transcript-work-entry-line")),
          heading: readElementBox(item.querySelector(".transcript-work-entry-heading")),
          preview: readElementBox(item.querySelector(".transcript-work-entry-preview")),
          body: readElementBox(item.querySelector(".transcript-work-entry-body")),
          bodyText: readElementBox(
            item.querySelector(".transcript-work-entry-body .whitespace-pre-wrap"),
          ),
          detail: item.querySelector(".transcript-work-entry-body")?.textContent?.trim() ?? "",
        })),
      },
      headerMetrics: {
        root: readElementBox(doc.querySelector("[data-chat-header]")),
        content: readElementBox(doc.querySelector(".topbar__content")),
        project: readElementBox(doc.querySelector(".chat-header-project-group")),
        projectIcon: readElementBox(doc.querySelector(".chat-header-project-icon-reference")),
        thread: readElementBox(doc.querySelector(".topbar__thread")),
        actions: readElementBox(doc.querySelector("[data-chat-header-actions]")),
        actionItems: readHeaderActionItems(doc.querySelectorAll("[data-chat-header-actions] > *"), [
          "add",
          "open",
          "commit",
        ]),
      },
      gitPublishDialog: readGitPublishDialog(doc),
      addProviderDialog: readAddProviderDialog(doc),
      reviewMetrics: readReviewMetrics(doc),
      filesBrowserMetrics: readFilesBrowserMetrics(doc),
      fileEditorMetrics: readFileEditorMetrics(doc),
      pendingRequestMetrics: readPendingRequestMetrics(doc),
      sidebarProjectGroups: readSidebarProjectGroups(doc),
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
          settingsFooter: readSettingsNavigationChrome(doc).footer,
          settingsBack: readSettingsNavigationChrome(doc).back,
          settingsBackLabel: readSettingsNavigationChrome(doc).backLabel,
          settingsRow: readElementBox(doc.querySelector(".sidebar-settings-row")),
          settingsAuthority: readElementBox(doc.querySelector(".sidebar-settings-authority")),
          searchRow: readElementBox(doc.querySelector(".sidebar-v2-control-row--search")),
          searchPrimary: readElementBox(doc.querySelector(".sidebar-v2-control-primary")),
          search: readElementBox(doc.querySelector('[aria-label="Search threads"]')),
          searchText:
            doc.querySelector('[aria-label="Search threads"]')?.getAttribute("placeholder") ?? "",
          newThread: readElementBox(doc.querySelector(".sidebar-v2-new-thread")),
          projectScopeRow: readElementBox(
            doc.querySelector(".sidebar-v2-project-scope-host")?.parentElement,
          ),
          projectScopeHost: readElementBox(doc.querySelector(".sidebar-v2-project-scope-host")),
          projectScope: readElementBox(
            doc.querySelector('[data-testid="sidebar-v2-project-scope-trigger"]'),
          ),
          projectScopeOptions: [...doc.querySelectorAll("[data-sidebar-project-scope-option]")].map(
            (option) => ({
              scopeKey: option.getAttribute("data-sidebar-project-scope-option"),
              text: readComposedText(option),
              box: readElementBox(option),
              actions: [
                ...option.querySelectorAll(
                  "[data-sidebar-project-action], [aria-label^='Project actions for']",
                ),
              ].map((action) => ({
                ariaLabel: action.getAttribute("aria-label"),
                box: readElementBox(action),
              })),
            }),
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
            inputBox: readElementBox(input),
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
              navigationItems: readSettingsNavigationItems(doc),
              scroll: readSettingsScroll(doc),
              topbar: readSettingsTopbar(doc),
              rowIds: settingsRowIds.filter((id) => doc.getElementById(id)),
              rows: readSettingsRows(doc, settingsRowIds),
              legacySidebar: readLegacySidebarSettings(doc),
              betaMutation: readBetaMutationSettings(doc),
              connectionsMutation: readConnectionsMutationSettings(doc),
              keybindings:
                expectedSemanticRoute === "settings-keybindings"
                  ? readKeybindingsMetrics(doc)
                  : null,
              providers:
                expectedSemanticRoute === "settings-providers"
                  ? readProviderSettingsMetrics(doc)
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
                sourceControlEmptyMedia: readElementBox(
                  settingsPanel?.querySelector('[data-slot="empty-media"]'),
                ),
                sourceControlEmptyHeader: readElementBox(
                  settingsPanel?.querySelector('[data-slot="empty-header"]'),
                ),
                sourceControlEmptyTitle: readElementBox(
                  settingsPanel?.querySelector('[data-slot="empty-title"]'),
                ),
                sourceControlEmptyDescription: readElementBox(
                  settingsPanel?.querySelector('[data-slot="empty-description"]'),
                ),
                sourceControlEmptyContent: readElementBox(
                  settingsPanel?.querySelector("[data-source-control-retry]"),
                ),
                sourceControlRetryButton: readElementBox(
                  settingsPanel?.querySelector('[data-source-control-retry][data-slot="button"]'),
                ),
                sourceControlRetryLabel: readElementBox(
                  settingsPanel?.querySelector('[data-source-control-retry][data-slot="button"]'),
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
                sourceControlRows: readSourceControlRows(doc),
                settingsRows: [...doc.querySelectorAll('[data-settings-row="true"]')].map(
                  readSettingsRowGeometry,
                ),
                loadingRows: [...doc.querySelectorAll('[data-slot="skeleton"]')].map((item) => ({
                  id: item.getAttribute("data-source-control-loading-row"),
                  box: readElementBox(item),
                  className: item.getAttribute("class") ?? "",
                })),
              },
              sourceControlRows: [...doc.querySelectorAll(".source-control-item")].map((item) =>
                item.textContent?.trim(),
              ),
              sourceControlRowMetrics: readSourceControlRows(doc),
              sourceControlDetails: readSourceControlDetails(doc),
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
  async invokeLynxTooltip(relationId, action) {
    return (
      document
        .getElementById("lynx-pane")
        ?.contentWindow?.__T3_LYNX_WEB_PREVIEW__?.invokeTooltipForHarness?.(relationId, action) ===
      true
    );
  },
  async invokeLynxMenu(relationId) {
    return (
      document
        .getElementById("lynx-pane")
        ?.contentWindow?.__T3_LYNX_WEB_PREVIEW__?.invokeMenuForHarness?.(relationId) === true
    );
  },
  webElementCenter(selector) {
    const frame = document.getElementById("web-pane");
    const element = frame?.contentWindow?.document?.querySelector(selector);
    if (!frame || !element) return null;
    const frameRect = frame.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
  },
  webElementCenterVisible(selector) {
    const frame = document.getElementById("web-pane");
    const element = frame?.contentWindow?.document?.querySelector(selector);
    if (!frame || !element) return null;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    const frameRect = frame.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
  },
  elementCenter(client, selector) {
    const frame = document.getElementById(`${client}-pane`);
    const doc = frame?.contentWindow?.document;
    const root = client === "lynx" ? doc?.getElementById("t3-lynx-preview")?.shadowRoot : doc;
    const element = root?.querySelector(selector);
    if (!frame || !element) return null;
    const frameRect = frame.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
  },
  elementCenterVisible(client, selector) {
    const frame = document.getElementById(`${client}-pane`);
    const doc = frame?.contentWindow?.document;
    const root = client === "lynx" ? doc?.getElementById("t3-lynx-preview")?.shadowRoot : doc;
    const element = root?.querySelector(selector);
    if (!frame || !element) return null;
    element.scrollIntoView({ block: "center", inline: "nearest" });
    const frameRect = frame.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    return { x: frameRect.x + rect.x + rect.width / 2, y: frameRect.y + rect.y + rect.height / 2 };
  },
};
window.__T3_WORKBENCH__ = workbench;

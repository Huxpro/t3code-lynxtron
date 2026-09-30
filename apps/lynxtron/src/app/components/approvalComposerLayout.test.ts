import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vite-plus/test";

const composerSource = readFileSync(path.resolve(import.meta.dirname, "Composer.tsx"), "utf8");
const chatViewSource = readFileSync(path.resolve(import.meta.dirname, "ChatView.tsx"), "utf8");
const overridesSource = readFileSync(path.resolve(import.meta.dirname, "../overrides.css"), "utf8");
const pendingSurfaceSource = readFileSync(
  path.resolve(
    import.meta.dirname,
    "../../../../web/src/components/chat/ComposerPendingSurface.tsx",
  ),
  "utf8",
);

function cssBlock(selector: string): string {
  const start = overridesSource.indexOf(`\n${selector} {`);
  return start === -1 ? "" : overridesSource.slice(start, overridesSource.indexOf("}", start) + 1);
}

describe("approval Composer layout", () => {
  it("attaches pending approval and question state as a drawer above the card", () => {
    expect(composerSource).toContain('data-chat-composer-top-drawer="true"');
    expect(composerSource).toContain("composer-top-drawer--${topDrawer.variant}");
    expect(composerSource.indexOf('className="composer-top-drawer__actions"')).toBeLessThan(
      composerSource.lastIndexOf("COMPOSER_SHELL_CLASS,"),
    );
    expect(chatViewSource).toContain('variant: "warning"');
    expect(chatViewSource).toContain('variant: "info"');
    expect(chatViewSource).not.toContain("pendingBanner=");
    expect(composerSource).not.toContain("renderBanners");
  });

  it("keeps the blocked editor and drops the approval footer like upstream", () => {
    expect(composerSource).toContain(
      '<view className="composer-editor-area composer-editor-area--approval">',
    );
    expect(composerSource).toContain(
      '{approvalDetail ?? "Resolve this approval request to continue"}',
    );
    expect(composerSource).not.toContain("composer-footer--approval");
    expect(overridesSource).not.toContain(".composer-footer--approval");
  });

  it("renders the one-line approval detail with its pending count", () => {
    expect(pendingSurfaceSource).toContain('data-approval-detail="complete"');
    expect(pendingSurfaceSource).toContain("{detail || fallbackLabel}");
    expect(pendingSurfaceSource).toContain("1/{pendingCount}");
    expect(pendingSurfaceSource).not.toContain("PENDING APPROVAL");
    expect(cssBlock(".composer-pending-approval__detail")).toContain("white-space: nowrap;");
    expect(cssBlock(".composer-pending-approval__detail")).toContain(
      "font-family: var(--font-mono);",
    );
  });

  it("styles the approval actions as micro ghost-muted buttons without pinned geometry", () => {
    for (const suffix of ["cancel", "decline", "session", "accept"]) {
      expect(overridesSource).not.toContain(`.composer-approval-action--${suffix} {`);
    }
    expect(overridesSource).not.toMatch(/\.composer-approval-action[^{]*\{[^}]*scaleX/u);
    expect(overridesSource).not.toMatch(/\.composer-approval-action[^{]*\{[^}]*width: \d/u);
    expect(cssBlock(".composer-approval-action--decline .ui-button__label")).toContain(
      "color: var(--destructive-foreground);",
    );
    expect(cssBlock(".composer-approval-action--accept .ui-button__label")).toContain(
      "color: var(--foreground);",
    );
    expect(cssBlock(".composer-approval-action .ui-button__label")).toContain("font-weight: 400;");
  });

  it("sizes drawer variants with class hooks, not attribute selectors", () => {
    expect(overridesSource).not.toContain("[data-variant");
    expect(cssBlock(".composer-top-drawer--warning")).toContain("var(--warning-rgb), 0.28");
    expect(cssBlock(".composer-top-drawer--info")).toContain("var(--info-rgb), 0.32");
    expect(cssBlock(".composer-top-drawer")).toContain("width: calc(100% - 44px);");
    expect(cssBlock(".composer-top-drawer")).toContain("border-top-left-radius: 16px;");
    expect(cssBlock(".composer-top-drawer--stacked .composer-top-drawer__row")).toContain(
      "flex-direction: column;",
    );
  });

  it("always renders real approval content instead of fixture-specific sprites", () => {
    expect(overridesSource).not.toContain(".composer-pending-authority-copy");
    expect(overridesSource).not.toContain(".composer-editor-authority-surface");
    expect(overridesSource).not.toContain(".ui-button__authority-label");
    expect(composerSource).not.toContain("approval-editor-pending@2x.png");
    expect(composerSource).not.toContain("composer__input--authority-hidden");
    expect(overridesSource).not.toContain(".composer-pending-copy--authority-hidden");
    expect(overridesSource).not.toContain(".ui-button__label--authority-hidden");
  });
});

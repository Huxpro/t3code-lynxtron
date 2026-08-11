import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import {
  COMPOSER_SHELL_CLASS,
  ComposerContextStrip,
  ComposerHeroHeadline,
  ComposerPrimaryAction,
  ComposerSurface,
  ComposerToolbarControl,
  ComposerToolbarRow,
  type ComposerSurfaceElements,
} from "./ComposerSurface";

function makeElements(overrides: Partial<ComposerSurfaceElements> = {}): ComposerSurfaceElements {
  return {
    renderEditor: () => <textarea data-editor-kernel />,
    renderFooterLeftControls: () => (
      <ComposerToolbarRow
        items={[
          <span data-control="model">Model</span>,
          <span data-control="option">High</span>,
          <span data-control="runtime">Full access</span>,
          <span data-control="interaction">Build</span>,
        ]}
      />
    ),
    renderFooterRightActions: () => <button data-primary-action>Send</button>,
    ...overrides,
  };
}

describe("ComposerSurface", () => {
  it("keeps the shared shell width contract", () => {
    expect(COMPOSER_SHELL_CLASS).toContain("max-w-3xl");
    expect(COMPOSER_SHELL_CLASS).toContain("mx-auto");
  });

  it("renders frame, editor island, footer controls, and primary action in order", () => {
    const markup = renderToStaticMarkup(<ComposerSurface elements={makeElements()} />);
    expect(markup).toContain("composer-frame");
    expect(markup).toContain("composer-surface");
    expect(markup).toContain("data-editor-kernel");
    expect(markup.indexOf('data-control="model"')).toBeLessThan(
      markup.indexOf('data-control="option"'),
    );
    expect(markup.indexOf('data-control="option"')).toBeLessThan(
      markup.indexOf('data-control="runtime"'),
    );
    expect(markup.indexOf('data-control="runtime"')).toBeLessThan(
      markup.indexOf('data-control="interaction"'),
    );
    expect(markup.indexOf('data-control="interaction"')).toBeLessThan(
      markup.indexOf("data-primary-action"),
    );
    expect(markup).toContain('data-chat-composer-footer="true"');
    expect(markup).toContain('data-chat-composer-actions="right"');
  });

  it("places banners above the editor (approval/error state chrome)", () => {
    const markup = renderToStaticMarkup(
      <ComposerSurface
        elements={makeElements({
          renderBanners: () => <div data-banner>Approve</div>,
        })}
      />,
    );
    expect(markup.indexOf("data-banner")).toBeLessThan(markup.indexOf("data-editor-kernel"));
  });

  it("places attachment strips above the editor and below banners", () => {
    const markup = renderToStaticMarkup(
      <ComposerSurface
        elements={makeElements({
          renderBanners: () => <div data-banner />,
          renderAttachments: () => <div data-attachments />,
        })}
      />,
    );
    expect(markup.indexOf("data-banner")).toBeLessThan(markup.indexOf("data-attachments"));
    expect(markup.indexOf("data-attachments")).toBeLessThan(markup.indexOf("data-editor-kernel"));
  });

  it("supports an interruptible/stop primary action through the same slot", () => {
    const markup = renderToStaticMarkup(
      <ComposerSurface
        elements={makeElements({
          renderFooterRightActions: () => <button data-primary-action>Stop</button>,
        })}
      />,
    );
    expect(markup).toContain("Stop");
    expect(markup).toContain('data-chat-composer-actions="right"');
  });

  it("replaces editor and footer with the collapsed body when provided", () => {
    const markup = renderToStaticMarkup(
      <ComposerSurface
        elements={makeElements()}
        renderCollapsedBody={() => <div data-collapsed-body />}
      />,
    );
    expect(markup).toContain("data-collapsed-body");
    expect(markup).not.toContain("data-editor-kernel");
    expect(markup).not.toContain('data-chat-composer-footer="true"');
  });

  it("joins toolbar items with separators and skips empty slots", () => {
    const markup = renderToStaticMarkup(
      <ComposerToolbarRow
        items={[<span data-control="model">M</span>, null, <span data-control="runtime">R</span>]}
      />,
    );
    expect(markup.match(/composer-toolbar-sep/g)?.length).toBe(1);
    expect(markup.indexOf('data-control="model"')).toBeLessThan(
      markup.indexOf('data-control="runtime"'),
    );
  });

  it("owns native toolbar-control density and truncation", () => {
    const markup = renderToStaticMarkup(
      <ComposerToolbarControl
        label="Claude Fable 5"
        leading={<span data-leading />}
        trailing={<span data-trailing />}
        onClick={() => {}}
      />,
    );
    expect(markup).toContain("composer-toolbar-control");
    expect(markup).toContain("composer-toolbar-control-label");
    expect(markup).toContain("gap-1.5");
    expect(markup.indexOf("data-leading")).toBeLessThan(markup.indexOf("Claude Fable 5"));
    expect(markup.indexOf("Claude Fable 5")).toBeLessThan(markup.indexOf("data-trailing"));
  });

  it("projects send, disabled, and stop actions through semantic tokens", () => {
    const send = renderToStaticMarkup(
      <ComposerPrimaryAction state="send" icon={<span />} onClick={() => {}} />,
    );
    const disabled = renderToStaticMarkup(
      <ComposerPrimaryAction state="disabled" icon={<span />} onClick={() => {}} />,
    );
    const stop = renderToStaticMarkup(
      <ComposerPrimaryAction state="stop" icon={<span />} onClick={() => {}} />,
    );
    expect(send).toContain("bg-primary");
    expect(disabled).toContain("opacity-30");
    expect(stop).toContain("bg-destructive");
    expect(stop).toContain('aria-label="Stop response"');
  });

  it("keeps checkout before branch in the context strip", () => {
    const markup = renderToStaticMarkup(
      <ComposerContextStrip
        checkout={<span data-checkout>Local checkout</span>}
        branch={<span data-branch>main</span>}
      />,
    );
    expect(markup.indexOf("data-checkout")).toBeLessThan(markup.indexOf("data-branch"));
    expect(markup).toContain("-mt-4");
    expect(markup).toContain("rounded-b-2xl");
  });

  it("renders the hero headline copy with a project slot", () => {
    const markup = renderToStaticMarkup(
      <ComposerHeroHeadline project={<span data-project>t3code</span>} />,
    );
    expect(markup).toContain("What should we build in");
    expect(markup).toContain("data-project");
    expect(markup).toContain("<h1");
  });

  it("renders the unresolved hero variant with the project slot first", () => {
    const markup = renderToStaticMarkup(
      <ComposerHeroHeadline
        project={<span data-project>Choose a project</span>}
        projectResolved={false}
      />,
    );
    expect(markup.indexOf("data-project")).toBeLessThan(markup.indexOf("to start"));
  });
});

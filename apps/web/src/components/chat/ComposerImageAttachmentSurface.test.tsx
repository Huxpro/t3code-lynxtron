import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";
import { ComposerImageAttachmentSurface } from "./ComposerImageAttachmentSurface";

describe("ComposerImageAttachmentSurface", () => {
  it("shares preview, warning, and remove anatomy across renderers", () => {
    const markup = renderToStaticMarkup(
      <ComposerImageAttachmentSurface
        name="proof.png"
        preview={<img src="proof.png" alt="proof" />}
        warning={<span>May not persist</span>}
        removeIcon={<span>×</span>}
        onPreview={vi.fn()}
        onRemove={vi.fn()}
      />,
    );
    expect(markup).toContain("composer-image-attachment");
    expect(markup).toContain('aria-label="Preview proof.png"');
    expect(markup).toContain("May not persist");
    expect(markup).toContain('aria-label="Remove proof.png"');
  });

  it("renders a named fallback when no preview is available", () => {
    const markup = renderToStaticMarkup(
      <ComposerImageAttachmentSurface
        name="proof.png"
        removeIcon={<span>×</span>}
        onRemove={vi.fn()}
      />,
    );
    expect(markup).toContain("proof.png");
    expect(markup).toContain("composer-image-attachment-fallback");
  });
});

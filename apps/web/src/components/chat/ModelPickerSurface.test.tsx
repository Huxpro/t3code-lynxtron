import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import {
  ModelPickerEmptySurface,
  ModelPickerRailItemSurface,
  ModelPickerRailSurface,
  ModelPickerRowSurface,
  ModelPickerSearchSurface,
} from "./ModelPickerSurface";

describe("ModelPickerSurface", () => {
  it("renders the model row anatomy: name, provider line, new badge, trailing slot", () => {
    const markup = renderToStaticMarkup(
      <ModelPickerRowSurface
        name="Claude Fable 5"
        showNewBadge
        providerIcon={<span data-provider-icon />}
        providerLabel="Claude Code"
        trailing={<button data-trailing>★</button>}
        selected
        onSelect={vi.fn()}
      />,
    );
    expect(markup).toContain("Claude Fable 5");
    expect(markup).toContain("Claude Code");
    expect(markup).toContain("data-provider-icon");
    expect(markup).toContain("model-picker-new-badge");
    expect(markup).toContain("New");
    expect(markup).toContain("data-trailing");
    expect(markup).toContain("model-picker-row--selected");
    expect(markup).toContain("model-picker-row-copy flex min-w-0 flex-1 flex-col");
    expect(markup).toContain("model-picker-row-title-line");
    expect(markup).toContain("model-picker-row-provider-line");
    expect(markup).toContain("model-picker-row-provider-label");
    expect(markup).toContain("model-picker-row-trailing");
    expect(markup.indexOf("Claude Fable 5")).toBeLessThan(markup.indexOf("Claude Code"));
  });

  it("renders the favorite marker ahead of the name when provided", () => {
    const markup = renderToStaticMarkup(
      <ModelPickerRowSurface
        name="GPT-5.6"
        favoriteMarker={<span data-fav-marker>★</span>}
        onSelect={vi.fn()}
      />,
    );
    expect(markup).toContain("data-fav-marker");
    expect(markup.indexOf("data-fav-marker")).toBeLessThan(markup.indexOf("GPT-5.6"));
    expect(markup).not.toContain("model-picker-new-badge");
    expect(markup).toContain("model-picker-row--unselected");
  });

  it("renders rail items with active state and aria labels", () => {
    const markup = renderToStaticMarkup(
      <ModelPickerRailSurface>
        <ModelPickerRailItemSurface
          icon={<span data-icon-star>★</span>}
          label="Favorites"
          active
          onSelect={vi.fn()}
        />
        <ModelPickerRailItemSurface
          icon={<span data-icon-claude>✳</span>}
          label="Claude Code"
          onSelect={vi.fn()}
        />
      </ModelPickerRailSurface>,
    );
    expect(markup).toContain("model-picker-rail");
    expect(markup).toContain('aria-label="Favorites"');
    expect(markup).toContain("model-picker-rail-item--active");
    expect(markup).toContain("model-picker-rail-icon pointer-events-none");
    expect(markup).not.toContain("event-through");
    expect(markup.indexOf("data-icon-star")).toBeLessThan(markup.indexOf("data-icon-claude"));
  });

  it("keeps disabled model rows inspectable with their exact reason", () => {
    const markup = renderToStaticMarkup(
      <ModelPickerRowSurface
        name="Grok Build"
        disabled
        disabledReason="This provider does not allow switching models."
        onDisabledSelect={vi.fn()}
      />,
    );

    expect(markup).toContain('aria-disabled="true"');
    expect(markup).toContain('data-model-picker-disabled="true"');
    expect(markup).toContain(
      'data-model-picker-disabled-reason="This provider does not allow switching models."',
    );
    expect(markup).toContain("<button");
  });

  it("keeps unavailable providers visible and exposes their reason", () => {
    const markup = renderToStaticMarkup(
      <ModelPickerRailItemSurface
        icon={<span data-icon-grok />}
        label="Grok"
        semanticId="grok"
        disabled
        disabledReason="Grok — Unavailable. Sign in to continue."
        onSelect={vi.fn()}
        onDisabledSelect={vi.fn()}
      />,
    );

    expect(markup).toContain('data-model-picker-provider="grok"');
    expect(markup).toContain('data-model-picker-provider-disabled="true"');
    expect(markup).toContain(
      'data-model-picker-provider-disabled-reason="Grok — Unavailable. Sign in to continue."',
    );
  });

  it("renders the search row with icon and input slots", () => {
    const markup = renderToStaticMarkup(
      <ModelPickerSearchSurface
        icon={<span data-search-icon />}
        input={<input value="fable" readOnly />}
      />,
    );
    expect(markup).toContain("model-picker-search");
    expect(markup).toContain("data-search-icon");
    expect(markup).toContain('value="fable"');
  });

  it("renders the shared empty state", () => {
    const markup = renderToStaticMarkup(<ModelPickerEmptySurface message="No models found" />);
    expect(markup).toContain("model-picker-empty");
    expect(markup).toContain("No models found");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { DiffPanelSurface } from "./DiffPanelSurface";

describe("DiffPanelSurface", () => {
  it("serializes review counts for Web and Lynx hosts", () => {
    const markup = renderToStaticMarkup(
      <DiffPanelSurface
        mode="embedded"
        header={<span>Latest turn</span>}
        reviewCheckpointCount={4}
        reviewSelectedTurn="turn-4"
        reviewFileCount={2}
      >
        <span>Diff</span>
      </DiffPanelSurface>,
    );

    expect(markup).toContain('data-review-checkpoint-count="4"');
    expect(markup).toContain('data-review-selected-turn="turn-4"');
    expect(markup).toContain('data-review-file-count="2"');
  });
});

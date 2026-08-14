import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ThreadErrorBannerSurface } from "./ThreadErrorBannerSurface";

describe("ThreadErrorBannerSurface", () => {
  it("shares the error banner anatomy with renderer-provided icon and action leaves", () => {
    const markup = renderToStaticMarkup(
      <ThreadErrorBannerSurface
        description="Model not found"
        icon={<span data-icon />}
        action={<button type="button">Dismiss</button>}
      />,
    );

    expect(markup).toContain("thread-error-banner");
    expect(markup).toContain("thread-error-alert");
    expect(markup).toContain("thread-error-description");
    expect(markup).toContain("Model not found");
    expect(markup).toContain("Dismiss");
  });
});

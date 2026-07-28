import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { ChatHeaderSurface } from "./ChatHeaderSurface";

vi.mock("./ChatHeaderTitle", () => ({
  ChatHeaderTitle: ({ title, className }: { title: string; className: string }) => (
    <span className={className}>{title}</span>
  ),
}));

describe("ChatHeaderSurface", () => {
  it("keeps project, thread, and actions in canonical order", () => {
    const markup = renderToStaticMarkup(
      <ChatHeaderSurface
        activeProjectName="t3code"
        activeThreadTitle="Port Lynxtron"
        projectIcon={<span data-project-icon>T3</span>}
        rightPanelOpen={false}
        actions={<button type="button">Commit</button>}
      />,
    );

    expect(markup.indexOf("t3code")).toBeLessThan(markup.indexOf("Port Lynxtron"));
    expect(markup.indexOf("Port Lynxtron")).toBeLessThan(markup.indexOf("Commit"));
    expect(markup).toContain("chat-header-project-name-reference");
    expect(markup).toContain("chat-header-thread-title-reference");
    expect(markup).toContain("pr-16");
  });

  it("omits the project breadcrumb without inventing fallback copy", () => {
    const markup = renderToStaticMarkup(
      <ChatHeaderSurface
        activeProjectName={undefined}
        activeThreadTitle="New thread"
        rightPanelOpen
      />,
    );

    expect(markup).not.toContain("chat-header-project-name-reference");
    expect(markup).not.toContain("your project");
    expect(markup).toContain("New thread");
    expect(markup).toContain("pr-0");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ChatRouteSurface } from "./ChatRouteSurface";

describe("ChatRouteSurface", () => {
  it("renders the route anatomy: header, banner, chat column, right panel", () => {
    const markup = renderToStaticMarkup(
      <ChatRouteSurface
        layoutControls={<span data-layout-controls />}
        header={<div data-header />}
        banner={<div data-banner />}
        rightPanel={<div data-right-panel />}
        overlays={<div data-overlays />}
        afterChatColumn={<div data-after-column />}
      >
        <div data-chat-content />
      </ChatRouteSurface>,
    );
    for (const part of [
      "chat-view-surface-reference",
      "data-layout-controls",
      "data-header",
      "data-banner",
      "data-chat-content",
      "data-after-column",
      "data-right-panel",
      "data-overlays",
    ]) {
      expect(markup).toContain(part);
    }
    expect(markup.indexOf("data-header")).toBeLessThan(markup.indexOf("data-banner"));
    expect(markup.indexOf("data-banner")).toBeLessThan(markup.indexOf("data-chat-content"));
    expect(markup.indexOf("data-chat-content")).toBeLessThan(markup.indexOf("data-right-panel"));
  });

  it("keeps the chat column flexible by default", () => {
    const markup = renderToStaticMarkup(
      <ChatRouteSurface header={<div data-header />}>
        <div data-chat-content />
      </ChatRouteSurface>,
    );
    expect(markup).toContain('data-chat-column-maximized-away="false"');
    expect(markup).not.toContain("w-0 flex-none");
  });

  it("collapses the chat column when hidden by a maximized panel", () => {
    const markup = renderToStaticMarkup(
      <ChatRouteSurface header={<div data-header />} chatColumnHidden>
        <div data-chat-content />
      </ChatRouteSurface>,
    );
    expect(markup).toContain('data-chat-column-maximized-away="true"');
    expect(markup).toContain("w-0 flex-none");
  });

  it("keeps the maximized right panel outside the collapsed chat column", () => {
    const markup = renderToStaticMarkup(
      <ChatRouteSurface
        header={<div data-header />}
        chatColumnHidden
        rightPanel={<div data-right-panel data-maximized="true" />}
      >
        <div data-chat-content />
      </ChatRouteSurface>,
    );

    expect(markup.indexOf('data-chat-column-maximized-away="true"')).toBeLessThan(
      markup.indexOf('data-right-panel="true"'),
    );
    expect(markup).toContain('data-maximized="true"');
  });
});

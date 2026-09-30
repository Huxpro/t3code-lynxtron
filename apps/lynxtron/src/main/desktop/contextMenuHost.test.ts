import { describe, expect, it, vi } from "vite-plus/test";
import type { MenuItemConstructorOptions } from "@lynx-js/lynxtron";

import { T3_CONTEXT_MENU_SHOW_METHOD } from "../../shared/capabilityProtocol";
import { createProbeContextMenuBuilder, startContextMenuCapabilityHost } from "./contextMenuHost";

describe("startContextMenuCapabilityHost", () => {
  it("builds a native menu and resolves the selected id", async () => {
    let handler: ((params: unknown) => unknown) | undefined;
    let template: MenuItemConstructorOptions[] = [];
    let popupOptions: Record<string, unknown> | undefined;
    const removeHandler = vi.fn();
    const host = startContextMenuCapabilityHost(
      {
        handle(method, nextHandler) {
          expect(method).toBe(T3_CONTEXT_MENU_SHOW_METHOD);
          handler = nextHandler;
        },
        removeHandler,
      },
      { id: "window" },
      (nextTemplate) => {
        template = nextTemplate;
        return {
          popup: (options) => {
            popupOptions = options as Record<string, unknown>;
            return {};
          },
        };
      },
    );

    const selection = handler?.({
      items: [
        { id: "rename", label: "Rename thread" },
        { id: "delete", label: "Delete", destructive: true },
      ],
      x: 805,
      y: 52,
    }) as Promise<string | null>;
    expect(template.map((item) => item.type ?? item.id)).toEqual(["rename", "separator", "delete"]);
    expect(popupOptions).toMatchObject({ x: 805, y: 52 });
    template[2]?.click?.({} as never, {} as never, {} as never);
    await expect(selection).resolves.toBe("delete");

    host.dispose();
    expect(removeHandler).toHaveBeenCalledWith(T3_CONTEXT_MENU_SHOW_METHOD);
  });
});

describe("probe context menu builder", () => {
  it("records the offered labels and selects the requested item", () => {
    const lines: string[] = [];
    const clicked: string[] = [];
    let dismissed = false;
    createProbeContextMenuBuilder("copy", (line) => lines.push(line))([
      { id: "open", label: "Open", click: () => clicked.push("open") },
      { id: "copy", label: "Copy", click: () => clicked.push("copy") },
    ]).popup({ window: null, callback: () => (dismissed = true) });
    expect(clicked).toEqual(["copy"]);
    expect(dismissed).toBe(false);
    expect(lines).toEqual(['[context-menu-probe] offered=["Open","Copy"] select=copy']);
  });

  it("selects an item inside a submenu", () => {
    const clicked: string[] = [];
    createProbeContextMenuBuilder("copy-thread-id", () => {})([
      {
        id: "copy",
        label: "Copy",
        submenu: [{ id: "copy-thread-id", label: "Thread ID", click: () => clicked.push("id") }],
      },
    ]).popup({ window: null, callback: () => {} });
    expect(clicked).toEqual(["id"]);
  });

  it("dismisses when the requested item is absent", () => {
    let dismissed = false;
    createProbeContextMenuBuilder("missing", () => {})([{ id: "open", label: "Open" }]).popup({
      window: null,
      callback: () => (dismissed = true),
    });
    expect(dismissed).toBe(true);
  });
});

describe("probe context menu sequence", () => {
  it("consumes one selection per popup", () => {
    const clicked: string[] = [];
    const build = createProbeContextMenuBuilder("copy, open", () => {});
    const template = [
      { id: "open", label: "Open", click: () => clicked.push("open") },
      { id: "copy", label: "Copy", click: () => clicked.push("copy") },
    ];
    build(template).popup({ window: null, callback: () => {} });
    build(template).popup({ window: null, callback: () => {} });
    expect(clicked).toEqual(["copy", "open"]);
  });
});

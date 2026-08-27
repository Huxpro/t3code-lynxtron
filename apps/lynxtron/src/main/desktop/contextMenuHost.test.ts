import { describe, expect, it, vi } from "vite-plus/test";
import type { MenuItemConstructorOptions } from "@lynx-js/lynxtron";

import { T3_CONTEXT_MENU_SHOW_METHOD } from "../../shared/capabilityProtocol";
import { startContextMenuCapabilityHost } from "./contextMenuHost";

describe("startContextMenuCapabilityHost", () => {
  it("builds a native menu and resolves the selected id", async () => {
    let handler: ((params: unknown) => unknown) | undefined;
    let template: MenuItemConstructorOptions[] = [];
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
        return { popup: () => ({}) };
      },
    );

    const selection = handler?.({
      items: [
        { id: "rename", label: "Rename thread" },
        { id: "delete", label: "Delete", destructive: true },
      ],
    }) as Promise<string | null>;
    expect(template.map((item) => item.type ?? item.id)).toEqual(["rename", "separator", "delete"]);
    template[2]?.click?.({} as never, {} as never, {} as never);
    await expect(selection).resolves.toBe("delete");

    host.dispose();
    expect(removeHandler).toHaveBeenCalledWith(T3_CONTEXT_MENU_SHOW_METHOD);
  });

  it("lets a menu item selection win when popup closure is reported first", async () => {
    let handler: ((params: unknown) => unknown) | undefined;
    let template: MenuItemConstructorOptions[] = [];
    let closePopup: (() => void) | undefined;
    startContextMenuCapabilityHost(
      {
        handle(_method, nextHandler) {
          handler = nextHandler;
        },
        removeHandler() {},
      },
      { id: "window" },
      (nextTemplate) => {
        template = nextTemplate;
        return {
          popup(options) {
            closePopup = options.callback;
            return {};
          },
        };
      },
    );

    const selection = handler?.({
      items: [{ id: "copy", label: "Copy" }],
    }) as Promise<string | null>;
    closePopup?.();
    template[0]?.click?.({} as never, {} as never, {} as never);

    await expect(selection).resolves.toBe("copy");
  });

  it("resolves null after a native menu closes without a selection", async () => {
    let handler: ((params: unknown) => unknown) | undefined;
    let closePopup: (() => void) | undefined;
    startContextMenuCapabilityHost(
      {
        handle(_method, nextHandler) {
          handler = nextHandler;
        },
        removeHandler() {},
      },
      { id: "window" },
      () => ({
        popup(options) {
          closePopup = options.callback;
          return {};
        },
      }),
    );

    const selection = handler?.({
      items: [{ id: "copy", label: "Copy" }],
    }) as Promise<string | null>;
    closePopup?.();

    await expect(selection).resolves.toBeNull();
  });
});

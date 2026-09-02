import { describe, expect, it, vi } from "vite-plus/test";
import type { MenuItemConstructorOptions } from "@lynx-js/lynxtron";

import { T3_CONTEXT_MENU_SHOW_METHOD } from "../../shared/capabilityProtocol";
import { startContextMenuCapabilityHost } from "./contextMenuHost";

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

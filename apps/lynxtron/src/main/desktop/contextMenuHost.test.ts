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
});

import type { MenuItemConstructorOptions } from "@lynx-js/lynxtron";

import {
  parseNativeContextMenuShowInput,
  T3_CONTEXT_MENU_SHOW_METHOD,
  type NativeContextMenuItem,
} from "../../shared/capabilityProtocol.ts";
import type { CapabilityBridgeHost } from "./capabilityHost.ts";

export interface NativeMenuLike {
  popup(options: { readonly window: unknown; readonly callback: () => void }): unknown;
}

export function startContextMenuCapabilityHost(
  bridge: CapabilityBridgeHost,
  window: unknown,
  buildMenu: (template: MenuItemConstructorOptions[]) => NativeMenuLike,
): { readonly dispose: () => void } {
  bridge.handle(T3_CONTEXT_MENU_SHOW_METHOD, (params) => {
    const { items, x, y } = parseNativeContextMenuShowInput(params);
    return new Promise<string | null>((resolve) => {
      let settled = false;
      const complete = (selection: string | null) => {
        if (settled) return;
        settled = true;
        resolve(selection);
      };
      const buildItems = (entries: ReadonlyArray<NativeContextMenuItem>) => {
        const template: MenuItemConstructorOptions[] = [];
        let destructiveSeparatorInserted = false;
        for (const item of entries) {
          if (item.destructive && !destructiveSeparatorInserted && template.length > 0) {
            template.push({ type: "separator" });
            destructiveSeparatorInserted = true;
          }
          template.push({
            id: item.id,
            label: item.label,
            enabled: item.disabled !== true,
            ...(item.children?.length
              ? { submenu: buildItems(item.children) }
              : { click: () => complete(item.id) }),
          });
        }
        return template;
      };
      if (items.length === 0) {
        complete(null);
        return;
      }
      buildMenu(buildItems(items)).popup({
        window,
        ...(x === undefined || y === undefined ? {} : { x, y }),
        callback: () => complete(null),
      });
    });
  });
  return { dispose: () => bridge.removeHandler(T3_CONTEXT_MENU_SHOW_METHOD) };
}

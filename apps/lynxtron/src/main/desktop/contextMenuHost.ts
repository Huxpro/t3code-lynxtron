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

/**
 * Probe-only menu builder: records the offered labels and immediately selects
 * the next id from `selections` (comma-separated, consumed in order) instead
 * of showing a blocking native menu, so headless runs can prove a context-menu
 * action and its feedback without desktop input.
 */
export function createProbeContextMenuBuilder(
  selections: string,
  log: (line: string) => void,
): (template: MenuItemConstructorOptions[]) => NativeMenuLike {
  const queue = selections
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return (template) => ({
    popup: ({ callback }) => {
      const selectId = queue.shift() ?? "";
      const labels = template.flatMap((item) => (item.label ? [item.label] : []));
      log(`[context-menu-probe] offered=${JSON.stringify(labels)} select=${selectId}`);
      const selected = template.find((item) => item.id === selectId);
      if (selected?.click && selected.enabled !== false) {
        selected.click(undefined as never, undefined, undefined);
      } else {
        callback();
      }
    },
  });
}

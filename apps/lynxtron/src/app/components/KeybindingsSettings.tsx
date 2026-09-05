import {
  buildKeybindingRows,
  commandLabel,
  formatKeybindingShortcutLabel,
  shortcutToKeybindingInput,
} from "../../../../web/src/components/settings/KeybindingsSettings.logic";
import type { KeybindingShortcut } from "@t3tools/contracts";
import { useT3ClientState } from "../state/t3Client";
import { Kbd, KbdGroup } from "../../../../web/src/components/ui/kbd";
import { Icon } from "./Icon";
import { SettingsSection } from "./SettingsControls";

function shortcutParts(shortcut: KeybindingShortcut, platform: string): ReadonlyArray<string> {
  if (!platform.toLowerCase().includes("darwin")) {
    return formatKeybindingShortcutLabel(shortcut, platform).split("+");
  }
  return shortcutToKeybindingInput(shortcut)
    .split("+")
    .map((part) => {
      if (part === "mod" || part === "meta") return "⌘";
      if (part === "shift") return "⇧";
      if (part === "alt") return "⌥";
      if (part === "ctrl") return "⌃";
      return part.length === 1 ? part.toUpperCase() : part;
    });
}

export function KeybindingsSettings() {
  const { serverConfig } = useT3ClientState();
  const keybindings = serverConfig?.keybindings ?? [];
  const rows = buildKeybindingRows(keybindings, "");
  const platform = serverConfig?.environment.platform.os ?? "darwin";

  return (
    <view className="settings-panel settings-panel--keybindings">
      <SettingsSection
        id="keybindings"
        title="Keybindings"
        headerAction={
          <view className="keybindings-settings__status">
            <Icon name="info" size={14} color="#f59e0b" />
            <text className="keybindings-settings__count">
              Read-only · {rows.length} {rows.length === 1 ? "binding" : "bindings"}
            </text>
          </view>
        }
      >
        <view className="keybindings-table__header" data-keybindings-table-header="true">
          <text className="keybindings-table__header-command">Command</text>
          <text className="keybindings-table__header-key">Keybinding</text>
          <text className="keybindings-table__header-when">When</text>
          <text className="keybindings-table__header-status">Status</text>
        </view>
        {rows.map((row, index) => (
          <view
            key={row.id}
            className={
              index === rows.length - 1
                ? `keybindings-table__row${
                    index % 2 === 1 ? " keybindings-table__row--alternate" : ""
                  } keybindings-table__row--last`
                : `keybindings-table__row${
                    index % 2 === 1 ? " keybindings-table__row--alternate" : ""
                  }`
            }
            data-keybinding-command={row.command}
            data-keybinding-shortcut={formatKeybindingShortcutLabel(row.binding.shortcut, platform)}
            data-keybinding-when={row.when || "Always"}
            data-keybinding-source={row.source}
            data-keybinding-conflicts={JSON.stringify(row.conflicts)}
          >
            <text className="keybindings-table__command">{commandLabel(row.command)}</text>
            <view className="keybindings-table__key">
              <KbdGroup className="keybindings-table__keycaps">
                {shortcutParts(row.binding.shortcut, platform).map((part, partIndex) => (
                  <Kbd key={`${row.id}:${part}:${partIndex}`} className="keybindings-table__keycap">
                    {part}
                  </Kbd>
                ))}
              </KbdGroup>
            </view>
            <text className="keybindings-table__when">{row.when || "Always"}</text>
            <view
              className={
                row.conflicts.length > 0
                  ? "keybindings-table__status keybindings-table__status--conflict"
                  : "keybindings-table__status"
              }
              aria-label={
                row.conflicts.length > 0 ? `Conflicts with ${row.conflicts.join(", ")}.` : undefined
              }
            >
              {row.conflicts.length > 0 ? (
                <Icon name="triangle-alert" size={14} color="#f59e0b" />
              ) : null}
            </view>
          </view>
        ))}
      </SettingsSection>
    </view>
  );
}

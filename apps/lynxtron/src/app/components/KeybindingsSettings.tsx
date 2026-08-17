import {
  buildKeybindingRows,
  commandLabel,
  formatKeybindingShortcutLabel,
} from "../../../../web/src/components/settings/KeybindingsSettings.logic";
import { useT3ClientState } from "../state/t3Client";
import { Icon } from "./Icon";
import { SettingsSection } from "./SettingsControls";

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
          <text className="keybindings-settings__count">
            {rows.length} {rows.length === 1 ? "binding" : "bindings"}
          </text>
        }
      >
        <view className="keybindings-settings__notice">
          <text className="keybindings-settings__notice-text">
            Keybindings are read-only on Lynxtron until renderer keyboard capture is verified.
          </text>
        </view>
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
                ? "keybindings-table__row keybindings-table__row--last"
                : "keybindings-table__row"
            }
            data-keybinding-command={row.command}
            data-keybinding-shortcut={formatKeybindingShortcutLabel(row.binding.shortcut, platform)}
            data-keybinding-when={row.when || "Always"}
            data-keybinding-source={row.source}
            data-keybinding-conflicts={JSON.stringify(row.conflicts)}
          >
            <text className="keybindings-table__command">{commandLabel(row.command)}</text>
            <text className="keybindings-table__key">
              {formatKeybindingShortcutLabel(row.binding.shortcut, platform)}
            </text>
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
                <Icon name="triangle-alert" size={14} color="#a1a1aa" />
              ) : null}
            </view>
          </view>
        ))}
      </SettingsSection>
    </view>
  );
}

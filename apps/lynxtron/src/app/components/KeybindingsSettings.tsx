import {
  buildKeybindingCommandOptions,
  buildKeybindingRows,
  commandLabel,
  formatKeybindingShortcutLabel,
  shortcutToKeybindingInput,
} from "../../../../web/src/components/settings/KeybindingsSettings.logic";
import { useCallback, useState } from "@lynx-js/react";
import type { KeybindingCommand, KeybindingShortcut } from "@t3tools/contracts";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
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
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [command, setCommand] = useState("");
  const [shortcut, setShortcut] = useState("");
  const [when, setWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = buildKeybindingRows(keybindings, query);
  const commandOptions = buildKeybindingCommandOptions(keybindings);
  const platform = serverConfig?.environment.platform.os ?? "darwin";
  const inputValue = (event: { detail?: { value?: unknown } }) =>
    typeof event.detail?.value === "string" ? event.detail.value : "";
  const save = useCallback(() => {
    const selectedCommand = commandOptions.find((option) => option === command);
    const key = shortcut.trim();
    if (!selectedCommand || !key || saving) return;
    setSaving(true);
    setError(null);
    void t3ClientActions
      .upsertKeybinding({
        command: selectedCommand as KeybindingCommand,
        key,
        ...(when.trim() ? { when: when.trim() } : {}),
      })
      .then(() => {
        setAddOpen(false);
        setCommand("");
        setShortcut("");
        setWhen("");
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setSaving(false));
  }, [command, commandOptions, saving, shortcut, when]);

  return (
    <view className="settings-panel settings-panel--keybindings">
      <SettingsSection
        id="keybindings"
        title="Keybindings"
        headerAction={
          <view className="keybindings-settings__actions">
            <text className="keybindings-settings__count">
              {rows.length} {rows.length === 1 ? "binding" : "bindings"}
            </text>
            <view
              aria-label="Search keybindings"
              className="keybindings-settings__icon-button"
              bindtap={() => setSearchOpen((open) => !open)}
            >
              <Icon name="search" size={12} color="#818181" />
            </view>
            <view
              aria-label="Add keybinding"
              className="keybindings-settings__icon-button"
              bindtap={() => setAddOpen(true)}
            >
              <Icon name="plus" size={12} color="#818181" />
            </view>
          </view>
        }
      >
        {searchOpen ? (
          <view className="keybindings-settings__search">
            <Icon name="search" size={14} color="#818181" />
            <input
              className="keybindings-settings__search-input"
              aria-label="Search keybindings"
              placeholder="Search keybindings"
              bindinput={(event) => setQuery(inputValue(event))}
            />
            {query ? (
              <view aria-label="Clear keybinding search" bindtap={() => setQuery("")}>
                <Icon name="x" size={12} color="#818181" />
              </view>
            ) : null}
          </view>
        ) : null}
        {addOpen ? (
          <view className="keybindings-add-row" data-keybinding-add-row="true">
            <input
              className="keybindings-add-row__command"
              aria-label="Keybinding command"
              placeholder="Command"
              bindinput={(event) => setCommand(inputValue(event))}
            />
            <input
              className="keybindings-add-row__shortcut"
              aria-label="Keybinding shortcut"
              placeholder="mod+shift+k"
              bindinput={(event) => setShortcut(inputValue(event))}
            />
            <input
              className="keybindings-add-row__when"
              aria-label="Keybinding when clause"
              placeholder="Always"
              bindinput={(event) => setWhen(inputValue(event))}
            />
            <view className="keybindings-add-row__actions">
              <view
                aria-label="Save keybinding"
                className={
                  !commandOptions.includes(command as KeybindingCommand) ||
                  !shortcut.trim() ||
                  saving
                    ? "keybindings-add-row__save keybindings-add-row__save--disabled"
                    : "keybindings-add-row__save"
                }
                bindtap={save}
              >
                <text>{saving ? "Saving" : "Save"}</text>
              </view>
              <view aria-label="Cancel new keybinding" bindtap={() => setAddOpen(false)}>
                <Icon name="x" size={14} color="#818181" />
              </view>
            </view>
            {error ? <text className="keybindings-add-row__error">{error}</text> : null}
          </view>
        ) : null}
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
        {rows.length === 0 && !addOpen ? (
          <text className="keybindings-settings__empty">No keybindings match your search.</text>
        ) : null}
      </SettingsSection>
    </view>
  );
}

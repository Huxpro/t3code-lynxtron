import {
  buildKeybindingCommandOptions,
  buildKeybindingRows,
  commandLabel,
  formatKeybindingShortcutLabel,
  shortcutToKeybindingInput,
} from "../../../../web/src/components/settings/KeybindingsSettings.logic";
import { useCallback, useState } from "@lynx-js/react";
import type {
  KeybindingCommand,
  KeybindingShortcut,
  ServerRemoveKeybindingInput,
  ServerUpsertKeybindingInput,
} from "@t3tools/contracts";
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

function rowKeybindingTarget(row: ReturnType<typeof buildKeybindingRows>[number]) {
  return {
    command: row.command,
    key: row.key,
    ...(row.when.trim() ? { when: row.when } : {}),
  } satisfies ServerRemoveKeybindingInput;
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
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingShortcut, setEditingShortcut] = useState("");
  const [editingWhen, setEditingWhen] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rows = buildKeybindingRows(keybindings, query);
  const commandOptions = buildKeybindingCommandOptions(keybindings);
  const platform = serverConfig?.environment.platform.os ?? "darwin";
  const inputValue = (event: { detail?: { value?: unknown } }) =>
    typeof event.detail?.value === "string" ? event.detail.value : "";
  const persist = useCallback(
    (input: ServerUpsertKeybindingInput) => {
      if (saving) return;
      setSaving(true);
      setError(null);
      void t3ClientActions
        .upsertKeybinding(input)
        .then(() => setEditingRowId(null))
        .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
        .finally(() => setSaving(false));
    },
    [saving],
  );
  const save = useCallback(() => {
    const selectedCommand = commandOptions.find((option) => option === command);
    const key = shortcut.trim();
    if (!selectedCommand || !key || saving) return;
    persist({
      command: selectedCommand as KeybindingCommand,
      key,
      ...(when.trim() ? { when: when.trim() } : {}),
    });
    setAddOpen(false);
    setCommand("");
    setShortcut("");
    setWhen("");
  }, [command, commandOptions, persist, saving, shortcut, when]);
  const remove = useCallback(
    (input: ServerRemoveKeybindingInput) => {
      if (saving) return;
      setSaving(true);
      setError(null);
      void t3ClientActions
        .removeKeybinding(input)
        .then(() => {
          setAddOpen(false);
          setEditingRowId(null);
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)))
        .finally(() => setSaving(false));
    },
    [saving],
  );

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
            <view
              className="keybindings-table__key"
              aria-label={
                editingRowId === row.id
                  ? undefined
                  : `Edit shortcut for ${commandLabel(row.command)}`
              }
              bindtap={() => {
                if (editingRowId === row.id) return;
                setEditingRowId(row.id);
                setEditingShortcut(row.key);
                setEditingWhen(row.when);
              }}
            >
              {editingRowId === row.id ? (
                <input
                  aria-label={`Keybinding for ${commandLabel(row.command)}`}
                  className="keybindings-table__edit-input"
                  {...({ value: editingShortcut } as object)}
                  bindinput={(event) => setEditingShortcut(inputValue(event))}
                />
              ) : (
                <KbdGroup className="keybindings-table__keycaps">
                  {shortcutParts(row.binding.shortcut, platform).map((part, partIndex) => (
                    <Kbd
                      key={`${row.id}:${part}:${partIndex}`}
                      className="keybindings-table__keycap"
                    >
                      {part}
                    </Kbd>
                  ))}
                </KbdGroup>
              )}
            </view>
            {editingRowId === row.id ? (
              <input
                aria-label={`When clause for ${commandLabel(row.command)}`}
                className="keybindings-table__edit-input keybindings-table__edit-when"
                placeholder="Always"
                {...({ value: editingWhen } as object)}
                bindinput={(event) => setEditingWhen(inputValue(event))}
              />
            ) : (
              <text className="keybindings-table__when">{row.when || "Always"}</text>
            )}
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
              {editingRowId === row.id ? (
                <>
                  <view
                    aria-label={`Save ${commandLabel(row.command)} keybinding`}
                    bindtap={() => {
                      const key = editingShortcut.trim();
                      if (!key || saving) return;
                      persist({
                        command: row.command,
                        key,
                        ...(editingWhen.trim() ? { when: editingWhen.trim() } : {}),
                        replace: rowKeybindingTarget(row),
                      });
                    }}
                  >
                    <Icon name="check" size={12} color="#818181" />
                  </view>
                  <view
                    aria-label={`Cancel editing ${commandLabel(row.command)}`}
                    bindtap={() => setEditingRowId(null)}
                  >
                    <Icon name="x" size={12} color="#818181" />
                  </view>
                </>
              ) : (
                <>
                  {row.source === "Custom" && row.defaultKey ? (
                    <view
                      aria-label={`Reset ${commandLabel(row.command)} to default`}
                      bindtap={() =>
                        persist({
                          command: row.command,
                          key: row.defaultKey!,
                          ...(row.defaultWhen.trim() ? { when: row.defaultWhen } : {}),
                          replace: rowKeybindingTarget(row),
                        })
                      }
                    >
                      <Icon name="rotate-ccw" size={12} color="#818181" />
                    </view>
                  ) : null}
                  {row.source !== "Default" ? (
                    <view
                      aria-label={`Remove ${commandLabel(row.command)} keybinding`}
                      bindtap={() => remove(rowKeybindingTarget(row))}
                    >
                      <Icon name="trash-2" size={12} color="#818181" />
                    </view>
                  ) : null}
                </>
              )}
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

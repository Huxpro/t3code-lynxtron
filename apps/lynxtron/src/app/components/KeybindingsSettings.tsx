import { Icon } from "./Icon";

// Mirrors apps/web KeybindingsSettings: header with count + action icons,
// uppercase column header, rows with command / key chips / when / status.
// Static subset of the default bindings (interaction is a later slice).
const BINDINGS: ReadonlyArray<{
  command: string;
  keys: string[];
  when: string;
  unbound?: boolean;
}> = [
  { command: "Quick switch", keys: ["⌘", "K"], when: "Always" },
  { command: "New thread", keys: ["⌘", "N"], when: "Always" },
  { command: "New terminal thread", keys: ["⌘", "T"], when: "Always" },
  { command: "Toggle sidebar", keys: ["⌘", "B"], when: "Always" },
  { command: "Toggle right panel", keys: ["⌘", "J"], when: "Always" },
  { command: "Toggle terminal drawer", keys: ["⌘", "`"], when: "Always" },
  { command: "Open settings", keys: ["⌘", ","], when: "Always" },
  { command: "Send message", keys: ["↵"], when: "!terminalFocus" },
  { command: "Interrupt turn", keys: ["Esc"], when: "!terminalFocus" },
  { command: "Focus composer", keys: ["/"], when: "!editorFocus" },
];

export function KeybindingsSettings() {
  return (
    <view className="settings-panel">
      <view className="settings-section">
        <view className="settings-section__header settings-section__header--row">
          <text className="settings-section__title">Keybindings</text>
          <view className="settings-section__header-right">
            <text className="settings-section__meta">41 bindings</text>
            <view className="settings-section__icon-btn">
              <Icon
                name="search"
                size={12}
                color="#818181"
                className="settings-section__icon-btn-img"
              />
            </view>
            <view className="settings-section__icon-btn">
              <Icon
                name="plus"
                size={12}
                color="#818181"
                className="settings-section__icon-btn-img"
              />
            </view>
            <view className="settings-section__icon-btn">
              <Icon
                name="file-json"
                size={12}
                color="#818181"
                className="settings-section__icon-btn-img"
              />
            </view>
          </view>
        </view>

        <view className="kb-table">
          <view className="kb-table__head">
            <text className="kb-table__head-cell kb-table__col-command">Command</text>
            <text className="kb-table__head-cell kb-table__col-key">Keybinding</text>
            <text className="kb-table__head-cell kb-table__col-when">When</text>
            <text className="kb-table__head-cell kb-table__col-status">Status</text>
          </view>
          {BINDINGS.map((b, i) => (
            <view key={b.command} className={i % 2 === 1 ? "kb-row kb-row--zebra" : "kb-row"}>
              <text className="kb-row__command kb-table__col-command">{b.command}</text>
              <view className="kb-row__keys kb-table__col-key">
                {b.keys.map((k) => (
                  <view key={k} className="kb-chip">
                    <text className="kb-chip__text">{k}</text>
                  </view>
                ))}
              </view>
              <text className="kb-row__when kb-table__col-when">{b.when}</text>
              <view className="kb-row__status kb-table__col-status">
                {b.unbound ? (
                  <Icon
                    name="triangle-alert"
                    size={14}
                    color="#fe9a00"
                    className="kb-row__status-img"
                  />
                ) : null}
              </view>
            </view>
          ))}
        </view>
      </view>
    </view>
  );
}

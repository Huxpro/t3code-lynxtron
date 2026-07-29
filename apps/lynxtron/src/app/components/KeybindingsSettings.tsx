export function KeybindingsSettings() {
  return (
    <view className="settings-panel">
      <view className="settings-section">
        <view className="settings-section__header">
          <text className="settings-section__title">Keybindings</text>
        </view>
        <view className="settings-empty-card">
          <text className="settings-empty__text">Keyboard support is limited on Lynxtron.</text>
          <text className="settings-empty__hint">
            New thread, Quick Switch, and Settings are available as native menu commands. Other
            keyboard interactions remain unavailable until the renderer keyboard API is verified.
          </text>
        </view>
      </view>
    </view>
  );
}

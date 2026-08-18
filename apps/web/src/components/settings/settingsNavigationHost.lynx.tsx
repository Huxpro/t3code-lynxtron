import { Icon } from "../../../../lynxtron/src/app/components/Icon";
import { uiActions } from "../../../../lynxtron/src/app/state/uiState";
import type { SettingsNavigationItem, SettingsSectionPath } from "./SettingsNavigationContent";

export function SettingsNavigationHost({
  items,
  onBack,
  onNavigate,
  pathname,
}: {
  readonly items: ReadonlyArray<SettingsNavigationItem>;
  readonly onBack: () => void;
  readonly onNavigate: (to: SettingsSectionPath) => void;
  readonly pathname: string;
}) {
  const openSearch = () => uiActions.openQuickSwitch("command");

  return (
    <>
      <view
        className="settings-nav__search"
        aria-label="Search threads and commands"
        bindtap={openSearch}
      >
        <view className="settings-nav__search-icon" bindtap={openSearch}>
          <Icon name="search" size={16} color="#a1a1aa" className="settings-nav__search-icon-img" />
        </view>
        <text className="settings-nav__search-label" bindtap={openSearch}>
          Search
        </text>
        <view className="settings-nav__search-shortcut" bindtap={openSearch}>
          <text className="settings-nav__search-shortcut-label" bindtap={openSearch}>
            /
          </text>
        </view>
      </view>
      <view className="settings-nav__items">
        {items.map((item) => {
          const isActive = pathname === item.to;
          return (
            <view
              key={item.to}
              className={
                isActive
                  ? `settings-nav__item settings-nav__item--${item.to.slice("/settings/".length)} settings-nav__item--active`
                  : `settings-nav__item settings-nav__item--${item.to.slice("/settings/".length)}`
              }
              bindtap={() => onNavigate(item.to)}
            >
              <Icon
                name={item.icon}
                size={16}
                color={isActive ? "#27272a" : "#a1a1aa"}
                className="settings-nav__item-icon-img"
              />
              <text
                className={
                  isActive
                    ? "settings-nav__item-label settings-nav__item-label--active"
                    : "settings-nav__item-label"
                }
              >
                {item.label}
              </text>
            </view>
          );
        })}
      </view>
      <view className="settings-nav__footer">
        <view className="settings-nav__back" bindtap={onBack}>
          <Icon
            name="arrow-left"
            size={16}
            color="#a1a1aa"
            className="settings-nav__back-icon-img"
          />
          <text className="settings-nav__back-label">Back</text>
        </view>
      </view>
    </>
  );
}

import { Icon } from "../../../../lynxtron/src/app/components/Icon";
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
  return (
    <>
      <view className="settings-nav__items">
        {items.map((item) => {
          const isActive = pathname === item.to;
          return (
            <view
              key={item.to}
              className={
                isActive ? "settings-nav__item settings-nav__item--active" : "settings-nav__item"
              }
              bindtap={() => onNavigate(item.to)}
            >
              <Icon
                name={item.icon}
                size={16}
                color={isActive ? "#f1f3f7" : "#a1a1aa"}
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

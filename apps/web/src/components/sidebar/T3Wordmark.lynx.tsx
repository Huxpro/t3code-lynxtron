import { Icon } from "../../../../lynxtron/src/app/components/Icon";

export function T3Wordmark({ onBackdrop: _onBackdrop = false }: { readonly onBackdrop?: boolean }) {
  return (
    <view
      className={`lynx-sidebar-wordmark${_onBackdrop ? " lynx-sidebar-wordmark--backdrop" : ""}`}
    >
      <Icon
        name="t3-wordmark"
        size={10}
        className="lynx-sidebar-wordmark__dark"
        themeOverride="dark"
      />
      <Icon
        name="t3-wordmark"
        size={10}
        className="lynx-sidebar-wordmark__light"
        themeOverride="light"
      />
    </view>
  );
}

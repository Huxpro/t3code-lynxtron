import { Icon } from "../../../../lynxtron/src/app/components/Icon";

export function T3Wordmark({ onBackdrop: _onBackdrop = false }: { readonly onBackdrop?: boolean }) {
  return (
    <Icon
      name="t3-wordmark"
      size={10}
      className="lynx-sidebar-wordmark"
      themeOverride={_onBackdrop ? "dark" : "light"}
    />
  );
}

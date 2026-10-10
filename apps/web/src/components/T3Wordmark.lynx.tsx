import { Icon } from "../../../lynxtron/src/app/components/Icon";

// Upstream draws the wordmark as one SVG in the text colour and sizes it with
// SVG props. Lynx draws two fixed sprites and shows the one for the theme, or
// the dark-theme one under a `text-white` ancestor (the brand on stage
// artwork), so the SVG props have nothing to apply to.
export function T3Wordmark(_props: {
  readonly "aria-label"?: string;
  readonly className?: string;
}) {
  return (
    <view className="lynx-sidebar-wordmark">
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

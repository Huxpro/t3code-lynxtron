import type { ReactNode } from "@lynx-js/react";

import { Icon } from "../../../../lynxtron/src/app/components/Icon";
import type { SettingsSectionPath } from "./SettingsNavigationContent";
import type { SettingsRestoreConfirmationModel } from "./settingsRouteState";

export function SettingsRouteHost({
  children,
  contentId,
  confirmation,
  onCancelRestore,
  onConfirmRestore,
  onBack,
  onNavigate,
  onRestore,
  pathname,
  restoreDisabled,
  restoreLabel,
  showRestore,
}: {
  readonly children: ReactNode;
  readonly contentId?: string | undefined;
  readonly confirmation: SettingsRestoreConfirmationModel | null;
  readonly electron: boolean;
  readonly onBack: () => void;
  readonly onCancelRestore: () => void;
  readonly onConfirmRestore: () => void;
  readonly onNavigate: (to: SettingsSectionPath) => void;
  readonly onRestore: () => void;
  readonly pathname: string;
  readonly restoreDisabled: boolean;
  readonly restoreLabel: string;
  readonly showRestore: boolean;
}) {
  return (
    <view className="settings-root">
      <view className="settings-main">
        <view className="settings-topbar">
          <text className="settings-topbar__title">Settings</text>
          <view className="settings-topbar__spacer" />
          {showRestore ? (
            <view
              className={
                restoreDisabled
                  ? "settings-topbar__restore settings-topbar__restore--disabled"
                  : "settings-topbar__restore"
              }
              bindtap={onRestore}
            >
              <Icon
                name="rotate-ccw"
                size={14}
                color="#f5f5f5"
                className="settings-topbar__restore-icon-img"
              />
              <text className="settings-topbar__restore-label">{restoreLabel}</text>
            </view>
          ) : null}
        </view>
        <scroll-view scroll-orientation="vertical" className="settings-scroll">
          <view
            className={
              contentId ? `settings-content settings-content--${contentId}` : "settings-content"
            }
          >
            {children}
          </view>
        </scroll-view>
        {confirmation ? (
          <view className="settings-restore-overlay">
            <view className="settings-restore-dialog">
              <text className="settings-restore-dialog__title">{confirmation.title}</text>
              <text className="settings-restore-dialog__description">
                {confirmation.description}
              </text>
              <view className="settings-restore-dialog__actions">
                <view className="settings-restore-dialog__button" bindtap={onCancelRestore}>
                  <text className="settings-restore-dialog__button-label">
                    {confirmation.actions[0].label}
                  </text>
                </view>
                <view
                  className="settings-restore-dialog__button settings-restore-dialog__button--primary"
                  bindtap={onConfirmRestore}
                >
                  <text className="settings-restore-dialog__button-label">
                    {confirmation.actions[1].label}
                  </text>
                </view>
              </view>
            </view>
          </view>
        ) : null}
      </view>
    </view>
  );
}

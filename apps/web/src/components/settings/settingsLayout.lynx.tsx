import { type ReactNode } from "@lynx-js/react";

import { Button } from "../ui/button";
import { HostText, HostView } from "../ui/hostElements";

type LynxClassNameProps = {
  readonly className?: string;
};

function joinClassNames(...values: ReadonlyArray<string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function SettingsSection({
  id,
  title,
  icon,
  headerAction,
  children,
  className,
  stacked = false,
}: LynxClassNameProps & {
  readonly id?: string;
  readonly title: string;
  readonly icon?: ReactNode;
  readonly headerAction?: ReactNode;
  readonly children: ReactNode;
  readonly stacked?: boolean;
}) {
  const header = (
    <view
      className={
        headerAction
          ? "settings-section__header settings-section__header--row"
          : "settings-section__header"
      }
    >
      <view className="settings-section__title-wrap">
        {icon}
        <text className="settings-section__title">{title}</text>
      </view>
      {headerAction ? <view className="settings-section__header-right">{headerAction}</view> : null}
    </view>
  );

  if (stacked) {
    return (
      <view id={id} className={className}>
        {header}
        <view className="settings-section__rows flex w-full min-w-0 flex-col self-stretch">
          {children}
        </view>
      </view>
    );
  }

  return (
    <view
      id={id}
      className={joinClassNames(
        "settings-section flex w-full min-w-0 flex-col self-stretch",
        className,
      )}
    >
      {header}
      <view className="settings-section__rows flex w-full min-w-0 flex-col self-stretch">
        {children}
      </view>
    </view>
  );
}

export function SettingsRow({
  id,
  title,
  description,
  status,
  resetAction,
  control,
  children,
  unavailable = false,
  className,
  onContextMenu,
}: LynxClassNameProps & {
  readonly id?: string;
  readonly title: ReactNode;
  readonly description: ReactNode;
  readonly status?: ReactNode;
  readonly resetAction?: ReactNode;
  readonly control?: ReactNode;
  readonly children?: ReactNode;
  readonly unavailable?: boolean;
  readonly onContextMenu?: ((event: unknown) => void) | undefined;
}) {
  return (
    <HostView
      id={id}
      data-settings-row="true"
      aria-disabled={unavailable ? "true" : undefined}
      data-settings-unavailable={unavailable ? "true" : undefined}
      className={joinClassNames(
        "settings-row flex w-full min-w-0 self-stretch",
        unavailable ? "settings-row--unavailable" : undefined,
        className,
      )}
      onContextMenu={onContextMenu}
    >
      <view className="settings-row__text flex min-w-0 flex-1 flex-col">
        <view className="settings-row__title-line">
          <HostText className="settings-row__title" onContextMenu={onContextMenu}>
            {title}
          </HostText>
          {resetAction ? <view className="settings-row__reset">{resetAction}</view> : null}
        </view>
        <HostText className="settings-row__desc" onContextMenu={onContextMenu}>
          {description}
        </HostText>
        {status ? (
          <HostText className="settings-row__status" onContextMenu={onContextMenu}>
            {status}
          </HostText>
        ) : null}
      </view>
      {control ? <view className="settings-row__control">{control}</view> : null}
      {children}
    </HostView>
  );
}

export function SettingResetButton({
  label,
  onClick,
  icon,
}: {
  readonly label: string;
  readonly onClick: () => void;
  readonly icon?: ReactNode;
}) {
  return (
    <Button
      aria-label={`Reset ${label} to default`}
      className="settings-reset-button"
      onClick={onClick}
      size="icon-xs"
      variant="ghost"
    >
      {icon ?? "↶"}
    </Button>
  );
}

export function SettingsPageContainer({
  children,
  className,
}: LynxClassNameProps & {
  readonly children: ReactNode;
}) {
  return <view className={joinClassNames("settings-panel", className)}>{children}</view>;
}

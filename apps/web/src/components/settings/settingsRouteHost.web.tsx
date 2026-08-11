import { RotateCcwIcon } from "lucide-react";
import type { ReactNode } from "react";

import type { SettingsSectionPath } from "./SettingsNavigationContent";
import type { SettingsRestoreConfirmationModel } from "./settingsRouteState";

const COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS =
  "[[data-sidebar-state=collapsed]_&]:pl-[var(--workspace-titlebar-content-left)]";

export function SettingsRouteHost({
  children,
  contentId,
  confirmation,
  electron,
  onCancelRestore,
  onConfirmRestore,
  onRestore,
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
  const restore = showRestore ? (
    <button
      type="button"
      className="inline-flex h-7 items-center justify-center rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted disabled:opacity-50"
      disabled={restoreDisabled}
      onClick={onRestore}
    >
      <RotateCcwIcon className="mx-1 size-3.5" />
      {restoreLabel}
    </button>
  ) : null;

  return (
    <main className="settings-root relative flex h-dvh min-h-0 min-w-0 flex-1 flex-col overflow-hidden overscroll-y-none bg-background text-foreground isolate">
      <div className="settings-main flex min-h-0 min-w-0 flex-1 flex-col bg-background text-foreground">
        {!electron ? (
          <header
            className={`settings-topbar px-3 py-2 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none sm:px-5 ${COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS}`}
          >
            <div className="flex min-h-7 items-center gap-2 sm:min-h-6">
              <span className="text-sm font-medium text-foreground">Settings</span>
              <div className="ms-auto flex items-center gap-2">{restore}</div>
            </div>
          </header>
        ) : (
          <div
            className={`settings-topbar drag-region flex h-[52px] shrink-0 items-center px-5 transition-[padding-left] duration-200 ease-linear motion-reduce:transition-none wco:h-[env(titlebar-area-height)] wco:pr-[calc(100vw-env(titlebar-area-width)-env(titlebar-area-x)+1em)] ${COLLAPSED_SIDEBAR_TITLEBAR_INSET_CLASS}`}
          >
            <span className="text-xs font-medium tracking-wide text-muted-foreground/70">
              Settings
            </span>
            <div className="ms-auto flex items-center gap-2">{restore}</div>
          </div>
        )}
        <div className="min-h-0 flex flex-1 flex-col">{children}</div>
      </div>
      {confirmation ? (
        <div className="settings-restore-overlay absolute inset-0 z-50 flex items-center justify-center bg-black/55 px-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={confirmation.title}
            className="settings-restore-dialog w-full max-w-md rounded-xl border border-border bg-background p-5 shadow-2xl"
          >
            <h2 className="settings-restore-dialog__title text-base font-semibold text-foreground">
              {confirmation.title}
            </h2>
            <p className="settings-restore-dialog__description mt-2 text-sm leading-5 text-muted-foreground">
              {confirmation.description}
            </p>
            <div className="settings-restore-dialog__actions mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="settings-restore-dialog__button h-8 rounded-md px-3 text-xs font-medium text-foreground hover:bg-muted"
                onClick={onCancelRestore}
              >
                {confirmation.actions[0].label}
              </button>
              <button
                type="button"
                className="settings-restore-dialog__button settings-restore-dialog__button--primary h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground"
                onClick={onConfirmRestore}
              >
                {confirmation.actions[1].label}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

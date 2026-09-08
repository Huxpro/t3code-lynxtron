/**
 * Renderer-neutral right-panel chrome (AR5.3).
 *
 * One physical module owns the right panel's shared anatomy for Web's
 * RightPanelTabs and the Lynx right panel: the tab row (icon, title, close
 * affordance, active/pending treatments), the add-surface item row, and the
 * empty-state card grid. Behavior hosts keep context menus, middle-click
 * close, tooltips, menus, and tap handlers; icons enter as platform leaves.
 */
import { Fragment, type ReactNode } from "react";

import { cn } from "../lib/cn";
import { HostButton, HostText, HostView } from "./ui/hostElements";

/** One right-panel tab: activate body plus close affordance. */
export function RightPanelTabSurface({
  icon,
  title,
  active,
  pending = false,
  onActivate,
  onClose,
  closeIcon,
  pendingCloseIcon,
  closeVisible = false,
  renderActivateWrapper,
  onMouseDown,
  onAuxClick,
  onContextMenu,
}: {
  /** Surface-kind icon node (platform leaf). */
  readonly icon: ReactNode;
  readonly title: string;
  readonly active: boolean;
  /** Pending surfaces show a live dot behind the close affordance on Web. */
  readonly pending?: boolean;
  readonly onActivate: () => void;
  readonly onClose: () => void;
  /** Close affordance node (platform leaf: X icon or glyph). */
  readonly closeIcon: ReactNode;
  /** Close affordance shown over the pending dot on hover (Web only). */
  readonly pendingCloseIcon?: ReactNode;
  /**
   * Keep the close affordance visible instead of hover-revealed. Required on
   * hoverless platforms (R6), where hover selectors never fire.
   */
  readonly closeVisible?: boolean;
  /** Web-only wrapper for the activate button (full-title tooltip). */
  readonly renderActivateWrapper?: (button: ReactNode) => ReactNode;
  /** Web tab-row handlers (context menu, middle-click close); omitted on Lynx. */
  readonly onMouseDown?: ((event: unknown) => void) | undefined;
  readonly onAuxClick?: ((event: unknown) => void) | undefined;
  readonly onContextMenu?: ((event: unknown) => void) | undefined;
}) {
  const activateButton = (
    <HostButton
      type="button"
      className="flex min-w-0 flex-1 items-center gap-1.5"
      onClick={onActivate}
      {...(onAuxClick ? { onAuxClick } : {})}
      aria-label={title}
    >
      {icon}
      <HostText className="truncate" {...(onAuxClick ? { onAuxClick } : {})}>
        {title}
      </HostText>
    </HostButton>
  );
  const closeVisibilityClass =
    pending || closeVisible ? "opacity-100" : "opacity-0 group-hover:opacity-100";
  return (
    <HostView
      data-active-tab={active}
      data-pending-tab={pending}
      {...(onMouseDown ? { onMouseDown } : {})}
      {...(onAuxClick ? { onAuxClick } : {})}
      {...(onContextMenu ? { onContextMenu } : {})}
      className={cn(
        "group lynx-titlebar-no-drag flex h-7 min-w-25 max-w-44 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm",
        active
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {renderActivateWrapper ? renderActivateWrapper(activateButton) : activateButton}
      <HostButton
        type="button"
        className={cn(
          "relative flex size-4 shrink-0 items-center justify-center rounded hover:bg-muted focus:opacity-100",
          closeVisibilityClass,
        )}
        aria-label={`Close ${title}`}
        onClick={onClose}
      >
        {pending && pendingCloseIcon ? (
          <>
            <HostText className="size-2 rounded-full bg-current group-hover:hidden" aria-hidden />
            <HostView className="hidden group-hover:block">{pendingCloseIcon}</HostView>
          </>
        ) : (
          closeIcon
        )}
      </HostButton>
    </HostView>
  );
}

export interface RightPanelActionItem {
  readonly key: string;
  /** Action icon node (platform leaf). */
  readonly icon: ReactNode;
  readonly label: string;
  readonly description: string;
  readonly disabled?: boolean;
  readonly onSelect: () => void;
}

/** Empty-state card grid shown when no surface is active. */
export function RightPanelEmptySurface({
  actions,
  renderDisabledWrapper,
}: {
  readonly actions: ReadonlyArray<RightPanelActionItem>;
  /**
   * Web-only wrapper for disabled cards (disabled-reason tooltip). Defaults
   * to identity; the surface owns the card chrome either way.
   */
  readonly renderDisabledWrapper?: (action: RightPanelActionItem, card: ReactNode) => ReactNode;
}) {
  const actionRows = Array.from({ length: Math.ceil(actions.length / 2) }, (_unused, index) =>
    actions.slice(index * 2, index * 2 + 2),
  );
  return (
    <HostView
      data-right-panel-empty-state
      className="flex min-h-0 flex-1 items-center justify-center p-6"
    >
      <HostView className="w-full max-w-xl">
        <HostView className="mb-5 flex flex-col items-center">
          <HostText className="right-panel-empty__title text-sm font-medium text-foreground">
            Open a surface
          </HostText>
          <HostText className="right-panel-empty__description mt-1 text-xs text-muted-foreground">
            Choose what to show in the right panel.
          </HostText>
        </HostView>
        <HostView className="right-panel-empty-grid flex flex-col gap-2">
          {actionRows.map((row, rowIndex) => (
            <HostView
              key={`right-panel-empty-row:${rowIndex}`}
              className="right-panel-empty-row flex w-full gap-2"
            >
              {row.map((action) => {
                const card = (
                  <HostButton
                    type="button"
                    data-right-panel-action={action.key}
                    {...(action.disabled
                      ? { "aria-disabled": true }
                      : { onClick: action.onSelect })}
                    className={cn(
                      "right-panel-empty-card flex min-h-28 min-w-0 flex-1 flex-col items-start rounded-lg border border-border/80 bg-card p-4 text-left",
                      action.disabled
                        ? "cursor-not-allowed opacity-40 dark:border-transparent dark:shadow-none dark:inset-ring-1 dark:inset-ring-white/5"
                        : "transition hover:border-border hover:bg-accent/60 dark:border-transparent dark:shadow-none dark:inset-ring-1 dark:inset-ring-white/5",
                    )}
                  >
                    <HostView className="right-panel-empty-card__icon mb-3">{action.icon}</HostView>
                    <HostText className="right-panel-empty-card__title text-sm font-medium">
                      {action.label}
                    </HostText>
                    <HostText className="right-panel-empty-card__description mt-1 text-xs leading-relaxed text-muted-foreground">
                      {action.description}
                    </HostText>
                  </HostButton>
                );
                return (
                  <Fragment key={action.key}>
                    {action.disabled && renderDisabledWrapper
                      ? renderDisabledWrapper(action, card)
                      : card}
                  </Fragment>
                );
              })}
            </HostView>
          ))}
        </HostView>
      </HostView>
    </HostView>
  );
}

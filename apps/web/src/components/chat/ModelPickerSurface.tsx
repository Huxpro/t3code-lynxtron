/**
 * Renderer-neutral model-picker composition (AR5.1).
 *
 * One physical module owns the model picker's row, provider rail, search,
 * and empty anatomy for Web's `ModelPickerContent` and the Lynx model
 * picker. Behavior hosts (Web's combobox items and popover, Lynx's overlay
 * panel and tap rows) wrap the surface; provider icons, favorite stars, and
 * hint affordances enter as nodes. Keyboard hint labels render only what the
 * host passes — hosts must not show hints that lack verified runtime
 * acceptance.
 */
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { HostButton, HostText, HostView } from "../ui/hostElements";

export function ModelPickerOverlaySurface({
  children,
  onBackdropClick,
  onPanelClick,
}: {
  readonly children: ReactNode;
  readonly onBackdropClick?: (() => void) | undefined;
  readonly onPanelClick?: ((event: unknown) => void) | undefined;
}) {
  return (
    <HostView
      className="model-picker-overlay fixed inset-0 z-50 flex items-center justify-center bg-black/55"
      onClick={onBackdropClick}
    >
      <HostView
        className="model-picker-panel h-[21.625rem] w-[22.5rem] overflow-hidden rounded-lg border border-border bg-popover shadow-2xl"
        onClick={onPanelClick}
      >
        {children}
      </HostView>
    </HostView>
  );
}

export function ModelPickerBodySurface({ children }: { readonly children?: ReactNode }) {
  return <HostView className="model-picker-body flex h-full min-h-0">{children}</HostView>;
}

export function ModelPickerContentSurface({
  children,
  filteredModelKeys,
  hasRail = false,
  selectedModelKey,
  selectedProviderId,
}: {
  readonly children?: ReactNode;
  readonly filteredModelKeys?: ReadonlyArray<string> | undefined;
  readonly hasRail?: boolean | undefined;
  readonly selectedModelKey?: string | undefined;
  readonly selectedProviderId?: string | undefined;
}) {
  return (
    <HostView
      className={cn(
        "model-picker-content flex h-full min-w-0 flex-1 flex-col",
        hasRail && "model-picker-content--with-rail",
      )}
      data-model-picker-filtered-keys={
        filteredModelKeys ? JSON.stringify(filteredModelKeys) : undefined
      }
      data-model-picker-selected-model={selectedModelKey}
      data-model-picker-selected-provider={selectedProviderId}
    >
      {children}
    </HostView>
  );
}

/** Centered model-list empty state. */
export function ModelPickerEmptySurface({ message }: { readonly message: string }) {
  return (
    <HostView className="model-picker-empty flex items-center justify-center py-6">
      <HostText className="model-picker-empty-text text-sm text-muted-foreground">
        {message}
      </HostText>
    </HostView>
  );
}

/** "New model" badge shown beside the model name. */
export function ModelPickerNewBadge() {
  return (
    <HostText
      aria-label="New model"
      className="model-picker-new-badge shrink-0 rounded border border-amber-500/35 bg-amber-500/15 px-0.5 py-px text-[10px] font-bold uppercase leading-none tracking-wide text-amber-800 dark:border-amber-400/30 dark:bg-amber-400/12 dark:text-amber-200"
    >
      New
    </HostText>
  );
}

export interface ModelPickerRowContentProps {
  /** Display model name (already resolved by the host projection). */
  readonly name: ReactNode;
  readonly showNewBadge?: boolean | undefined;
  /** Provider icon node (platform leaf). */
  readonly providerIcon?: ReactNode | undefined;
  /** Provider line ("Instance · SubProvider"); hidden when undefined. */
  readonly providerLabel?: ReactNode | undefined;
  /** Favorite-star marker leading the name (Lynx: ★ glyph). */
  readonly favoriteMarker?: ReactNode | undefined;
  /** Trailing slot (jump hint + favorite toggle button). */
  readonly trailing?: ReactNode | undefined;
}

/** Model row inner anatomy, for hosts with their own interactive wrapper. */
export function ModelPickerRowContent({
  name,
  showNewBadge = false,
  providerIcon,
  providerLabel,
  favoriteMarker,
  trailing,
}: ModelPickerRowContentProps) {
  return (
    <>
      <HostView className="model-picker-row-copy flex min-w-0 flex-1 flex-col text-left">
        <HostView className="model-picker-row-title-line flex min-w-0 items-center gap-2">
          {favoriteMarker}
          <HostText className="model-picker-row-name min-w-0 truncate text-xs font-medium leading-snug text-foreground">
            {name}
          </HostText>
          {showNewBadge ? <ModelPickerNewBadge /> : null}
        </HostView>
        {providerLabel ? (
          <HostView className="model-picker-row-provider-line mt-1 flex items-center gap-1.5">
            {providerIcon}
            <HostText className="model-picker-row-provider-label truncate text-xs font-normal leading-snug text-muted-foreground/70">
              {providerLabel}
            </HostText>
          </HostView>
        ) : null}
      </HostView>
      {trailing ? (
        <HostView className="model-picker-row-trailing flex shrink-0 items-center gap-1.5">
          {trailing}
        </HostView>
      ) : null}
    </>
  );
}

export interface ModelPickerRowSurfaceProps extends ModelPickerRowContentProps {
  readonly semanticKey?: string | undefined;
  readonly selected?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly disabledReason?: string | null | undefined;
  readonly onSelect?: (() => void) | undefined;
  readonly onDisabledSelect?: (() => void) | undefined;
  readonly onHoverStart?: (() => void) | undefined;
  readonly onHoverEnd?: (() => void) | undefined;
}

/** Model row with its own host wrapper (Lynx tap rows). */
export function ModelPickerRowSurface({
  semanticKey,
  selected = false,
  disabled = false,
  disabledReason,
  onSelect,
  onDisabledSelect,
  onHoverStart,
  onHoverEnd,
  ...contentProps
}: ModelPickerRowSurfaceProps) {
  const handleDisabledSelect = (event: unknown) => {
    if (typeof event === "object" && event !== null && "stopPropagation" in event) {
      (event as { stopPropagation?: () => void }).stopPropagation?.();
    }
    onDisabledSelect?.();
  };
  const className = cn(
    "model-picker-row group relative flex w-full min-w-0 max-w-full items-center gap-3 rounded-md px-2 py-2",
    selected
      ? "model-picker-row--selected bg-foreground/[0.08] text-foreground"
      : "model-picker-row--unselected",
    disabled ? "opacity-64" : "cursor-pointer",
  );
  if (disabled || !onSelect) {
    if (disabled && onDisabledSelect) {
      return (
        <HostButton
          type="button"
          aria-disabled="true"
          className={className}
          data-model-picker-key={semanticKey}
          data-model-picker-selected={selected ? "true" : "false"}
          data-model-picker-disabled="true"
          data-model-picker-disabled-reason={disabledReason ?? undefined}
          onClick={handleDisabledSelect}
          onMouseEnter={onHoverStart}
          onMouseLeave={onHoverEnd}
        >
          <ModelPickerRowContent {...contentProps} />
        </HostButton>
      );
    }
    return (
      <HostView
        className={className}
        data-model-picker-key={semanticKey}
        data-model-picker-selected={selected ? "true" : "false"}
        data-model-picker-disabled={disabled ? "true" : "false"}
        data-model-picker-disabled-reason={disabledReason ?? undefined}
        onMouseEnter={onHoverStart}
        onMouseLeave={onHoverEnd}
      >
        <ModelPickerRowContent {...contentProps} />
      </HostView>
    );
  }
  return (
    <HostButton
      type="button"
      className={className}
      data-model-picker-key={semanticKey}
      data-model-picker-selected={selected ? "true" : "false"}
      onClick={onSelect}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <ModelPickerRowContent {...contentProps} />
    </HostButton>
  );
}

export interface ModelPickerRailItemSurfaceProps {
  /** Provider or favorites icon node (platform leaf). */
  readonly icon: ReactNode;
  readonly label: string;
  readonly semanticId?: string | undefined;
  readonly active?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly disabledReason?: string | null | undefined;
  readonly onSelect: () => void;
  readonly onDisabledSelect?: (() => void) | undefined;
  readonly onHoverStart?: (() => void) | undefined;
  readonly onHoverEnd?: (() => void) | undefined;
}

/** One provider-rail icon button (favorites star or instance icon). */
export function ModelPickerRailItemSurface({
  icon,
  label,
  semanticId,
  active = false,
  disabled = false,
  disabledReason,
  onSelect,
  onDisabledSelect,
  onHoverStart,
  onHoverEnd,
}: ModelPickerRailItemSurfaceProps) {
  const handleSelect = (event: unknown) => {
    if (typeof event === "object" && event !== null && "stopPropagation" in event) {
      (event as { stopPropagation?: () => void }).stopPropagation?.();
    }
    onSelect();
  };
  const handleDisabledSelect = (event: unknown) => {
    if (typeof event === "object" && event !== null && "stopPropagation" in event) {
      (event as { stopPropagation?: () => void }).stopPropagation?.();
    }
    onDisabledSelect?.();
  };
  return (
    <HostButton
      type="button"
      aria-label={label}
      aria-disabled={disabled ? "true" : "false"}
      data-model-picker-provider={semanticId}
      data-model-picker-provider-active={active ? "true" : "false"}
      data-model-picker-provider-disabled={disabled ? "true" : "false"}
      data-model-picker-provider-disabled-reason={disabledReason ?? undefined}
      className={cn(
        "model-picker-rail-item relative flex aspect-square w-full cursor-pointer items-center justify-center rounded-md",
        active && "model-picker-rail-item--active bg-foreground/[0.08]",
        disabled && "model-picker-rail-item--disabled opacity-50",
      )}
      onClick={disabled ? handleDisabledSelect : handleSelect}
      onMouseEnter={onHoverStart}
      onMouseLeave={onHoverEnd}
    >
      <HostView className="model-picker-rail-icon pointer-events-none">{icon}</HostView>
      {active ? <HostView className="model-picker-rail-indicator" /> : null}
    </HostButton>
  );
}

export function ModelPickerRailSeparatorSurface() {
  return <HostView className="model-picker-rail-separator h-px shrink-0 bg-border/70" />;
}

/** Provider rail column anatomy: favorites item first, then instance items. */
export function ModelPickerRailSurface({ children }: { readonly children?: ReactNode }) {
  return (
    <HostView className="model-picker-rail flex w-11 shrink-0 flex-col gap-1 overflow-hidden bg-muted/30 p-1">
      {children}
    </HostView>
  );
}

/** Search row anatomy: leading icon slot plus the platform input control. */
export function ModelPickerSearchSurface({
  icon,
  input,
  trailing,
}: {
  readonly icon: ReactNode;
  readonly input: ReactNode;
  readonly trailing?: ReactNode;
}) {
  return (
    <HostView className="model-picker-search flex items-center gap-2 border-b border-border/60 px-3 py-2">
      {icon}
      {input}
      {trailing}
    </HostView>
  );
}

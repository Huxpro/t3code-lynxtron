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
      <HostView className="min-w-0 flex-1 text-left">
        <HostView className="flex min-w-0 items-center gap-2">
          {favoriteMarker}
          <HostText className="model-picker-row-name min-w-0 truncate text-xs font-medium leading-snug text-foreground">
            {name}
          </HostText>
          {showNewBadge ? <ModelPickerNewBadge /> : null}
        </HostView>
        {providerLabel ? (
          <HostView className="mt-1 flex items-center gap-1.5">
            {providerIcon}
            <HostText className="truncate text-xs font-normal leading-snug text-muted-foreground/70">
              {providerLabel}
            </HostText>
          </HostView>
        ) : null}
      </HostView>
      {trailing ? (
        <HostView className="flex shrink-0 items-center gap-1.5">{trailing}</HostView>
      ) : null}
    </>
  );
}

export interface ModelPickerRowSurfaceProps extends ModelPickerRowContentProps {
  readonly selected?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly onSelect?: (() => void) | undefined;
}

/** Model row with its own host wrapper (Lynx tap rows). */
export function ModelPickerRowSurface({
  selected = false,
  disabled = false,
  onSelect,
  ...contentProps
}: ModelPickerRowSurfaceProps) {
  const className = cn(
    "model-picker-row group relative flex w-full min-w-0 max-w-full items-center gap-3 rounded-md px-2 py-2",
    selected && "model-picker-row--selected bg-foreground/[0.08] text-foreground",
    disabled ? "opacity-64" : "cursor-pointer",
  );
  if (disabled || !onSelect) {
    return (
      <HostView className={className}>
        <ModelPickerRowContent {...contentProps} />
      </HostView>
    );
  }
  return (
    <HostButton type="button" className={className} onClick={onSelect}>
      <ModelPickerRowContent {...contentProps} />
    </HostButton>
  );
}

export interface ModelPickerRailItemSurfaceProps {
  /** Provider or favorites icon node (platform leaf). */
  readonly icon: ReactNode;
  readonly label: string;
  readonly active?: boolean | undefined;
  readonly onSelect: () => void;
}

/** One provider-rail icon button (favorites star or instance icon). */
export function ModelPickerRailItemSurface({
  icon,
  label,
  active = false,
  onSelect,
}: ModelPickerRailItemSurfaceProps) {
  return (
    <HostButton
      type="button"
      aria-label={label}
      className={cn(
        "model-picker-rail-item relative flex aspect-square w-full cursor-pointer items-center justify-center rounded-md",
        active && "model-picker-rail-item--active bg-foreground/[0.08]",
      )}
      onClick={onSelect}
    >
      {icon}
    </HostButton>
  );
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
}: {
  readonly icon: ReactNode;
  readonly input: ReactNode;
}) {
  return (
    <HostView className="model-picker-search flex items-center gap-2 border-b border-border/60 px-3 py-2">
      {icon}
      {input}
    </HostView>
  );
}

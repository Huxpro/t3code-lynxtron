/**
 * Renderer-neutral command-palette row composition (AR5.1).
 *
 * One physical module owns the palette's result anatomy for Web's
 * CommandPalette and Lynx's Quick Switch: group labels, result rows (icon,
 * title with optional leading content, optional description, timestamp,
 * shortcut hint, trailing content), and the empty state. Behavior hosts
 * (Web's autocomplete items, Lynx's tap rows) wrap the surface; platform
 * icons and shortcut affordances enter as nodes.
 *
 * Shortcut hints render only what the host passes — hosts must not show
 * keyboard labels that lack verified runtime acceptance.
 */
import type { ReactNode } from "react";

import { cn } from "../lib/cn";
import { HostButton, HostText, HostView } from "./ui/hostElements";

export function PaletteOverlaySurface({
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
      className="palette-overlay fixed inset-0 z-50 flex items-start justify-center bg-black/55 pt-16"
      onClick={onBackdropClick}
    >
      <HostView
        className="palette-panel w-full max-w-[36rem] overflow-hidden rounded-xl border border-border bg-popover shadow-2xl"
        onClick={onPanelClick}
      >
        {children}
      </HostView>
    </HostView>
  );
}

export function PaletteSearchSurface({
  icon,
  input,
}: {
  readonly icon: ReactNode;
  readonly input: ReactNode;
}) {
  return (
    <HostView className="palette-search flex h-11 items-center gap-2 border-b border-border px-3">
      {icon}
      {input}
    </HostView>
  );
}

export function PaletteResultsSurface({
  children,
  empty = false,
}: {
  readonly children?: ReactNode;
  readonly empty?: boolean;
}) {
  return (
    <HostView
      className={cn(
        "palette-results max-h-96 overflow-y-auto",
        empty ? "palette-results--empty" : "p-1.5",
      )}
    >
      {children}
    </HostView>
  );
}

export function PaletteFooterSurface({ children }: { readonly children?: ReactNode }) {
  return (
    <HostView className="palette-footer flex h-8 items-center gap-4 border-t border-border px-3 text-xs text-muted-foreground">
      {children}
    </HostView>
  );
}

/** Group label above a section of palette results. */
export function PaletteSectionSurface({ label }: { readonly label: string }) {
  return (
    <HostText className="palette-section-label px-2 py-1.5 text-xs font-medium text-muted-foreground">
      {label}
    </HostText>
  );
}

/** Centered empty state for a palette with no matching results. */
export function PaletteEmptySurface({ message }: { readonly message: string }) {
  return (
    <HostView className="palette-empty flex items-center justify-center py-10 text-center">
      <HostText className="palette-empty-text text-sm text-muted-foreground">{message}</HostText>
    </HostView>
  );
}

export interface PaletteRowSurfaceProps {
  /** Host-specific semantic selector; product anatomy remains shared. */
  readonly semanticClassName?: string | undefined;
  readonly icon?: ReactNode | undefined;
  readonly title: ReactNode;
  /** Inline content leading the title (badges, status dots). */
  readonly titleLeading?: ReactNode | undefined;
  /** Secondary line under the title (description, content match). */
  readonly description?: ReactNode | undefined;
  /** Content trailing the title block (Web: titleTrailingContent). */
  readonly titleTrailing?: ReactNode | undefined;
  /** Right-aligned timestamp/hint label. */
  readonly timestamp?: ReactNode | undefined;
  /** Right-aligned shortcut affordance (verified hosts only). */
  readonly shortcut?: ReactNode | undefined;
  /** Terminal slot after all hints (submenu chevron). */
  readonly chevron?: ReactNode | undefined;
  readonly active?: boolean | undefined;
  readonly disabled?: boolean | undefined;
  readonly onSelect?: (() => void) | undefined;
}

/** Row inner anatomy, for hosts that provide their own interactive wrapper. */
export function PaletteRowContent({
  icon,
  title,
  titleLeading,
  description,
  titleTrailing,
  timestamp,
  shortcut,
  chevron,
}: PaletteRowSurfaceProps) {
  return (
    <>
      {icon}
      {description ? (
        <HostView className="flex min-w-0 flex-1 flex-col">
          <HostView className="flex min-w-0 items-center gap-1.5 text-sm text-foreground">
            {titleLeading}
            <HostText className="truncate">{title}</HostText>
          </HostView>
          <HostText className="truncate text-xs text-muted-foreground/70">{description}</HostText>
        </HostView>
      ) : (
        <HostView className="flex min-w-0 flex-1 items-center gap-1.5 text-sm text-foreground">
          {titleLeading}
          <HostText className="truncate">{title}</HostText>
        </HostView>
      )}
      {titleTrailing}
      {timestamp ? (
        <HostText className="min-w-12 shrink-0 text-right text-xs tabular-nums text-muted-foreground/70">
          {timestamp}
        </HostText>
      ) : null}
      {shortcut}
      {chevron}
    </>
  );
}

/** One palette result row with its own host wrapper (Lynx tap rows, static rows). */
export function PaletteRowSurface({
  active = false,
  disabled = false,
  onSelect,
  semanticClassName,
  ...contentProps
}: PaletteRowSurfaceProps) {
  const rowClassName = cn(
    "palette-row flex min-h-8 select-none items-center gap-2 rounded-sm px-2 py-1.5 text-base sm:min-h-7 sm:text-sm",
    active && "bg-accent text-accent-foreground",
    disabled ? "opacity-64" : "cursor-pointer",
    semanticClassName,
  );

  if (disabled || !onSelect) {
    return (
      <HostView className={rowClassName}>
        <PaletteRowContent {...contentProps} />
      </HostView>
    );
  }
  return (
    <HostButton type="button" className={rowClassName} onClick={onSelect}>
      <PaletteRowContent {...contentProps} />
    </HostButton>
  );
}

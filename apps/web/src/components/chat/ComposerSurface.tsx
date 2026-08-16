/**
 * Renderer-neutral Composer chrome composition (AR4).
 *
 * One physical module owns the Composer shell anatomy for both Web and Lynx:
 * the framed surface, editor area, footer toolbar row with its separator
 * anatomy, the context strip, and the hero headline copy. The editor kernel,
 * toolbar controls, and primary actions stay platform islands entering
 * through the `ComposerSurfaceElements` contract; product state (sendability,
 * mode presentations, checkout/branch context) stays in the shared
 * client-runtime projections both hosts already consume.
 *
 * Canonical footer control order (both hosts, left to right):
 *   model → model option/traits → runtime mode → interaction mode → plan
 * Send/stop primary actions sit at the trailing edge in every state.
 */
import { Fragment, type CSSProperties, type ReactNode } from "react";

import { cn } from "../../lib/cn";
import { HostButton, HostHeadline, HostText, HostView } from "../ui/hostElements";

/** Shared Composer shell width/centering (Web applies it to its <form>). */
export const COMPOSER_SHELL_CLASS = "composer-shell mx-auto w-full min-w-0 max-w-3xl";

export interface ComposerSurfaceElements {
  /** Pending approval / user-input / plan-follow-up banners above the editor. */
  renderBanners?(): ReactNode;
  /** Attachment and context-chip strips above the editor. */
  renderAttachments?(): ReactNode;
  /** Editor kernel island (Web: Lexical editor; Lynx: native textarea). */
  renderEditor(): ReactNode;
  /** Toolbar left controls in canonical order (see module docs). */
  renderFooterLeftControls(): ReactNode;
  /** Send/stop primary actions at the trailing edge. */
  renderFooterRightActions(): ReactNode;
}

export interface ComposerSurfaceProps {
  readonly elements: ComposerSurfaceElements;
  /** Provider-accented frame ring (Web) / static frame (Lynx). */
  readonly frameClassName?: string | undefined;
  readonly surfaceClassName?: string | undefined;
  /** Host props forwarded to the frame node (Web drag/focus handlers). */
  readonly frameProps?: Record<string, unknown> | undefined;
  readonly surfaceProps?: Record<string, unknown> | undefined;
  /** Extra classes on the footer row (Web responsive/pending variants). */
  readonly footerClassName?: string | undefined;
  /** Extra classes on the editor area (Web header-dependent padding). */
  readonly editorAreaClassName?: string | undefined;
  /** Host props forwarded to the editor-area node (Web menu-anchor ref). */
  readonly editorAreaProps?: Record<string, unknown> | undefined;
  /** Replaces editor area + footer (Web collapsed-mobile composition). */
  readonly renderCollapsedBody?: (() => ReactNode) | undefined;
  /** Marks the compact footer variant for measurements (Web responsive). */
  readonly footerCompact?: boolean;
  /** Marks the compact primary-actions variant for measurements (Web). */
  readonly primaryActionsCompact?: boolean;
  /** Primary action semantic independent of the host button implementation. */
  readonly primaryActionState?: "disabled" | "send" | "stop" | undefined;
  /** Stable state identifier consumed by the dual-renderer Harness. */
  readonly semanticState?: string | undefined;
}

/**
 * Toolbar row anatomy: one nowrap row of controls. By default adjacent items
 * are joined by vertical separators (Lynx pills); Web's upstream controls
 * carry their own separators and pass `separators={false}`.
 */
export function ComposerToolbarRow({
  items,
  separators = true,
  overlayOpen = false,
}: {
  readonly items: ReadonlyArray<ReactNode>;
  readonly separators?: boolean;
  readonly overlayOpen?: boolean;
}) {
  return (
    <HostView
      className={cn(
        "composer-toolbar-row -m-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto p-1",
        overlayOpen && "composer-toolbar-row--overlay-open",
      )}
    >
      {items.map((item, index) =>
        item === null || item === undefined || item === false ? null : (
          <Fragment key={index}>
            {separators && index > 0 ? (
              <HostText aria-hidden className="composer-toolbar-sep mx-0.5 h-4 w-px bg-border/70" />
            ) : null}
            {item}
          </Fragment>
        ),
      )}
    </HostView>
  );
}

/**
 * Shared toolbar-control geometry for platform-native control islands. Hosts
 * provide only the icon primitives and tap behavior; density, truncation, and
 * semantic foreground stay with the Composer product composition.
 */
export function ComposerToolbarControl({
  className,
  controlId,
  label,
  labelStyle,
  leading,
  onClick,
  trailing,
}: {
  readonly className?: string;
  readonly controlId?: string | undefined;
  readonly label: string;
  readonly labelStyle?: CSSProperties | undefined;
  readonly leading?: ReactNode;
  readonly onClick?: () => void;
  readonly trailing?: ReactNode;
}) {
  return (
    <HostButton
      type="button"
      className={cn(
        "composer-toolbar-control flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-muted-foreground",
        className,
      )}
      data-composer-control={controlId}
      onClick={onClick}
    >
      {leading}
      <HostText className="composer-toolbar-control-label min-w-0 truncate" style={labelStyle}>
        {label}
      </HostText>
      {trailing}
    </HostButton>
  );
}

export function ComposerPrimaryAction({
  icon,
  onClick,
  state,
}: {
  readonly icon: ReactNode;
  readonly onClick: () => void;
  readonly state: "disabled" | "send" | "stop";
}) {
  return (
    <HostButton
      type="button"
      aria-label={state === "stop" ? "Stop response" : "Send message"}
      aria-disabled={state === "disabled"}
      data-composer-primary-state={state}
      className={cn(
        "composer-primary-action flex size-8 shrink-0 items-center justify-center rounded-full",
        `composer-primary-action--${state}`,
        state === "stop" ? "bg-destructive" : "bg-primary",
        state === "disabled" && "opacity-30",
      )}
      onClick={state === "disabled" ? undefined : onClick}
    >
      {icon}
    </HostButton>
  );
}

/** Framed Composer chrome: surface → banners → attachments → editor → footer. */
export function ComposerSurface({
  elements,
  frameClassName,
  surfaceClassName,
  frameProps,
  surfaceProps,
  footerClassName,
  editorAreaClassName,
  editorAreaProps,
  renderCollapsedBody,
  footerCompact = false,
  primaryActionsCompact = false,
  primaryActionState,
  semanticState,
}: ComposerSurfaceProps) {
  return (
    <HostView
      className={cn(
        "composer-frame group rounded-[22px] p-px transition-colors duration-200",
        frameClassName,
      )}
      data-composer-state={semanticState}
      {...frameProps}
    >
      <HostView
        className={cn(
          "composer-surface rounded-[20px] transition-[background-color] duration-200",
          surfaceClassName,
        )}
        {...surfaceProps}
      >
        {elements.renderBanners?.()}
        {renderCollapsedBody ? (
          renderCollapsedBody()
        ) : (
          <>
            <HostView
              className={cn(
                "composer-editor-area relative px-3 pb-2 pt-3.5 sm:px-4 sm:pt-4",
                editorAreaClassName,
              )}
              {...editorAreaProps}
            >
              {elements.renderAttachments?.()}
              {elements.renderEditor()}
            </HostView>
            <HostView
              className={cn(
                "composer-footer flex min-w-0 flex-nowrap items-center justify-between gap-2 overflow-visible px-2.5 pb-2.5 sm:px-3 sm:pb-3",
                footerClassName,
              )}
              data-chat-composer-footer="true"
              data-chat-composer-footer-compact={footerCompact ? "true" : "false"}
            >
              {elements.renderFooterLeftControls()}
              <HostView
                className="composer-primary-actions flex shrink-0 flex-nowrap items-center justify-end gap-2"
                data-chat-composer-actions="right"
                data-chat-composer-primary-actions-compact={
                  primaryActionsCompact ? "true" : "false"
                }
                data-composer-primary-state={primaryActionState}
              >
                {elements.renderFooterRightActions()}
              </HostView>
            </HostView>
          </>
        )}
      </HostView>
    </HostView>
  );
}

/**
 * Context strip below the Composer card: canonical checkout context first,
 * branch context second. The container carries only the ordering anatomy;
 * each host styles the tucked overlap and surface look (Web keeps its
 * BranchToolbar chrome; Lynx uses its token-backed tucked strip).
 */
export function ComposerContextStrip({
  backdrop,
  authorityVisual,
  checkout,
  branch,
  className,
}: {
  readonly backdrop?: ReactNode;
  readonly authorityVisual?: ReactNode;
  readonly checkout: ReactNode;
  readonly branch: ReactNode;
  readonly className?: string | undefined;
}) {
  return (
    <HostView
      className={cn(
        "composer-context-strip -mt-4 mx-3 flex items-center gap-2 rounded-b-2xl bg-muted px-1 pb-1 pt-5",
        authorityVisual && "composer-context-strip--authority",
        className,
      )}
    >
      {backdrop}
      {authorityVisual}
      <HostView className="composer-context-item flex min-w-0 flex-1 items-center gap-1">
        {checkout}
      </HostView>
      <HostView className="composer-context-item ml-auto flex min-w-0 items-center gap-1">
        {branch}
      </HostView>
    </HostView>
  );
}

/**
 * Draft hero headline: one shared headline copy with a platform project slot
 * (Web: project picker menu; Lynx: static project name).
 */
export function ComposerHeroHeadline({
  project,
  projectResolved = true,
}: {
  readonly project: ReactNode;
  readonly projectResolved?: boolean;
}) {
  return (
    <HostHeadline className="hero__headline mx-auto w-full max-w-5xl text-center font-normal text-2xl text-foreground tracking-tight sm:text-3xl">
      {projectResolved ? <>What should we build in {project}?</> : <>{project} to start</>}
    </HostHeadline>
  );
}

/**
 * Renderer-neutral Settings feature compositions (AR5.2).
 *
 * One physical module owns the Settings panels' shared anatomy for Web and
 * Lynx: archived-thread groups and rows, the Beta feature rows, source
 * control discovery rows and marks, access-inventory rows, and the provider
 * instance card header. Behavior hosts keep their authority (unarchive,
 * settings writes, rescan, revoke, enable toggles); platform controls and
 * icons enter as nodes.
 */
import type { ReactNode } from "react";

import { cn } from "../../lib/cn";
import { HostButton, HostLayoutView, HostText, HostView } from "../ui/hostElements";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "../ui/empty";
import { SettingsRow, SettingsSection } from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------

/**
 * Appearance panel composition shared by Web and Lynx. Hosts own the actual
 * controls because Web has DOM select/range semantics while Lynx must keep
 * unsupported theme/input behavior explicit until the corresponding runtime
 * capability is certified.
 */
export function AppearanceSettingsSurface({
  themeControl,
  themeResetAction,
  themeStatus,
  glassOpacityControl,
  glassOpacityResetAction,
  glassOpacityStatus,
  glassOpacityUnavailable,
  environmentIdentificationControl,
  environmentIdentificationResetAction,
  environmentIdentificationStatus,
  environmentIdentificationUnavailable,
  showEnvironmentIdentification,
  wordWrapControl,
  wordWrapResetAction,
  wordWrapStatus,
  wordWrapUnavailable,
}: {
  readonly themeControl?: ReactNode | undefined;
  readonly themeResetAction?: ReactNode | undefined;
  readonly themeStatus?: ReactNode | undefined;
  readonly glassOpacityControl?: ReactNode | undefined;
  readonly glassOpacityResetAction?: ReactNode | undefined;
  readonly glassOpacityStatus?: ReactNode | undefined;
  readonly glassOpacityUnavailable?: boolean | undefined;
  readonly environmentIdentificationControl?: ReactNode | undefined;
  readonly environmentIdentificationResetAction?: ReactNode | undefined;
  readonly environmentIdentificationStatus?: ReactNode | undefined;
  readonly environmentIdentificationUnavailable?: boolean | undefined;
  readonly showEnvironmentIdentification: boolean;
  readonly wordWrapControl?: ReactNode | undefined;
  readonly wordWrapResetAction?: ReactNode | undefined;
  readonly wordWrapStatus?: ReactNode | undefined;
  readonly wordWrapUnavailable?: boolean | undefined;
}) {
  return (
    <SettingsSection id="appearance" title="Appearance">
      <SettingsRow
        {...searchableSetting("theme")}
        description="Choose how T3 Code looks across the app."
        resetAction={themeResetAction}
        status={themeStatus}
        control={themeControl}
      />
      <SettingsRow
        {...searchableSetting("setting-glass-opacity")}
        description="Control how transparent glass surfaces are. Higher values make menus, dialogs, and the composer more solid."
        resetAction={glassOpacityResetAction}
        status={glassOpacityStatus}
        control={glassOpacityControl}
        {...(glassOpacityUnavailable ? { unavailable: true } : {})}
      />
      {showEnvironmentIdentification ? (
        <SettingsRow
          {...searchableSetting("environment-identification")}
          description="Choose how Dev and Nightly environments are identified."
          resetAction={environmentIdentificationResetAction}
          status={environmentIdentificationStatus}
          control={environmentIdentificationControl}
          {...(environmentIdentificationUnavailable ? { unavailable: true } : {})}
        />
      ) : null}
      <SettingsRow
        {...searchableSetting("word-wrap")}
        description="Wrap long lines in code blocks, tables, diffs, and file previews by default."
        resetAction={wordWrapResetAction}
        status={wordWrapStatus}
        control={wordWrapControl}
        {...(wordWrapUnavailable ? { unavailable: true } : {})}
      />
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Archived threads
// ---------------------------------------------------------------------------

export interface ArchivedThreadRowItem {
  readonly id: string;
  readonly title: string;
  /** "Archived 2h · Created 5h" */
  readonly description: ReactNode;
  /** Unarchive(/delete) control node. */
  readonly action: ReactNode;
  /** Web-only context menu hook; undefined on Lynx. */
  readonly onContextMenu?: ((event: unknown) => void) | undefined;
}

export interface ArchivedThreadGroupItem {
  readonly key: string;
  readonly title: string;
  readonly icon?: ReactNode;
  readonly threads: ReadonlyArray<ArchivedThreadRowItem>;
}

/** Archived threads panel: project groups with archived rows, or one empty section. */
export function ArchivedThreadsSurface({
  anchorId,
  groups,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: {
  /** Settings-search target on the empty section or first populated group. */
  readonly anchorId?: string | undefined;
  readonly groups: ReadonlyArray<ArchivedThreadGroupItem>;
  readonly emptyIcon?: ReactNode;
  /** Loading/error/empty content for the zero-group state. */
  readonly emptyTitle: ReactNode;
  readonly emptyDescription: ReactNode;
}) {
  if (groups.length === 0) {
    return (
      <SettingsSection id={anchorId} title="Archived threads">
        <SettingsRow
          className="archived-threads-empty-row"
          title={
            <HostView className="archived-threads-empty-title inline-flex items-center gap-2">
              {emptyIcon}
              <HostText>{emptyTitle}</HostText>
            </HostView>
          }
          description={emptyDescription}
        />
      </SettingsSection>
    );
  }
  return (
    <>
      {groups.map((group, index) => (
        <SettingsSection
          key={group.key}
          id={index === 0 ? anchorId : undefined}
          title={group.title}
          {...(group.icon ? { icon: group.icon } : {})}
        >
          {group.threads.map((thread) => (
            <SettingsRow
              key={thread.id}
              {...(thread.onContextMenu ? { onContextMenu: thread.onContextMenu } : {})}
              title={thread.title}
              description={thread.description}
              control={thread.action}
            />
          ))}
        </SettingsSection>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Beta features
// ---------------------------------------------------------------------------

/** Beta panel: Sidebar v2 toggle row plus optional auto-settle controls. */
export function BetaSettingsSurface({
  sidebarV2Control,
  sidebarV2Setting,
  sidebarV2Status,
  autoSettleControls,
}: {
  /** Switch for the canonical Sidebar v2 preference. */
  readonly sidebarV2Control: ReactNode;
  /** Canonical Settings-search anchor and title. */
  readonly sidebarV2Setting?: { readonly id: string; readonly title: string };
  /** Honest-gap note rendered under the row (for example an unmoved renderer). */
  readonly sidebarV2Status?: ReactNode;
  /** Auto-settle toggle + days input (Web; omitted where unsupported). */
  readonly autoSettleControls?: ReactNode;
}) {
  return (
    <SettingsSection title="Beta features">
      <SettingsRow
        {...sidebarV2Setting}
        title={sidebarV2Setting?.title ?? "Sidebar v2"}
        description="One flat thread list in creation order. Active work renders as rich cards; settled threads collapse to compact rows. Settling requires an up-to-date server — on older servers threads simply stay active. Switch back any time."
        {...(sidebarV2Status ? { status: sidebarV2Status } : {})}
        control={sidebarV2Control}
      />
      {autoSettleControls}
    </SettingsSection>
  );
}

// ---------------------------------------------------------------------------
// Source control discovery
// ---------------------------------------------------------------------------

export type SourceControlStatusTone = "success" | "warning" | "muted";

const STATUS_DOT_TONE_CLASSES: Record<SourceControlStatusTone, string> = {
  success: "bg-success",
  warning: "bg-warning",
  muted: "bg-muted-foreground/35",
};

/** Bare status dot (no icon). Shared by source-control marks and access rows. */
export function StatusDotSurface({ tone }: { readonly tone: SourceControlStatusTone }) {
  return (
    <HostView
      className={cn("size-2 shrink-0 rounded-full", STATUS_DOT_TONE_CLASSES[tone])}
      aria-hidden
    />
  );
}

/** Item mark: provider/VCS icon with an overlaid status dot. */
export function SourceControlMarkSurface({
  icon,
  tone,
}: {
  readonly icon?: ReactNode;
  readonly tone: SourceControlStatusTone;
}) {
  if (!icon) {
    return <StatusDotSurface tone={tone} />;
  }
  return (
    <HostView className="relative inline-flex size-5 shrink-0 items-center justify-center">
      {icon}
      <HostView
        className={cn(
          "pointer-events-none absolute -left-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background",
          STATUS_DOT_TONE_CLASSES[tone],
        )}
        aria-hidden
      />
    </HostView>
  );
}

export interface SourceControlItemRowSurfaceProps {
  readonly mark: ReactNode;
  readonly label: string;
  readonly version?: string | undefined;
  readonly badge?: ReactNode;
  readonly summary: ReactNode;
  readonly control?: ReactNode;
  readonly muted?: boolean;
}

/** One source-control discovery row (VCS or provider). */
export function SourceControlItemRowSurface({
  mark,
  label,
  version,
  badge,
  summary,
  control,
  muted = false,
}: SourceControlItemRowSurfaceProps) {
  return (
    <HostView
      className={cn(
        "source-control-item rounded-xl px-3 py-3 transition-colors sm:px-4",
        muted && "opacity-80",
      )}
    >
      <HostView className="source-control-item__layout flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <HostView className="source-control-item__copy flex min-w-0 flex-1 flex-col gap-1">
          <HostView className="source-control-item__headline flex min-w-0 flex-wrap items-center gap-2">
            {mark}
            <HostText className="truncate text-sm font-medium tracking-[-0.005em] text-foreground">
              {label}
            </HostText>
            {version ? (
              <HostText className="font-mono text-xs text-muted-foreground">{version}</HostText>
            ) : null}
            {badge}
          </HostView>
          <HostText className="source-control-item__summary flex min-w-0 flex-wrap items-center gap-x-1 text-[13px] leading-[1.45] text-muted-foreground/80">
            {summary}
          </HostText>
        </HostView>
        {control ? (
          <HostView className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
            {control}
          </HostView>
        ) : null}
      </HostView>
    </HostView>
  );
}

// ---------------------------------------------------------------------------
// Access inventory (pairing links and client sessions)
// ---------------------------------------------------------------------------

export interface AccessListRowSurfaceProps {
  /** Status dot node (platform color/tooltip leaf). */
  readonly statusDot?: ReactNode;
  readonly primaryLabel: ReactNode;
  /** Trailing affordance next to the primary label (QR, "This device" chip). */
  readonly primaryTrailing?: ReactNode;
  readonly description: ReactNode;
  readonly control?: ReactNode;
}

/** One access-inventory row (pairing link or authorized client). */
export function AccessListRowSurface({
  statusDot,
  primaryLabel,
  primaryTrailing,
  description,
  control,
}: AccessListRowSurfaceProps) {
  return (
    <HostView className="access-list-row rounded-xl px-3 py-3 sm:px-4">
      <HostView className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <HostView className="flex min-w-0 flex-1 flex-col gap-1">
          <HostView className="flex min-h-5 items-center gap-1.5">
            {statusDot}
            <HostText className="text-sm font-medium text-foreground">{primaryLabel}</HostText>
            {primaryTrailing}
          </HostView>
          <HostText className="block text-xs text-muted-foreground">{description}</HostText>
        </HostView>
        {control ? (
          <HostView className="flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
            {control}
          </HostView>
        ) : null}
      </HostView>
    </HostView>
  );
}

export function EmptyRemoteEnvironments({
  cloudEnabled = true,
  icon,
}: {
  readonly cloudEnabled?: boolean;
  readonly icon: ReactNode;
}) {
  return (
    <Empty className="settings-remote-empty min-h-52">
      <EmptyMedia className="settings-remote-empty__media" variant="icon">
        {icon}
      </EmptyMedia>
      <EmptyHeader className="settings-remote-empty__header">
        <EmptyTitle className="settings-remote-empty__title">
          No saved remote environments
        </EmptyTitle>
        <EmptyDescription className="settings-remote-empty__description">
          {cloudEnabled
            ? "Click “Add environment” to pair another environment, or connect one from T3 Connect."
            : "Click “Add environment” to pair another environment."}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

// ---------------------------------------------------------------------------
// Provider instance card
// ---------------------------------------------------------------------------

export interface ProviderInstanceCardSurfaceProps {
  /** Leading provider mark (icon + status overlay; platform leaf). */
  readonly icon?: ReactNode;
  /** Instance display name. */
  readonly title: ReactNode;
  /** Instance-id code chip (only for custom instances). */
  readonly instanceIdChip?: ReactNode;
  /** Driver badge (for example "Coming Soon"). */
  readonly badge?: ReactNode;
  /** Version label code plus update affordance, composed by the host. */
  readonly version?: ReactNode;
  /** Trailing title-row actions (header action, delete). */
  readonly titleTrailing?: ReactNode;
  /** "headline · detail" status summary. */
  readonly summaryHeadline: ReactNode;
  readonly summaryDetail?: ReactNode;
  readonly summaryAriaLabel?: string;
  readonly onSummaryClick?: () => void;
  readonly expanded: boolean;
  readonly onToggleExpanded: () => void;
  /** Accessible label for the expand chevron button. */
  readonly toggleAriaLabel: string;
  readonly expandChevron: ReactNode;
  /** Enable/disable switch node. */
  readonly toggle: ReactNode;
  /**
   * Expandable body (Web: details form in its Collapsible; Lynx: model list).
   * The host owns expansion rendering so collapse animation stays platform-local.
   */
  readonly body?: ReactNode;
}

/** Provider instance card: title row + summary + expand chevron + enable switch. */
export function ProviderInstanceCardSurface({
  icon,
  title,
  instanceIdChip,
  badge,
  version,
  titleTrailing,
  summaryHeadline,
  summaryDetail,
  summaryAriaLabel,
  onSummaryClick,
  expanded,
  onToggleExpanded,
  toggleAriaLabel,
  expandChevron,
  toggle,
  body,
}: ProviderInstanceCardSurfaceProps) {
  return (
    <HostView className="provider-instance-card rounded-xl transition-colors">
      <HostView className="provider-instance-card__header px-3 py-3 sm:px-4">
        <HostLayoutView className="provider-instance-card__layout flex gap-3 sm:items-center sm:justify-between">
          <HostLayoutView className="provider-instance-card__copy flex min-w-0 flex-1 gap-1">
            <HostLayoutView className="provider-instance-card__title-row flex min-w-0 flex-wrap items-center gap-2">
              {icon}
              <HostText className="provider-instance-card__title truncate text-sm font-medium tracking-[-0.005em] text-foreground">
                {title}
              </HostText>
              {instanceIdChip}
              {badge}
              {version}
              {titleTrailing}
            </HostLayoutView>
            <HostLayoutView
              className="provider-instance-card__summary min-w-0 text-[13px] leading-[1.45] text-muted-foreground/80"
              aria-label={summaryAriaLabel}
              onClick={onSummaryClick}
            >
              {typeof summaryHeadline === "string" || typeof summaryHeadline === "number" ? (
                <HostText className="provider-instance-card__summary-part">
                  {summaryHeadline}
                </HostText>
              ) : (
                summaryHeadline
              )}
              {summaryDetail ? (
                <HostText className="provider-instance-card__summary-part">
                  - {summaryDetail}
                </HostText>
              ) : null}
            </HostLayoutView>
          </HostLayoutView>
          <HostView className="provider-instance-card__actions flex w-full shrink-0 items-center gap-2 sm:w-auto sm:justify-end">
            <HostButton
              type="button"
              className="provider-instance-card__chevron inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-xs text-muted-foreground"
              onClick={onToggleExpanded}
              aria-expanded={expanded}
              aria-label={toggleAriaLabel}
            >
              {expandChevron}
            </HostButton>
            {toggle}
          </HostView>
        </HostLayoutView>
      </HostView>
      {body}
    </HostView>
  );
}

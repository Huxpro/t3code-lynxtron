import { ChevronDownIcon, GitPullRequestIcon, RefreshCwIcon } from "lucide-react";
import * as Duration from "effect/Duration";
import { useState, type ReactNode } from "react";
import {
  deriveSourceControlEmptyPresentation,
  projectSourceControlDiscoveryItem,
  SOURCE_CONTROL_LOADING_SECTIONS,
  type SourceControlItemPresentation,
} from "@t3tools/client-runtime/presentation/source-control";
import type {
  BackgroundActivitySettings,
  SourceControlProviderKind,
  SourceControlDiscoveryResult,
  SourceControlProviderDiscoveryItem,
  VcsDriverKind,
  VcsDiscoveryItem,
} from "@t3tools/contracts";
import {
  getBackgroundActivityBaseProfile,
  getBackgroundActivityPresetSettings,
  resolveServerBackgroundActivitySettings,
} from "@t3tools/shared/backgroundActivitySettings";

import { usePrimarySettings, useUpdatePrimarySettings } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import { useEnvironments, usePrimaryEnvironment } from "../../state/environments";
import { useEnvironmentQuery } from "../../state/query";
import { sourceControlEnvironment } from "../../state/sourceControl";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Collapsible, CollapsibleContent } from "../ui/collapsible";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../ui/empty";
import { Skeleton } from "../ui/skeleton";
import {
  NumberField,
  NumberFieldDecrement,
  NumberFieldGroup,
  NumberFieldIncrement,
  NumberFieldInput,
} from "../ui/number-field";
import { Switch } from "../ui/switch";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

import {
  AzureDevOpsIcon,
  BitbucketIcon,
  GitHubIcon,
  GitIcon,
  GitLabIcon,
  JujutsuIcon,
  type Icon,
} from "../Icons";
import { RedactedSensitiveText } from "./RedactedSensitiveText";
import { SourceControlWritingSettingsSection } from "./SourceControlWritingSettings";
import { SourceControlItemRowSurface, SourceControlMarkSurface } from "./SettingsSurfaces";
import {
  PolicyTooltip,
  SettingResetButton,
  SettingsPageContainer,
  SettingsSection,
} from "./settingsLayout";
import { searchableSetting } from "./settingsSearch";

const EMPTY_DISCOVERY_RESULT: SourceControlDiscoveryResult = {
  versionControlSystems: [],
  sourceControlProviders: [],
};

const SOURCE_CONTROL_PROVIDER_ICONS: Partial<Record<SourceControlProviderKind, Icon>> = {
  github: GitHubIcon,
  gitlab: GitLabIcon,
  "azure-devops": AzureDevOpsIcon,
  bitbucket: BitbucketIcon,
};

const VCS_ICONS: Partial<Record<VcsDriverKind, Icon>> = {
  git: GitIcon,
  jj: JujutsuIcon,
};

const GIT_FETCH_INTERVAL_STEP_SECONDS = 5;
type BackgroundActivityOverridePatch = Partial<{
  [K in keyof BackgroundActivitySettings["overrides"]]:
    | BackgroundActivitySettings["overrides"][K]
    | undefined;
}>;

function durationToSeconds(duration: Duration.Duration): number {
  return Math.round(Duration.toMillis(duration) / 1_000);
}

function normalizeFetchIntervalSeconds(value: number | null): number {
  if (value === null || !Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function backgroundActivityOverrideSettings(
  current: BackgroundActivitySettings,
  overrides: BackgroundActivityOverridePatch,
) {
  const nextOverrides: BackgroundActivityOverridePatch = {
    ...current.overrides,
    ...overrides,
  };
  for (const [key, value] of Object.entries(nextOverrides)) {
    if (value === undefined) {
      delete nextOverrides[key as keyof typeof nextOverrides];
    }
  }
  return {
    backgroundActivity: {
      schemaVersion: 1 as const,
      profile: "custom" as const,
      baseProfile: getBackgroundActivityBaseProfile(current),
      overrides: nextOverrides as BackgroundActivitySettings["overrides"],
    },
  };
}

function RedactedAccount(props: { readonly account: string | null }) {
  return (
    <RedactedSensitiveText
      value={props.account}
      ariaLabel="Toggle source control account visibility"
      revealTooltip="Click to reveal account"
      hideTooltip="Click to hide account"
    />
  );
}

function SourceControlItemMark({
  presentation,
}: {
  readonly presentation: SourceControlItemPresentation;
}) {
  const Icon =
    presentation.section === "provider"
      ? SOURCE_CONTROL_PROVIDER_ICONS[presentation.kind]
      : VCS_ICONS[presentation.kind];

  return (
    <SourceControlMarkSurface
      tone={presentation.statusTone}
      {...(Icon ? { icon: <Icon className="size-4.5 text-foreground/80" aria-hidden /> } : {})}
    />
  );
}

function SourceControlItemSummary({
  presentation,
}: {
  readonly presentation: SourceControlItemPresentation;
}) {
  return presentation.summaryParts.map((part, index) => {
    const key = `${part.kind}:${index}`;
    if (part.kind === "code") {
      return (
        <code key={key} className="rounded bg-muted px-1 py-px text-[11px]">
          {part.text}
        </code>
      );
    }
    if (part.kind === "sensitive") {
      return (
        <span key={key} className="contents">
          <span aria-hidden>{part.prefix}</span>
          <RedactedAccount account={part.text} />
        </span>
      );
    }
    return <span key={key}>{part.text}</span>;
  });
}

function DiscoveryItemRow({
  item,
  children,
}: {
  readonly item: VcsDiscoveryItem | SourceControlProviderDiscoveryItem;
  readonly children?: ReactNode;
}) {
  const presentation = projectSourceControlDiscoveryItem(item);
  const isNotReady = presentation.statusTone === "muted";
  const [isExpanded, setIsExpanded] = useState(false);
  const hasDetails = children !== undefined;

  return (
    <>
      <SourceControlItemRowSurface
        mark={<SourceControlItemMark presentation={presentation} />}
        label={item.label}
        {...(presentation.version ? { version: presentation.version } : {})}
        {...(presentation.badgeLabel === "Coming Soon"
          ? {
              badge: (
                <Badge variant="warning" size="sm">
                  Coming Soon
                </Badge>
              ),
            }
          : presentation.badgeLabel === "Not authenticated"
            ? {
                badge: (
                  <Badge variant="warning" size="sm">
                    {presentation.badgeLabel}
                  </Badge>
                ),
              }
            : {})}
        summary={<SourceControlItemSummary presentation={presentation} />}
        muted={isNotReady}
        control={
          <>
            {hasDetails ? (
              <Button
                size="compact"
                variant="ghost-muted"
                onClick={() => setIsExpanded((open) => !open)}
                aria-expanded={isExpanded}
                aria-label={`Toggle ${item.label} details`}
              >
                <ChevronDownIcon
                  className={cn("size-3.5 transition-transform", isExpanded && "rotate-180")}
                />
              </Button>
            ) : null}
            {!isNotReady ? (
              <Switch
                checked={presentation.enabled}
                disabled
                aria-label={`${item.label} availability`}
              />
            ) : null}
          </>
        }
      />
      {hasDetails ? (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleContent>
            <div className="px-3 pb-4 pt-1 sm:px-4">{children}</div>
          </CollapsibleContent>
        </Collapsible>
      ) : null}
    </>
  );
}

function GitFetchIntervalSettings() {
  const settings = usePrimarySettings();
  const updateSettings = useUpdatePrimarySettings();
  const resolvedBackgroundActivity = resolveServerBackgroundActivitySettings(settings);
  const automaticGitFetchIntervalSeconds = durationToSeconds(
    resolvedBackgroundActivity.automaticGitFetchInterval,
  );
  const defaultAutomaticGitFetchIntervalSeconds = durationToSeconds(
    getBackgroundActivityPresetSettings(
      getBackgroundActivityBaseProfile(settings.backgroundActivity),
    ).automaticGitFetchInterval,
  );
  const canResetFetchInterval =
    automaticGitFetchIntervalSeconds !== defaultAutomaticGitFetchIntervalSeconds;

  return (
    <div
      className="source-control-git-details grid gap-3"
      data-git-fetch-seconds={automaticGitFetchIntervalSeconds}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="source-control-git-details__copy min-w-0 space-y-1">
          <div className="flex min-w-0 items-center gap-1">
            <span className="source-control-git-details__title text-xs font-medium text-foreground">
              Fetch interval
            </span>
            <PolicyTooltip>
              This interval is configured for Git only. The shared Background activity policy still
              decides whether Git refreshes may run when the timer fires. Custom intervals appear as
              Advanced in General settings.
            </PolicyTooltip>
            <span
              className={cn(
                "inline-flex size-5 shrink-0 items-center justify-center transition-opacity",
                canResetFetchInterval ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              aria-hidden={!canResetFetchInterval}
            >
              {canResetFetchInterval ? (
                <SettingResetButton
                  label="fetch interval"
                  onClick={() =>
                    updateSettings(
                      backgroundActivityOverrideSettings(settings.backgroundActivity, {
                        automaticGitFetchInterval: undefined,
                      }),
                    )
                  }
                />
              ) : null}
            </span>
          </div>
          <p className="source-control-git-details__description max-w-2xl text-xs leading-relaxed text-muted-foreground">
            Refresh remote branch status in the background. Set this to 0 seconds if Git credentials
            or security keys should only be prompted by explicit Git actions.
          </p>
        </div>
        <div className="source-control-git-details__control flex shrink-0 items-center gap-2">
          <NumberField
            value={automaticGitFetchIntervalSeconds}
            min={0}
            step={GIT_FETCH_INTERVAL_STEP_SECONDS}
            size="sm"
            className="w-32"
            onValueChange={(value) =>
              updateSettings(
                backgroundActivityOverrideSettings(settings.backgroundActivity, {
                  automaticGitFetchInterval: Duration.seconds(normalizeFetchIntervalSeconds(value)),
                }),
              )
            }
          >
            <NumberFieldGroup className="source-control-git-number-field">
              <NumberFieldDecrement aria-label="Decrease fetch interval" />
              <NumberFieldInput aria-label="Automatic Git fetch interval in seconds" />
              <NumberFieldIncrement aria-label="Increase fetch interval" />
            </NumberFieldGroup>
          </NumberField>
          <span className="source-control-git-details__unit text-xs text-muted-foreground">
            seconds
          </span>
        </div>
      </div>
    </div>
  );
}

function SourceControlSectionSkeleton({
  title,
  headerAction,
  rows,
}: {
  readonly title: string;
  readonly headerAction?: ReactNode;
  readonly rows: ReadonlyArray<string>;
}) {
  return (
    <SettingsSection title={title} headerAction={headerAction}>
      {rows.map((row) => (
        <div key={row} className="rounded-xl px-3 py-3 sm:px-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex items-center gap-2">
                <span className="relative inline-flex size-5 shrink-0 items-center justify-center">
                  <Skeleton className="size-4.5 rounded-md" />
                  <Skeleton
                    className="pointer-events-none absolute -left-0.5 -top-0.5 size-2 rounded-full ring-2 ring-background"
                    aria-hidden
                  />
                </span>
                <Skeleton className="h-4 w-28 rounded-full" />
                <Skeleton className="h-5 w-14 rounded-full" />
              </div>
              <Skeleton className="h-3 w-full max-w-xs rounded-full" />
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="size-7 rounded-md" />
              <Skeleton className="h-5 w-9 rounded-full" />
            </div>
          </div>
        </div>
      ))}
    </SettingsSection>
  );
}

function EmptySourceControlDiscovery({
  error,
  isPending,
  onScan,
}: {
  readonly error: string | null;
  readonly isPending: boolean;
  readonly onScan: () => void;
}) {
  const hasError = error !== null;
  const presentation = deriveSourceControlEmptyPresentation(error);

  return (
    <SettingsSection id={searchableSetting("source-control").id} title={presentation.sectionTitle}>
      <Empty className="min-h-88">
        <EmptyMedia variant="icon">
          <GitPullRequestIcon />
        </EmptyMedia>
        <EmptyHeader>
          <EmptyTitle>{presentation.title}</EmptyTitle>
          <EmptyDescription {...(hasError ? { "data-source-control-error": true } : {})}>
            {presentation.description}
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            data-source-control-retry
            size="sm"
            variant="outline"
            className="h-8 gap-1.5 px-3 text-xs"
            onClick={onScan}
            disabled={isPending}
          >
            <RefreshCwIcon className={cn("size-3.5", isPending && "animate-spin")} />
            Scan
          </Button>
        </EmptyContent>
      </Empty>
    </SettingsSection>
  );
}

export function SourceControlSettingsPanel() {
  const { environments } = useEnvironments();
  const primaryEnvironment = usePrimaryEnvironment();
  const fallbackEnvironment =
    environments.find((environment) => environment.connection.phase === "connected") ??
    environments[0] ??
    null;
  const environmentId =
    primaryEnvironment?.environmentId ?? fallbackEnvironment?.environmentId ?? null;
  const isPrimaryEnvironment = environmentId === primaryEnvironment?.environmentId;
  const discovery = useEnvironmentQuery(
    environmentId === null
      ? null
      : sourceControlEnvironment.discovery({
          environmentId,
          input: {},
        }),
  );
  const result = discovery.data ?? EMPTY_DISCOVERY_RESULT;
  const hasVersionControlSystems = result.versionControlSystems.length > 0;
  const hasDiscoveryItems = hasVersionControlSystems || result.sourceControlProviders.length > 0;
  const isInitialScanPending = discovery.isPending && discovery.data === null;
  const handleScan = () => {
    discovery.refresh();
  };
  const scanButton = (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon-micro"
            variant="ghost-muted"
            onClick={handleScan}
            disabled={discovery.isPending}
            aria-label="Rescan server environment"
          >
            <RefreshCwIcon className={cn("size-3", discovery.isPending && "animate-spin")} />
          </Button>
        }
      />
      <TooltipPopup side="top">Rescan Git and hosting integrations</TooltipPopup>
    </Tooltip>
  );

  return (
    <SettingsPageContainer>
      {isInitialScanPending ? (
        <>
          {SOURCE_CONTROL_LOADING_SECTIONS.map((section, index) => (
            <SourceControlSectionSkeleton
              key={section.id}
              title={section.title}
              rows={section.rows}
              headerAction={index === 0 ? scanButton : undefined}
            />
          ))}
        </>
      ) : hasDiscoveryItems ? (
        <>
          {hasVersionControlSystems ? (
            <SettingsSection
              id={searchableSetting("source-control").id}
              title="Version Control"
              headerAction={scanButton}
            >
              {result.versionControlSystems.map((item) => (
                <DiscoveryItemRow key={`vcs:${item.kind}`} item={item}>
                  {item.kind === "git" && isPrimaryEnvironment ? (
                    <GitFetchIntervalSettings />
                  ) : undefined}
                </DiscoveryItemRow>
              ))}
            </SettingsSection>
          ) : null}

          {result.sourceControlProviders.length > 0 ? (
            <SettingsSection
              id={hasVersionControlSystems ? undefined : searchableSetting("source-control").id}
              title="Source Control Providers"
              headerAction={hasVersionControlSystems ? null : scanButton}
            >
              {result.sourceControlProviders.map((item) => (
                <DiscoveryItemRow key={`provider:${item.kind}`} item={item} />
              ))}
            </SettingsSection>
          ) : null}
        </>
      ) : (
        <EmptySourceControlDiscovery
          error={discovery.error}
          isPending={discovery.isPending}
          onScan={handleScan}
        />
      )}

      {isPrimaryEnvironment ? <SourceControlWritingSettingsSection /> : null}
    </SettingsPageContainer>
  );
}

import {
  formatRelativeTimeLabel,
  formatRelativeTimeUntilLabel,
} from "@t3tools/client-runtime/presentation/time";
import {
  canManageAuthAccess,
  fixedNetworkAccessPresentation,
  shouldShowAuthorizedClients,
} from "@t3tools/client-runtime/presentation/connections";
import {
  deriveSourceControlEmptyPresentation,
  projectSourceControlDiscovery,
  redactSourceControlAccount,
  SOURCE_CONTROL_LOADING_SECTIONS,
  SOURCE_CONTROL_WRITING_STYLE_OPTIONS,
  type SourceControlSummaryPart,
} from "@t3tools/client-runtime/presentation/source-control";
import type {
  SourceControlDiscoveryResult,
  SourceControlWritingStyleMode,
} from "@t3tools/contracts";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts/settings";
import { useEffect, useMemo, useState, type ReactNode } from "@lynx-js/react";

import {
  ArchivedThreadsSurface,
  AccessListRowSurface,
  EmptyRemoteEnvironments,
  SourceControlItemRowSurface,
  SourceControlMarkSurface,
  StatusDotSurface,
} from "../../../../web/src/components/settings/SettingsSurfaces";
import { SettingsPageContainer } from "../../../../web/src/components/settings/settingsLayout";
import { searchableSetting } from "../../../../web/src/components/settings/settingsSearch";
import { Badge } from "../../../../web/src/components/ui/badge";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../../web/src/components/ui/select";
import {
  SettingsRow,
  SettingsSection,
  SmallButton,
  SmallIconButton,
  Toggle,
} from "./SettingsControls";
import { Icon } from "./Icon";
import {
  pairingCredentialAfterRevocation,
  type PairingCredentialState,
} from "./connectionsMutation.logic";
import { clientCapabilities } from "../platform/clientCapabilities";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";

interface SourceControlDiscoveryState {
  readonly result: SourceControlDiscoveryResult | null;
  readonly pending: boolean;
  readonly error: string | null;
}

const EMPTY_SOURCE_CONTROL_DISCOVERY: SourceControlDiscoveryState = {
  result: null,
  pending: true,
  error: null,
};

function sourceControlSummaryForLynx(parts: ReadonlyArray<SourceControlSummaryPart>): string {
  return parts
    .map((part) =>
      part.kind === "sensitive"
        ? `${part.prefix}${redactSourceControlAccount(part.text)}`
        : part.text,
    )
    .join("");
}

function SourceControlLoadingSection({
  anchor,
  title,
  rows,
  headerAction,
}: {
  anchor: boolean;
  title: string;
  rows: ReadonlyArray<string>;
  headerAction?: ReactNode;
}) {
  return (
    <SettingsSection
      id={anchor ? searchableSetting("source-control").id : undefined}
      title={title}
      headerAction={headerAction}
      className="source-control-section"
      stacked
    >
      <view className="settings-section__rows flex w-full min-w-0 flex-col self-stretch">
        {rows.map((row) => (
          <view
            key={row}
            className="source-control-loading-row"
            data-source-control-loading-row={row}
          >
            <view className="source-control-loading-row__layout">
              <view className="source-control-loading-row__copy">
                <view className="source-control-loading-row__headline">
                  <view className="source-control-loading-row__mark">
                    <view className="source-control-loading-row__icon" />
                    <view className="source-control-loading-row__dot" />
                  </view>
                  <view className="source-control-loading-row__label" />
                  <view className="source-control-loading-row__badge" />
                </view>
                <view className="source-control-loading-row__detail" />
              </view>
              <view className="source-control-loading-row__actions">
                <view className="source-control-loading-row__button" />
                <view className="source-control-loading-row__switch" />
              </view>
            </view>
          </view>
        ))}
      </view>
    </SettingsSection>
  );
}

export function SourceControlSettings() {
  const { settings, settingsUpdatePending } = useT3ClientState();
  const [discovery, setDiscovery] = useState<SourceControlDiscoveryState>(
    EMPTY_SOURCE_CONTROL_DISCOVERY,
  );
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDiscovery((current) => ({ ...current, pending: true, error: null }));
    void t3ClientActions
      .discoverSourceControl()
      .then((result) => {
        if (!cancelled) setDiscovery({ result, pending: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDiscovery({
          result: null,
          pending: false,
          error: error instanceof Error ? error.message : String(error),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [refreshVersion]);

  const presentation = useMemo(
    () =>
      projectSourceControlDiscovery(
        discovery.result ?? { versionControlSystems: [], sourceControlProviders: [] },
      ),
    [discovery.result],
  );

  const scanButton = (
    <SmallButton
      label={discovery.pending ? "Scanning…" : "Rescan"}
      onTap={() => setRefreshVersion((version) => version + 1)}
    />
  );
  const loadingScanButton = (
    <SmallIconButton
      label="Rescan server environment"
      icon={<Icon name="refresh-cw" size={12} color="#818181" />}
      disabled
    />
  );
  const sourceControlWritingStyle =
    settings?.sourceControlWritingStyle ?? DEFAULT_SERVER_SETTINGS.sourceControlWritingStyle;
  const usesDedicatedModel = settings?.sourceControlWriterModelSelection !== null;
  const writerModel =
    settings?.sourceControlWriterModelSelection ?? settings?.textGenerationModelSelection;
  const updateSourceControlWritingStyle = (patch: Partial<typeof sourceControlWritingStyle>) => {
    void t3ClientActions.updateServerSettings({ sourceControlWritingStyle: patch }).catch(() => {});
  };
  const textGenerationSection = (
    <SettingsSection title="Text generation" className="source-control-section" stacked>
      <SettingsRow
        className="source-control-writing-row"
        title="Source control writing style"
        description={
          SOURCE_CONTROL_WRITING_STYLE_OPTIONS[sourceControlWritingStyle.mode].description
        }
        control={
          <Select
            value={sourceControlWritingStyle.mode}
            disabled={settingsUpdatePending}
            onValueChange={(mode) =>
              updateSourceControlWritingStyle({ mode: mode as SourceControlWritingStyleMode })
            }
          >
            <SelectTrigger aria-label="Source control writing style">
              <SelectValue>
                {SOURCE_CONTROL_WRITING_STYLE_OPTIONS[sourceControlWritingStyle.mode].label}
              </SelectValue>
            </SelectTrigger>
            <SelectPopup>
              {(
                Object.keys(SOURCE_CONTROL_WRITING_STYLE_OPTIONS) as SourceControlWritingStyleMode[]
              ).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {SOURCE_CONTROL_WRITING_STYLE_OPTIONS[mode].label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        }
      />
      <SettingsRow
        className="source-control-writing-row"
        title="Follow change request templates"
        description="Structures change request descriptions using the current repository's template when one is available."
        control={
          <Toggle
            value={sourceControlWritingStyle.followChangeRequestTemplates}
            disabled={settingsUpdatePending}
            onChange={(followChangeRequestTemplates) =>
              updateSourceControlWritingStyle({ followChangeRequestTemplates })
            }
          />
        }
      />
      <SettingsRow
        className="source-control-writing-row"
        title="Source control writer model"
        description="Optional model override for change descriptions, change request titles and descriptions, and branch or bookmark names. Off uses the global text generation model."
        status={usesDedicatedModel && writerModel ? writerModel.model : "Uses global model"}
        control={
          <Toggle
            value={usesDedicatedModel}
            disabled={!settings || settingsUpdatePending}
            onChange={(enabled) => {
              void t3ClientActions
                .updateServerSettings({
                  sourceControlWriterModelSelection: enabled
                    ? (settings?.textGenerationModelSelection ?? null)
                    : null,
                })
                .catch(() => {});
            }}
          />
        }
      />
    </SettingsSection>
  );

  if (discovery.pending && !discovery.result) {
    return (
      <view className="source-control-panel" data-source-control-loading>
        {SOURCE_CONTROL_LOADING_SECTIONS.map((section, index) => (
          <SourceControlLoadingSection
            key={section.id}
            anchor={index === 0}
            title={section.title}
            rows={section.rows}
            headerAction={index === 0 ? loadingScanButton : undefined}
          />
        ))}
        {textGenerationSection}
      </view>
    );
  }

  if (discovery.error || !presentation.hasItems) {
    const emptyPresentation = deriveSourceControlEmptyPresentation(discovery.error);
    return (
      <view className="source-control-panel">
        <SettingsSection
          id={searchableSetting("source-control").id}
          title={emptyPresentation.sectionTitle}
          className="source-control-section"
          stacked
        >
          <view className="source-control-empty">
            <view className="source-control-empty__media" aria-hidden>
              <view className="source-control-empty__media-layer source-control-empty__media-layer--left" />
              <view className="source-control-empty__media-layer source-control-empty__media-layer--right" />
              <view className="source-control-empty__media-layer source-control-empty__media-layer--front">
                <Icon name="git-pull-request" size={18} />
              </view>
            </view>
            <view className="source-control-empty__header">
              <text className="source-control-empty__title">{emptyPresentation.title}</text>
              <text
                className="source-control-empty__description"
                data-source-control-error={discovery.error ? "true" : undefined}
              >
                {emptyPresentation.description}
              </text>
            </view>
            <view className="source-control-empty__content" data-source-control-retry>
              <SmallButton
                label={discovery.pending ? "Scanning…" : "Scan"}
                icon={<Icon name="refresh-cw" size={14} color="#a1a1aa" />}
                onTap={() => setRefreshVersion((version) => version + 1)}
              />
            </view>
          </view>
        </SettingsSection>
        {textGenerationSection}
      </view>
    );
  }

  return (
    <view className="source-control-panel">
      {presentation.versionControlSystems.length > 0 ? (
        <SettingsSection
          id={searchableSetting("source-control").id}
          title="Version Control"
          headerAction={scanButton}
          className="source-control-section"
          stacked
        >
          {presentation.versionControlSystems.map((item) => (
            <SourceControlItemRowSurface
              key={item.id}
              mark={<SourceControlMarkSurface tone={item.statusTone} />}
              label={item.label}
              version={item.version ?? undefined}
              badge={
                item.badgeLabel ? (
                  <Badge variant="warning" size="sm">
                    {item.badgeLabel}
                  </Badge>
                ) : undefined
              }
              summary={sourceControlSummaryForLynx(item.summaryParts)}
              muted={!item.enabled}
            />
          ))}
        </SettingsSection>
      ) : null}
      {presentation.sourceControlProviders.length > 0 ? (
        <SettingsSection
          title="Source Control Providers"
          headerAction={scanButton}
          className="source-control-section"
          stacked
        >
          {presentation.sourceControlProviders.map((item) => (
            <SourceControlItemRowSurface
              key={item.id}
              mark={<SourceControlMarkSurface tone={item.statusTone} />}
              label={item.label}
              version={item.version ?? undefined}
              badge={
                item.badgeLabel ? (
                  <Badge variant="warning" size="sm">
                    {item.badgeLabel}
                  </Badge>
                ) : undefined
              }
              summary={sourceControlSummaryForLynx(item.summaryParts)}
              muted={!item.enabled}
            />
          ))}
        </SettingsSection>
      ) : null}
      {textGenerationSection}
    </view>
  );
}

export function ConnectionsSettings() {
  const { authAccess, serverConfig } = useT3ClientState();
  const canManageAccess = canManageAuthAccess(authAccess);
  const networkAccess = fixedNetworkAccessPresentation(serverConfig?.auth.policy);
  const showAuthorizedClients = shouldShowAuthorizedClients({
    canManageAccess,
    authPolicy: serverConfig?.auth.policy,
  });
  const [accessMutation, setAccessMutation] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [pairingCredential, setPairingCredential] = useState<PairingCredentialState | null>(null);

  const scopeLabel = (count: number) => `${count} ${count === 1 ? "scope" : "scopes"}`;
  const mutationError = (error: unknown) =>
    setAccessError(error instanceof Error ? error.message : String(error));

  const createPairingLink = () => {
    if (accessMutation) return;
    setAccessMutation("create");
    setAccessError(null);
    void t3ClientActions
      .createPairingCredential()
      .then((result) =>
        setPairingCredential({
          id: result.id,
          credential: result.credential,
          expiresAt: result.expiresAt,
        }),
      )
      .catch(mutationError)
      .finally(() => setAccessMutation(null));
  };

  const copyPairingCode = () => {
    if (!pairingCredential || accessMutation) return;
    setAccessMutation("copy");
    setAccessError(null);
    void clientCapabilities.clipboard
      .writeText(pairingCredential.credential)
      .catch(mutationError)
      .finally(() => setAccessMutation(null));
  };

  const revokePairingLink = (id: string) => {
    if (accessMutation) return;
    setAccessMutation(`link:${id}`);
    setAccessError(null);
    void t3ClientActions
      .revokePairingLink(id)
      .then((revoked) =>
        setPairingCredential((current) =>
          pairingCredentialAfterRevocation(current, { id, revoked }),
        ),
      )
      .catch(mutationError)
      .finally(() => setAccessMutation(null));
  };

  const revokeClientSession = (sessionId: string) => {
    if (accessMutation) return;
    setAccessMutation(`client:${sessionId}`);
    setAccessError(null);
    void t3ClientActions
      .revokeClientSession(sessionId)
      .catch(mutationError)
      .finally(() => setAccessMutation(null));
  };

  const revokeOtherClientSessions = () => {
    if (accessMutation) return;
    setAccessMutation("clients:others");
    setAccessError(null);
    void t3ClientActions
      .revokeOtherClientSessions()
      .catch(mutationError)
      .finally(() => setAccessMutation(null));
  };

  return (
    <SettingsPageContainer className="settings-connections-panel flex w-full min-w-0 flex-col self-stretch">
      <SettingsSection title="This environment">
        {canManageAccess ? (
          <SettingsRow
            className="settings-connections-network-access"
            title="Network access"
            description={networkAccess.description}
            control={
              <Toggle ariaLabel="Enable network access" value={networkAccess.checked} disabled />
            }
          />
        ) : (
          <SettingsRow
            title="Administrative access"
            description="Pairing links and client-session management require the access:write scope for this backend."
          />
        )}
      </SettingsSection>
      {showAuthorizedClients ? (
        <SettingsSection title="Authorized clients">
          <SettingsRow
            title="New pairing link"
            description={
              accessError ??
              (pairingCredential
                ? `One-time code: ${pairingCredential.credential} · ${formatRelativeTimeUntilLabel(pairingCredential.expiresAt, Date.now())}`
                : "Create a one-time code with standard client permissions.")
            }
            control={
              <SmallButton
                className="settings-connections-create-pairing"
                label={
                  accessMutation === "create"
                    ? "Creating…"
                    : accessMutation === "copy"
                      ? "Copying…"
                      : pairingCredential
                        ? "Copy code"
                        : "Create"
                }
                onTap={pairingCredential ? copyPairingCode : createPairingLink}
              />
            }
          />
          {authAccess.pairingLinks.map((pairingLink) => (
            <AccessListRowSurface
              key={pairingLink.id}
              statusDot={<StatusDotSurface tone="warning" />}
              primaryLabel={pairingLink.label}
              description={`${formatRelativeTimeUntilLabel(pairingLink.expiresAt, Date.now())} · ${scopeLabel(pairingLink.scopeCount)}`}
              control={
                <SmallButton
                  className={`settings-connections-revoke-pairing--${pairingLink.id}`}
                  label={accessMutation === `link:${pairingLink.id}` ? "Revoking…" : "Revoke"}
                  onTap={() => revokePairingLink(pairingLink.id)}
                />
              }
            />
          ))}
          {authAccess.clientSessions.map((clientSession) => (
            <AccessListRowSurface
              key={clientSession.sessionId}
              statusDot={<StatusDotSurface tone={clientSession.isLive ? "success" : "muted"} />}
              primaryLabel={clientSession.primaryLabel}
              primaryTrailing={
                clientSession.current ? (
                  <text className="access-list-row__device-chip">This device</text>
                ) : undefined
              }
              description={`${clientSession.isLive ? "Connected" : "Offline"} · ${clientSession.deviceInfoBits.join(" · ") || clientSession.subject} · ${scopeLabel(clientSession.scopeCount)}`}
              control={
                clientSession.current ? undefined : (
                  <SmallButton
                    label={
                      accessMutation === `client:${clientSession.sessionId}`
                        ? "Revoking…"
                        : "Revoke"
                    }
                    onTap={() => revokeClientSession(clientSession.sessionId)}
                  />
                )
              }
            />
          ))}
          {authAccess.clientSessions.some((clientSession) => !clientSession.current) ? (
            <SettingsRow
              title="Other clients"
              description="Revoke every authorized client except this device."
              control={
                <SmallButton
                  label={accessMutation === "clients:others" ? "Revoking…" : "Revoke all"}
                  onTap={revokeOtherClientSessions}
                />
              }
            />
          ) : null}
          {!authAccess.hasEntries ? (
            <view className="settings-empty-card">
              <text className="settings-empty__text">No pairing links or authorized clients.</text>
            </view>
          ) : null}
        </SettingsSection>
      ) : null}
      <SettingsSection
        id={searchableSetting("remote-environments").id}
        title="Remote environments"
        headerAction={
          <SmallButton
            className="settings-connections-add-environment"
            disabled
            icon={<Icon name="plus" size={12} color="#818181" />}
            label="Add environment"
          />
        }
      >
        <EmptyRemoteEnvironments
          cloudEnabled={false}
          icon={<Icon name="chevrons-left-right-ellipsis" size={18} color="#a1a1aa" />}
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

export function ArchiveSettings() {
  const { archivedThreads, projects } = useT3ClientState();
  const { archiveThread } = t3ClientActions;

  const groups = useMemo(() => {
    const result: Array<{
      readonly key: string;
      readonly title: string;
      readonly threads: Array<{
        readonly id: string;
        readonly title: string;
        readonly description: string;
      }>;
    }> = [];
    for (const project of projects) {
      const projectThreads = archivedThreads
        .filter((thread) => thread.projectId === project.id)
        .toSorted((left, right) => {
          const leftKey = left.archivedAt ?? left.createdAt;
          const rightKey = right.archivedAt ?? right.createdAt;
          return rightKey.localeCompare(leftKey) || right.id.localeCompare(left.id);
        });
      if (projectThreads.length === 0) continue;
      result.push({
        key: project.id,
        title: project.title,
        threads: projectThreads.map((thread) => ({
          id: thread.id,
          title: thread.title || "Untitled thread",
          description: `Archived ${formatRelativeTimeLabel(thread.archivedAt ?? thread.createdAt, Date.now())} · Created ${formatRelativeTimeLabel(thread.createdAt, Date.now())}`,
        })),
      });
    }
    return result;
  }, [archivedThreads, projects]);

  return (
    <view className="settings-panel">
      <ArchivedThreadsSurface
        anchorId={searchableSetting("archive").id}
        groups={groups.map((group) => ({
          ...group,
          threads: group.threads.map((thread) => ({
            ...thread,
            action: (
              <SmallButton
                className={`settings-archive-unarchive--${thread.id}`}
                label="Unarchive"
                onTap={() => archiveThread(thread.id, true)}
              />
            ),
          })),
        }))}
        emptyTitle="No archived threads"
        emptyDescription="Archived threads will appear here."
      />
    </view>
  );
}

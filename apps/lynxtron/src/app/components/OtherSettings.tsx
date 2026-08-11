import {
  formatRelativeTimeLabel,
  formatRelativeTimeUntilLabel,
} from "@t3tools/client-runtime/presentation/time";
import {
  projectSourceControlDiscovery,
  redactSourceControlAccount,
  type SourceControlSummaryPart,
} from "@t3tools/client-runtime/presentation/source-control";
import type { SourceControlDiscoveryResult } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "@lynx-js/react";

import {
  ArchivedThreadsSurface,
  BetaSettingsSurface,
  AccessListRowSurface,
  SourceControlItemRowSurface,
  SourceControlMarkSurface,
  StatusDotSurface,
} from "../../../../web/src/components/settings/SettingsSurfaces";
import { searchableSetting } from "../../../../web/src/components/settings/settingsSearch";
import { Badge } from "../../../../web/src/components/ui/badge";
import { SettingsRow, SettingsSection, Toggle } from "./SettingsControls";
import { SmallButton } from "./SettingsControls";
import { clientCapabilities } from "../platform/clientCapabilities";
import { useClientSettingsState } from "../state/prefsStore";
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

function sourceControlSummaryForLynx(
  parts: ReadonlyArray<SourceControlSummaryPart>,
): string {
  return parts
    .map((part) =>
      part.kind === "sensitive"
        ? `${part.prefix}${redactSourceControlAccount(part.text)}`
        : part.text,
    )
    .join("");
}

export function SourceControlSettings() {
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

  if (discovery.pending && !discovery.result) {
    return (
      <view className="settings-panel">
        <SettingsSection
          id={searchableSetting("source-control").id}
          title="Source Control"
          headerAction={scanButton}
        >
          <view className="settings-empty-card">
            <text className="settings-empty__text">Scanning server integrations…</text>
          </view>
        </SettingsSection>
      </view>
    );
  }

  if (discovery.error || !presentation.hasItems) {
    return (
      <view className="settings-panel">
        <SettingsSection
          id={searchableSetting("source-control").id}
          title="Source Control"
          headerAction={scanButton}
        >
          <view className="settings-empty-card settings-empty-card--action">
            <text
              className="settings-empty__text"
              data-source-control-error={discovery.error ? "true" : undefined}
            >
              {discovery.error ?? "No source-control integrations detected."}
            </text>
            <view data-source-control-retry>
              <SmallButton
                label={discovery.pending ? "Scanning…" : "Scan"}
                onTap={() => setRefreshVersion((version) => version + 1)}
              />
            </view>
          </view>
        </SettingsSection>
      </view>
    );
  }

  return (
    <view className="settings-panel">
      {presentation.versionControlSystems.length > 0 ? (
        <SettingsSection
          id={searchableSetting("source-control").id}
          title="Version Control"
          headerAction={scanButton}
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
        <SettingsSection title="Source Control Providers" headerAction={scanButton}>
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
    </view>
  );
}

export function ConnectionsSettings() {
  const { authAccess } = useT3ClientState();
  const [accessMutation, setAccessMutation] = useState<string | null>(null);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [pairingCredential, setPairingCredential] = useState<{
    readonly credential: string;
    readonly expiresAt: string;
  } | null>(null);

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
    <view className="settings-panel">
      <SettingsSection title="This environment">
        <SettingsRow
          title="Network access"
          description="Local only. Lynxtron launches this backend on the loopback interface."
        />
        <SettingsRow
          title="Access inventory"
          description={`${authAccess.clientSessionCount} authorized ${authAccess.clientSessionCount === 1 ? "client" : "clients"} · ${authAccess.pairingLinkCount} active pairing ${authAccess.pairingLinkCount === 1 ? "link" : "links"}`}
        />
      </SettingsSection>
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
                    accessMutation === `client:${clientSession.sessionId}` ? "Revoking…" : "Revoke"
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
      <SettingsSection
        id={searchableSetting("remote-environments").id}
        title="Remote environments"
      >
        <view className="settings-empty-card">
          <text className="settings-empty__text">No saved remote environments</text>
          <text className="settings-empty__hint">
            Remote environment catalog actions have not moved into the Lynx host yet.
          </text>
        </view>
      </SettingsSection>
    </view>
  );
}

export function BetaSettings() {
  const [clientSettings, updateClientSettings] = useClientSettingsState();
  return (
    <view className="settings-panel">
      <BetaSettingsSurface
        sidebarV2Setting={searchableSetting("sidebar-v2")}
        sidebarV2Control={
          <Toggle
            value={clientSettings.sidebarV2Enabled}
            onChange={(sidebarV2Enabled) => updateClientSettings({ sidebarV2Enabled })}
          />
        }
        sidebarV2Status="The Lynx Sidebar v2 renderer has not moved yet; the preference syncs to other clients."
      />
    </view>
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
            action: <SmallButton label="Unarchive" onTap={() => archiveThread(thread.id, true)} />,
          })),
        }))}
        emptyTitle="No archived threads"
        emptyDescription="Archived threads will appear here."
      />
    </view>
  );
}

import {
  formatRelativeTimeLabel,
  formatRelativeTimeUntilLabel,
} from "@t3tools/client-runtime/presentation/time";
import {
  projectSourceControlDiscovery,
  sourceControlSummaryText,
  type SourceControlItemPresentation,
} from "@t3tools/client-runtime/presentation/source-control";
import type { SourceControlDiscoveryResult } from "@t3tools/contracts";
import { useEffect, useMemo, useState } from "@lynx-js/react";

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

function sourceControlStatusLabel(item: SourceControlItemPresentation): string {
  if (item.badgeLabel) return item.badgeLabel;
  return item.enabled ? "Ready" : "Unavailable";
}

function SourceControlRow({ item }: { readonly item: SourceControlItemPresentation }) {
  const version = item.version ? ` · ${item.version}` : "";
  return (
    <SettingsRow
      title={item.label}
      description={`${sourceControlSummaryText(item)}${version}`}
      control={
        <text className={`source-control-status source-control-status--${item.statusTone}`}>
          {sourceControlStatusLabel(item)}
        </text>
      }
    />
  );
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

  if (discovery.pending && !discovery.result) {
    return (
      <view className="settings-panel">
        <SettingsSection title="Source Control">
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
        <SettingsSection title="Source Control">
          <view className="settings-empty-card settings-empty-card--action">
            <text className="settings-empty__text">
              {discovery.error ?? "No source-control integrations detected."}
            </text>
            <SmallButton
              label={discovery.pending ? "Scanning…" : "Scan"}
              onTap={() => setRefreshVersion((version) => version + 1)}
            />
          </view>
        </SettingsSection>
      </view>
    );
  }

  return (
    <view className="settings-panel">
      {presentation.versionControlSystems.length > 0 ? (
        <SettingsSection title="Version Control">
          {presentation.versionControlSystems.map((item) => (
            <SourceControlRow key={item.id} item={item} />
          ))}
        </SettingsSection>
      ) : null}
      {presentation.sourceControlProviders.length > 0 ? (
        <SettingsSection title="Source Control Providers">
          {presentation.sourceControlProviders.map((item) => (
            <SourceControlRow key={item.id} item={item} />
          ))}
        </SettingsSection>
      ) : null}
      <view className="settings-rescan-row">
        <SmallButton
          label={discovery.pending ? "Scanning…" : "Rescan"}
          onTap={() => setRefreshVersion((version) => version + 1)}
        />
      </view>
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
          <SettingsRow
            key={pairingLink.id}
            title={pairingLink.label}
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
          <SettingsRow
            key={clientSession.sessionId}
            title={clientSession.primaryLabel}
            description={`${clientSession.isLive ? "Connected" : "Offline"} · ${clientSession.deviceInfoBits.join(" · ") || clientSession.subject} · ${scopeLabel(clientSession.scopeCount)}`}
            control={
              clientSession.current ? (
                <text className="source-control-status source-control-status--success">
                  This device
                </text>
              ) : (
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
      <SettingsSection title="Remote environments">
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
      <SettingsSection title="Beta features">
        <SettingsRow
          title="Sidebar v2"
          description="Persist the canonical beta preference. The Lynx Sidebar v2 renderer has not moved yet."
          control={
            <Toggle
              value={clientSettings.sidebarV2Enabled}
              onChange={(sidebarV2Enabled) => updateClientSettings({ sidebarV2Enabled })}
            />
          }
        />
      </SettingsSection>
    </view>
  );
}

export function ArchiveSettings() {
  const { archivedThreads, projects } = useT3ClientState();
  const { archiveThread } = t3ClientActions;
  const projectName = projects.length > 0 ? projects[0].title : "workspace";

  return (
    <view className="settings-panel">
      <SettingsSection title={projectName}>
        {archivedThreads.length === 0 ? (
          <view className="settings-empty-card">
            <text className="settings-empty__text">No archived threads</text>
          </view>
        ) : (
          archivedThreads.map((t) => (
            <SettingsRow
              key={t.id}
              title={t.title || "Untitled thread"}
              description={`Archived ${formatRelativeTimeLabel(t.archivedAt ?? "", Date.now())} · Created ${formatRelativeTimeLabel(t.updatedAt, Date.now())}`}
              control={<SmallButton label="Unarchive" onTap={() => archiveThread(t.id, true)} />}
            />
          ))
        )}
      </SettingsSection>
    </view>
  );
}

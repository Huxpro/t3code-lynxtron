import type {
  AuthAccessSnapshot,
  AuthClientMetadata,
  AuthEnvironmentScope,
  AuthSessionId,
  ServerAuthPolicy,
  ServerAuthSessionMethod,
} from "@t3tools/contracts";
import { AuthAccessWriteScope } from "@t3tools/contracts";
import type { ConnectionTarget } from "../connection/model.ts";

export const DESKTOP_LOCAL_CONNECTION_ID_PREFIX = "local:";

export function desktopLocalConnectionId(backendId: string): string {
  return `${DESKTOP_LOCAL_CONNECTION_ID_PREFIX}${backendId}`;
}

export function isDesktopLocalConnectionTarget(
  target: ConnectionTarget,
): target is Extract<ConnectionTarget, { readonly _tag: "BearerConnectionTarget" }> {
  return (
    target._tag === "BearerConnectionTarget" &&
    target.connectionId.startsWith(DESKTOP_LOCAL_CONNECTION_ID_PREFIX)
  );
}

export function desktopLocalBackendId(target: ConnectionTarget): string | null {
  return isDesktopLocalConnectionTarget(target)
    ? target.connectionId.slice(DESKTOP_LOCAL_CONNECTION_ID_PREFIX.length)
    : null;
}

export interface AuthPairingLinkPresentation {
  readonly id: string;
  readonly label: string;
  readonly subject: string;
  readonly scopes: ReadonlyArray<AuthEnvironmentScope>;
  readonly scopeCount: number;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface AuthClientSessionPresentation {
  readonly sessionId: AuthSessionId;
  readonly subject: string;
  readonly scopes: ReadonlyArray<AuthEnvironmentScope>;
  readonly scopeCount: number;
  readonly method: ServerAuthSessionMethod;
  readonly client: AuthClientMetadata;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly lastConnectedAt: string | null;
  readonly connected: boolean;
  readonly current: boolean;
  readonly isLive: boolean;
  readonly primaryLabel: string;
  readonly deviceInfoBits: ReadonlyArray<string>;
}

export interface AuthAccessPresentation {
  readonly pairingLinks: ReadonlyArray<AuthPairingLinkPresentation>;
  readonly clientSessions: ReadonlyArray<AuthClientSessionPresentation>;
  readonly pairingLinkCount: number;
  readonly clientSessionCount: number;
  readonly hasEntries: boolean;
}

export function canManageAuthAccess(presentation: AuthAccessPresentation): boolean {
  return (
    presentation.clientSessions
      .find((clientSession) => clientSession.current)
      ?.scopes.includes(AuthAccessWriteScope) ?? false
  );
}

export function shouldShowAuthorizedClients(options: {
  readonly canManageAccess: boolean;
  readonly authPolicy: ServerAuthPolicy | null | undefined;
}): boolean {
  return options.canManageAccess && options.authPolicy === "remote-reachable";
}

function formatDateTime(value: { readonly epochMilliseconds: number }): string {
  // @effect-diagnostics-next-line globalDate:off -- schema-free renderer projection
  return new Date(value.epochMilliseconds).toISOString();
}

function authClientPrimaryLabel(client: AuthClientMetadata, subject: string): string {
  return client.label ?? ([client.os, client.browser].filter(Boolean).join(" · ") || subject);
}

function authClientDeviceInfo(client: AuthClientMetadata): ReadonlyArray<string> {
  return [
    client.deviceType !== "unknown"
      ? client.deviceType[0]?.toUpperCase() + client.deviceType.slice(1)
      : null,
    client.os ?? null,
    client.browser ?? null,
    client.ipAddress ?? null,
  ].filter((value): value is string => value !== null);
}

export function projectAuthAccess(snapshot: AuthAccessSnapshot): AuthAccessPresentation {
  const pairingLinks = [...snapshot.pairingLinks]
    .sort((left, right) => right.createdAt.epochMilliseconds - left.createdAt.epochMilliseconds)
    .map<AuthPairingLinkPresentation>((pairingLink) => ({
      id: pairingLink.id,
      label: pairingLink.label ?? "Pairing link",
      subject: pairingLink.subject,
      scopes: pairingLink.scopes,
      scopeCount: pairingLink.scopes.length,
      createdAt: formatDateTime(pairingLink.createdAt),
      expiresAt: formatDateTime(pairingLink.expiresAt),
    }));

  const clientSessions = [...snapshot.clientSessions]
    .sort((left, right) => {
      if (left.current !== right.current) return left.current ? -1 : 1;
      if (left.connected !== right.connected) return left.connected ? -1 : 1;
      return right.issuedAt.epochMilliseconds - left.issuedAt.epochMilliseconds;
    })
    .map<AuthClientSessionPresentation>((clientSession) => ({
      sessionId: clientSession.sessionId,
      subject: clientSession.subject,
      scopes: clientSession.scopes,
      scopeCount: clientSession.scopes.length,
      method: clientSession.method,
      client: clientSession.client,
      issuedAt: formatDateTime(clientSession.issuedAt),
      expiresAt: formatDateTime(clientSession.expiresAt),
      lastConnectedAt:
        clientSession.lastConnectedAt === null
          ? null
          : formatDateTime(clientSession.lastConnectedAt),
      connected: clientSession.connected,
      current: clientSession.current,
      isLive: clientSession.current || clientSession.connected,
      primaryLabel: authClientPrimaryLabel(clientSession.client, clientSession.subject),
      deviceInfoBits: authClientDeviceInfo(clientSession.client),
    }));

  return {
    pairingLinks,
    clientSessions,
    pairingLinkCount: pairingLinks.length,
    clientSessionCount: clientSessions.length,
    hasEntries: pairingLinks.length > 0 || clientSessions.length > 0,
  };
}

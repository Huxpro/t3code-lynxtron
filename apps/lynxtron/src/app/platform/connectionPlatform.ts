// The Lynx side of upstream's connection ports. Upstream's `Connection` layer
// asks its client for a socket, an HTTP client, stores, and a set of platform
// capabilities; this module answers each one for a desktop client that has one
// local environment, reached with the address and bearer the main process
// holds. Nothing here runs until a layer is built: the module is compiled for
// both Lynx threads and only the background thread may build it.
import { TokenStore } from "@t3tools/client-runtime/authorization";
import {
  ConnectionBlockedError,
  ConnectionTransientError,
  Connectivity,
  CredentialStore,
  GitHubRoutingPermissions,
  makeGitHubRoutingPermissions,
  mapRemoteEnvironmentError,
  PrimaryConnectionRegistration,
  PrimaryConnectionTarget,
  ProfileStore,
  Wakeups,
} from "@t3tools/client-runtime/connection";
import { fetchRemoteEnvironmentDescriptor } from "@t3tools/client-runtime/environment";
import {
  ClientPresentation,
  CloudSession,
  ConnectionRegistrationStore,
  ConnectionTargetStore,
  EMPTY_CONNECTION_CATALOG_DOCUMENT,
  EnvironmentCacheStore,
  PlatformConnectionSource,
  PrimaryEnvironmentAuth,
  putRemoteDpopTokenInCatalog,
  registerConnectionInCatalog,
  RelayDeviceIdentity,
  removeCatalogValue,
  removeConnectionFromCatalog,
  replaceCatalogValue,
  setConnectionEnabledInCatalog,
  SshEnvironmentGateway,
} from "@t3tools/client-runtime/platform";
import { ManagedRelay } from "@t3tools/client-runtime/relay";
import { remoteHttpClientLayer } from "@t3tools/client-runtime/rpc";
import { AuthStandardClientScopes } from "@t3tools/contracts";
import { RelayWebClientId } from "@t3tools/contracts/relay";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { HttpClient } from "effect/unstable/http";
import * as Socket from "effect/unstable/socket/Socket";

import { T3_CONNECTOR_METHODS } from "../../shared/connectorProtocol.ts";
import { type BridgeCallModule, callBridge } from "../state/mainConnectorTransport.ts";
import { HostWebSocket } from "./hostWebSocket.ts";

export interface HostHttpRequest {
  readonly url: string;
  readonly method: string;
  readonly headers: Record<string, string>;
  readonly body?: string;
}

export interface HostHttpResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

export type HostHttpFetch = (request: HostHttpRequest) => Promise<HostHttpResponse>;

declare const NativeModules:
  | {
      readonly bridge?: BridgeCallModule;
      readonly nodejs?: { readonly exposed?: { readonly httpFetch?: HostHttpFetch } };
    }
  | undefined;

type RemoteFetch = Parameters<typeof remoteHttpClientLayer>[0];

interface HostFetchInit {
  readonly method?: string;
  readonly headers?: Readonly<Record<string, unknown>>;
  readonly body?: unknown;
}

function requestBodyText(body: unknown): string | undefined {
  if (body === undefined || body === null) return undefined;
  if (typeof body === "string") return body;
  if (body instanceof Uint8Array) return new TextDecoder().decode(body);
  throw new TypeError("The host fetch port sends text bodies only.");
}

function requestHeaders(headers: HostFetchInit["headers"]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (typeof value === "string") result[name] = value;
  }
  return result;
}

/**
 * The members of a `Response` that Effect's fetch client reads: `status`,
 * `url`, `headers` as a record, `body` (null, so nothing is streamed) and
 * `arrayBuffer()`, from which it derives text and JSON. The Lynx engine has no
 * `Response` or `Headers` class to construct instead.
 */
function hostResponse(url: string, reply: HostHttpResponse) {
  const bytes = () => {
    const encoded = new TextEncoder().encode(reply.body);
    return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
  };
  return {
    url,
    status: reply.status,
    statusText: "",
    ok: reply.status >= 200 && reply.status < 300,
    headers: reply.headers,
    body: null,
    arrayBuffer: () => Promise.resolve(bytes()),
    text: () => Promise.resolve(reply.body),
    json: () => Promise.resolve().then((): unknown => JSON.parse(reply.body)),
    formData: () => Promise.reject(new TypeError("The host fetch port returns text bodies only.")),
  };
}

/**
 * A `fetch` for upstream's HTTP client, carried by the preload's `httpFetch`.
 * It takes a URL and text or UTF-8 byte bodies, which is what the environment
 * HTTP API sends. The abort signal is not forwarded: an interrupted request is
 * dropped by its caller while the host finishes it.
 */
export function makeHostFetch(httpFetch: HostHttpFetch): RemoteFetch {
  const hostFetch = async (input: unknown, init?: HostFetchInit) => {
    const url = String(input);
    const body = requestBodyText(init?.body);
    const reply = await httpFetch({
      url,
      method: init?.method ?? "GET",
      headers: requestHeaders(init?.headers),
      ...(body === undefined ? {} : { body }),
    });
    return hostResponse(url, reply);
  };
  return hostFetch as unknown as RemoteFetch;
}

const hostHttpFetch: HostHttpFetch = (request) => {
  const httpFetch =
    typeof NativeModules === "undefined" ? undefined : NativeModules.nodejs?.exposed?.httpFetch;
  return typeof httpFetch === "function"
    ? httpFetch(request)
    : Promise.reject(new Error("The host provides no HTTP port."));
};

const httpClientLayer = remoteHttpClientLayer(makeHostFetch(hostHttpFetch));

// Upstream passes protocols or nothing; Node-style client options have no
// meaning for the host socket.
const webSocketLayer = Layer.succeed(
  Socket.WebSocketConstructor,
  (url, options) =>
    new HostWebSocket(
      url,
      typeof options === "string" || Array.isArray(options) ? options : undefined,
    ),
);

const PrimaryConnection = Schema.Struct({
  httpBaseUrl: Schema.String,
  wsBaseUrl: Schema.String,
  bearer: Schema.String,
});
export type PrimaryConnection = typeof PrimaryConnection.Type;

const decodePrimaryConnection = Schema.decodeUnknownEffect(Schema.NullOr(PrimaryConnection));

function primaryUnavailable(detail: string) {
  return new ConnectionTransientError({ reason: "endpoint-unavailable", detail });
}

/**
 * Reads the primary environment's address and bearer once. `call` is the
 * bridge request; it answers null until the main connector has connected, and
 * that is a failure here so callers can retry it.
 */
export const readPrimaryConnection = (call: () => Promise<unknown>) =>
  Effect.tryPromise({
    try: call,
    catch: (cause) => primaryUnavailable(`Could not ask the host for the server: ${String(cause)}`),
  }).pipe(
    Effect.flatMap((reply) =>
      decodePrimaryConnection(reply).pipe(
        Effect.mapError(() => primaryUnavailable("The host returned a malformed server address.")),
      ),
    ),
    Effect.flatMap((connection) =>
      connection === null
        ? Effect.fail(primaryUnavailable("The local server is not connected yet."))
        : Effect.succeed(connection),
    ),
  );

const PRIMARY_CONNECTION_RETRY = Schedule.spaced("1 second");

/** Repeats an effect that needs the primary connection until the host has one to give. */
export const waitForPrimaryConnection = <A, E, R>(
  read: Effect.Effect<A, E, R>,
  schedule: Schedule.Schedule<unknown, E> = PRIMARY_CONNECTION_RETRY,
) => Effect.retry(read, schedule);

const readHostPrimaryConnection = readPrimaryConnection(() => {
  const bridge = typeof NativeModules === "undefined" ? undefined : NativeModules.bridge;
  return bridge
    ? callBridge(bridge, T3_CONNECTOR_METHODS.primaryConnection, {})
    : Promise.reject(new Error("the bridge is unavailable"));
});

// One emission: the local environment, once the main connector has a server
// and that server has answered with its identity. The address is not followed
// afterwards; the bearer is, because `PrimaryEnvironmentAuth` reads it on
// every connection attempt.
const platformConnectionSourceLayer = Layer.effect(
  PlatformConnectionSource,
  Effect.gen(function* () {
    const httpClient = yield* HttpClient.HttpClient;
    const loadRegistration = Effect.gen(function* () {
      const connection = yield* readHostPrimaryConnection;
      const descriptor = yield* fetchRemoteEnvironmentDescriptor({
        httpBaseUrl: connection.httpBaseUrl,
      }).pipe(
        Effect.mapError((error) => mapRemoteEnvironmentError(error)),
        Effect.provideService(HttpClient.HttpClient, httpClient),
      );
      return new PrimaryConnectionRegistration({
        target: new PrimaryConnectionTarget({
          environmentId: descriptor.environmentId,
          label: descriptor.label,
          httpBaseUrl: connection.httpBaseUrl,
          wsBaseUrl: connection.wsBaseUrl,
        }),
      });
    });
    return PlatformConnectionSource.of({
      registrations: Stream.fromEffect(waitForPrimaryConnection(loadRegistration)).pipe(
        Stream.map((registration) => [registration]),
        Stream.catch((error) =>
          Stream.fromEffect(
            Effect.logWarning("Could not discover the primary environment.", { error }),
          ).pipe(Stream.drain),
        ),
      ),
    });
  }),
);

const SSH_UNSUPPORTED_DETAIL = "SSH environments are not available in the Lynx client.";
const CLOUD_UNSUPPORTED_DETAIL = "T3 Connect is not available in the Lynx client.";

function sshUnsupported() {
  return Effect.fail(
    new ConnectionBlockedError({ reason: "unsupported", detail: SSH_UNSUPPORTED_DETAIL }),
  );
}

const capabilitiesLayer = Layer.succeedContext(
  Context.make(
    CloudSession,
    CloudSession.of({
      identity: Effect.succeedNone,
      clerkToken: Effect.fail(
        new ConnectionBlockedError({ reason: "unsupported", detail: CLOUD_UNSUPPORTED_DETAIL }),
      ),
    }),
  ).pipe(
    Context.add(
      PrimaryEnvironmentAuth,
      PrimaryEnvironmentAuth.of({
        bearerToken: readHostPrimaryConnection.pipe(
          Effect.map((connection) => Option.some(connection.bearer)),
        ),
      }),
    ),
    Context.add(RelayDeviceIdentity, RelayDeviceIdentity.of({ deviceId: Effect.succeedNone })),
    Context.add(
      ClientPresentation,
      ClientPresentation.of({
        metadata: { label: "T3 Code Lynxtron", deviceType: "desktop", surface: "desktop" },
        scopes: AuthStandardClientScopes,
      }),
    ),
    Context.add(
      SshEnvironmentGateway,
      SshEnvironmentGateway.of({
        provision: sshUnsupported,
        prepare: sshUnsupported,
        disconnect: () => Effect.void,
      }),
    ),
  ),
);

// The relay client disables itself for a URL that is not a secure relay; this
// is the same placeholder upstream's clients pass when no relay is configured.
// The signer is only reached for relay environments, which this client never
// registers; its key-store name is the nearest one the contract has.
const relaySignerLayer = Layer.succeed(
  ManagedRelay.ManagedRelayDpopSigner,
  ManagedRelay.ManagedRelayDpopSigner.of({
    thumbprint: Effect.fail(
      new ManagedRelay.ManagedRelayDpopKeyLoadError({
        keyStore: "indexed-db",
        cause: CLOUD_UNSUPPORTED_DETAIL,
      }),
    ),
    createProof: (input) =>
      Effect.fail(
        new ManagedRelay.ManagedRelayDpopProofCreationError({
          method: input.method,
          url: input.url,
          cause: CLOUD_UNSUPPORTED_DETAIL,
        }),
      ),
  }),
);

const relayLayer = ManagedRelay.layer({
  relayUrl: "http://relay.invalid",
  clientId: RelayWebClientId,
}).pipe(Layer.provideMerge(relaySignerLayer));

// The Lynx client cannot observe the network or its own foreground state.
const connectivityLayer = Connectivity.layer({
  status: Effect.succeed("unknown"),
  changes: Stream.never,
});
const wakeupsLayer = Wakeups.layer({ changes: Stream.never });

// Saved connections live for the life of the page. The primary environment is
// never saved: it comes from the host on every launch.
const storageLayer = Layer.effectContext(
  Effect.gen(function* () {
    const catalog = yield* Ref.make(EMPTY_CONNECTION_CATALOG_DOCUMENT);
    const read = Ref.get(catalog);
    const update = (
      transform: (
        document: typeof EMPTY_CONNECTION_CATALOG_DOCUMENT,
      ) => typeof EMPTY_CONNECTION_CATALOG_DOCUMENT,
    ) => Ref.update(catalog, transform);

    const githubRoutingPermissions = yield* makeGitHubRoutingPermissions({
      read: Effect.map(read, (document) => document.githubRoutingPermissions ?? []),
      write: (permissions) =>
        update((document) => ({ ...document, githubRoutingPermissions: permissions })),
    });

    return Context.make(
      ConnectionTargetStore,
      ConnectionTargetStore.of({
        list: Effect.map(read, (document) => document.targets),
        listDisabled: Effect.map(read, (document) => document.disabledEnvironmentIds),
      }),
    ).pipe(
      Context.add(GitHubRoutingPermissions, githubRoutingPermissions),
      Context.add(
        ConnectionRegistrationStore,
        ConnectionRegistrationStore.of({
          register: (registration) =>
            update((document) => registerConnectionInCatalog(document, registration)),
          remove: (target) => update((document) => removeConnectionFromCatalog(document, target)),
          setEnabled: (environmentId, enabled) =>
            update((document) => setConnectionEnabledInCatalog(document, environmentId, enabled)),
        }),
      ),
      Context.add(
        ProfileStore.ConnectionProfileStore,
        ProfileStore.make({
          get: (connectionId) =>
            Effect.map(read, (document) =>
              Option.fromUndefinedOr(
                document.profiles.find((profile) => profile.connectionId === connectionId),
              ),
            ),
          put: (profile) =>
            update((document) => ({
              ...document,
              profiles: replaceCatalogValue(
                document.profiles,
                (value) => value.connectionId,
                profile,
              ),
            })),
          remove: (connectionId) =>
            update((document) => ({
              ...document,
              profiles: removeCatalogValue(
                document.profiles,
                (value) => value.connectionId,
                connectionId,
              ),
            })),
        }),
      ),
      Context.add(
        CredentialStore.ConnectionCredentialStore,
        CredentialStore.make({
          get: (connectionId) =>
            Effect.map(read, (document) =>
              Option.fromUndefinedOr(
                document.credentials.find((entry) => entry.connectionId === connectionId)
                  ?.credential,
              ),
            ),
          put: (connectionId, credential) =>
            update((document) => ({
              ...document,
              credentials: replaceCatalogValue(
                document.credentials,
                (value) => value.connectionId,
                { connectionId, credential },
              ),
            })),
          remove: (connectionId) =>
            update((document) => ({
              ...document,
              credentials: removeCatalogValue(
                document.credentials,
                (value) => value.connectionId,
                connectionId,
              ),
            })),
        }),
      ),
      Context.add(
        TokenStore.RemoteDpopAccessTokenStore,
        TokenStore.make({
          get: (environmentId) =>
            Effect.map(read, (document) =>
              Option.fromUndefinedOr(
                document.remoteDpopTokens.find((token) => token.environmentId === environmentId),
              ),
            ),
          put: (token) => update((document) => putRemoteDpopTokenInCatalog(document, token)),
          remove: (environmentId) =>
            update((document) => ({
              ...document,
              remoteDpopTokens: removeCatalogValue(
                document.remoteDpopTokens,
                (value) => value.environmentId,
                environmentId,
              ),
            })),
        }),
      ),
    );
  }),
);

// A cache that holds nothing: every load misses and the live subscription
// supplies the data. The shell and thread atoms already keep what they show.
const environmentCacheLayer = Layer.succeed(
  EnvironmentCacheStore,
  EnvironmentCacheStore.of({
    loadShell: () => Effect.succeedNone,
    saveShell: () => Effect.void,
    loadThread: () => Effect.succeedNone,
    saveThread: () => Effect.void,
    removeThread: () => Effect.void,
    loadServerConfig: () => Effect.succeedNone,
    saveServerConfig: () => Effect.void,
    loadVcsRefs: () => Effect.succeedNone,
    saveVcsRefs: () => Effect.void,
    removeVcsRefs: () => Effect.void,
    clearVcsRefs: () => Effect.void,
    clear: () => Effect.void,
  }),
);

/** Everything upstream's `Connection` layer and snapshot loaders require. */
export const connectionPlatformLayer = Layer.mergeAll(
  webSocketLayer,
  relayLayer,
  storageLayer,
  environmentCacheLayer,
  connectivityLayer,
  wakeupsLayer,
  capabilitiesLayer,
  platformConnectionSourceLayer,
).pipe(Layer.provideMerge(httpClientLayer));

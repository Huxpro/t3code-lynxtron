import type { EnvironmentId, ServerConfig } from "@t3tools/contracts";
import type { EnvironmentPresentation as BaseEnvironmentPresentation } from "@t3tools/client-runtime/connection";

import { LYNX_PRIMARY_ENVIRONMENT_ID } from "../../../lynxtron/src/app/state/environment";
import { useT3ClientState } from "../../../lynxtron/src/app/state/t3Client";

function primaryEnvironment(label: string) {
  return {
    environmentId: LYNX_PRIMARY_ENVIRONMENT_ID,
    label,
    displayUrl: null,
    relayManaged: false,
    entry: {
      target: {
        _tag: "DirectConnectionTarget",
        environmentId: LYNX_PRIMARY_ENVIRONMENT_ID,
        label,
      },
    },
    connection: {
      phase: "connected",
      error: null,
    },
    // Pull requests are not offered in Lynx, so no capability is advertised.
    serverConfig: null as ServerConfig | null,
  } as const;
}

/** Same shape the Web module exports; upstream modules imported in place use it as a type. */
export interface EnvironmentPresentation extends BaseEnvironmentPresentation {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly displayUrl: string | null;
  readonly relayManaged: boolean;
}

export function useEnvironments() {
  const label = useT3ClientState().serverConfig?.environment.label ?? "Local";
  const environment = primaryEnvironment(label);
  return {
    isReady: true,
    networkStatus: "online",
    environments: [environment],
    presentationById: new Map([[LYNX_PRIMARY_ENVIRONMENT_ID, environment]]),
  };
}

export function usePrimaryEnvironmentId(): EnvironmentId {
  return LYNX_PRIMARY_ENVIRONMENT_ID;
}

export function useEnvironment(environmentId: EnvironmentId | null) {
  const environment = primaryEnvironment(
    useT3ClientState().serverConfig?.environment.label ?? "Local",
  );
  return environmentId === LYNX_PRIMARY_ENVIRONMENT_ID ? environment : null;
}

export function usePrimaryEnvironment() {
  return primaryEnvironment(useT3ClientState().serverConfig?.environment.label ?? "Local");
}

export function useEnvironmentHttpBaseUrl(): null {
  return null;
}

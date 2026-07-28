import type { EnvironmentId } from "@t3tools/contracts";

import { LYNX_PRIMARY_ENVIRONMENT_ID } from "../../../lynxtron/src/app/state/environment";

const PRIMARY_ENVIRONMENT = {
  environmentId: LYNX_PRIMARY_ENVIRONMENT_ID,
  label: "Local",
  displayUrl: null,
  relayManaged: false,
  entry: {
    target: {
      _tag: "DirectConnectionTarget",
      environmentId: LYNX_PRIMARY_ENVIRONMENT_ID,
      label: "Local",
    },
  },
  connection: {
    phase: "connected",
    error: null,
  },
};

export function useEnvironments() {
  return {
    isReady: true,
    networkStatus: "online",
    environments: [PRIMARY_ENVIRONMENT],
    presentationById: new Map([[LYNX_PRIMARY_ENVIRONMENT_ID, PRIMARY_ENVIRONMENT]]),
  };
}

export function usePrimaryEnvironmentId(): EnvironmentId {
  return LYNX_PRIMARY_ENVIRONMENT_ID;
}

export function useEnvironment(environmentId: EnvironmentId | null) {
  return environmentId === LYNX_PRIMARY_ENVIRONMENT_ID ? PRIMARY_ENVIRONMENT : null;
}

export function usePrimaryEnvironment() {
  return PRIMARY_ENVIRONMENT;
}

export function useEnvironmentHttpBaseUrl(): null {
  return null;
}

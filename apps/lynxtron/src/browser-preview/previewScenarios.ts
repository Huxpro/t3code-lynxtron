/**
 * Lynx-for-Web preview scenarios.
 *
 * A thin adapter over the deterministic fallback scenario catalog
 * (`fallbackScenarios.ts`, relocated from the deleted Web reference host in Plan
 * 11B). These static snapshots back the offline/fault-injection preview path;
 * the default workbench data source is now the SB1 live shared-server transport.
 *
 * The catalog types its snapshots structurally; the `satisfies` check below
 * fails the build if it and this renderer's `ConnectorSnapshot` ever drift.
 */
import {
  DEFAULT_WORKBENCH_SCENARIO_ID,
  isWorkbenchScenarioId,
  WORKBENCH_SCENARIOS,
  type WorkbenchScenario,
  type WorkbenchScenarioId,
} from "./fallbackScenarios.ts";
import type { ServerConfig } from "@t3tools/contracts";
import type { ConnectorSnapshot } from "../shared/connectorProtocol.ts";

export type BrowserPreviewScenarioId = WorkbenchScenarioId;

export type BrowserPreviewScenario = WorkbenchScenario & {
  readonly snapshot: Omit<ConnectorSnapshot, "config"> & {
    readonly config: ServerConfig | null;
  };
};

const scenarios = WORKBENCH_SCENARIOS as Record<WorkbenchScenarioId, BrowserPreviewScenario>;

// Drift guard: the web-owned catalog snapshots must remain assignable to this
// renderer's connector snapshot contract apart from the schema-encoded config
// boundary. This is a compile-time check only.
type RuntimeConfigSnapshot = Omit<ConnectorSnapshot, "config"> & {
  readonly config: ServerConfig | null;
};
type _AssertSnapshotShape = WorkbenchScenario["snapshot"] extends RuntimeConfigSnapshot
  ? true
  : never;
const _assertSnapshotShape: _AssertSnapshotShape = true;
void _assertSnapshotShape;

export const BROWSER_PREVIEW_SCENARIOS: Readonly<
  Record<BrowserPreviewScenarioId, BrowserPreviewScenario>
> = scenarios;

export const DEFAULT_BROWSER_PREVIEW_SCENARIO_ID: BrowserPreviewScenarioId =
  DEFAULT_WORKBENCH_SCENARIO_ID;

export function isBrowserPreviewScenarioId(value: string): value is BrowserPreviewScenarioId {
  return isWorkbenchScenarioId(value);
}

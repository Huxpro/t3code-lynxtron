import type { ReactNode } from "react";

import {
  isProjectGroupingEnabled,
  projectGroupingModeFromToggle,
} from "@t3tools/lynx-logic/settings";

import {
  GeneralSettingsLegacySection,
  GeneralSettingsSelect,
  GeneralSettingsSwitch,
  GeneralSettingsTextInput,
  GeneralSettingsValueButton,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./generalSettingsHost";
import { searchableSetting } from "./settingsSearch";

export type GeneralTimestampFormat = "locale" | "12-hour" | "24-hour";
export type GeneralThreadMode = "local" | "worktree";
export type GeneralProjectGroupingMode = "repository" | "repository_path" | "separate";

export interface GeneralSettingsValues {
  readonly addProjectBaseDirectory: string;
  readonly confirmThreadArchive: boolean;
  readonly confirmThreadDelete: boolean;
  readonly defaultThreadEnvMode: GeneralThreadMode;
  readonly diffIgnoreWhitespace: boolean;
  readonly enableLegacyTokenStreaming: boolean;
  readonly enableProviderUpdateChecks: boolean;
  readonly legacySidebarEnabled: boolean;
  readonly newWorktreesStartFromOrigin: boolean;
  readonly planModeEnabled: boolean;
  readonly sidebarAutoSettleAfterDays: number | null;
  readonly sidebarProjectGroupingMode: GeneralProjectGroupingMode;
  readonly timestampFormat: GeneralTimestampFormat;
}

export type GeneralSettingsPatch = Partial<GeneralSettingsValues>;

export interface GeneralSettingsContentProps {
  readonly aboutContent?: ReactNode;
  readonly backgroundActivityContent?: ReactNode;
  readonly defaults: GeneralSettingsValues;
  readonly diagnosticsControl?: ReactNode;
  readonly diagnosticsDescription: string;
  readonly errorContent?: ReactNode;
  readonly onProjectGroupingChange?: (enabled: boolean) => void;
  readonly onResetTextGenerationModel?: () => void;
  readonly onUpdate: (patch: GeneralSettingsPatch) => void;
  readonly serverControlsDisabled?: boolean;
  readonly textGenerationModelControl: ReactNode;
  readonly textGenerationModelDirty: boolean;
  readonly textGenerationModelStatus?: ReactNode;
  readonly textGenerationModelUnavailable?: boolean;
  readonly values: GeneralSettingsValues;
  readonly versionDescription?: string;
  readonly versionLabel: string;
}

const TIMESTAMP_OPTIONS = [
  { value: "locale", label: "System default" },
  { value: "12-hour", label: "12-hour" },
  { value: "24-hour", label: "24-hour" },
] as const;

const THREAD_MODE_OPTIONS = [
  { value: "local", label: "Local" },
  { value: "worktree", label: "New worktree" },
] as const;

export function GeneralSettingsContent({
  aboutContent,
  backgroundActivityContent,
  defaults,
  diagnosticsControl,
  diagnosticsDescription,
  errorContent,
  onProjectGroupingChange,
  onResetTextGenerationModel,
  onUpdate,
  serverControlsDisabled = false,
  textGenerationModelControl,
  textGenerationModelDirty,
  textGenerationModelStatus,
  textGenerationModelUnavailable = false,
  values,
  versionDescription = "Current version of the application.",
  versionLabel,
}: GeneralSettingsContentProps) {
  const updateProjectGrouping = (enabled: boolean) => {
    if (onProjectGroupingChange) {
      onProjectGroupingChange(enabled);
      return;
    }
    onUpdate({
      sidebarProjectGroupingMode: projectGroupingModeFromToggle(
        enabled,
        values.sidebarProjectGroupingMode,
      ),
    });
  };

  return (
    <SettingsPageContainer>
      {errorContent}
      <SettingsSection title="General">
        <SettingsRow
          {...searchableSetting("project-grouping")}
          description="Combine matching repositories across environments."
          resetAction={
            values.sidebarProjectGroupingMode !== defaults.sidebarProjectGroupingMode ? (
              <SettingResetButton
                label="project grouping"
                onClick={() =>
                  onUpdate({
                    sidebarProjectGroupingMode: defaults.sidebarProjectGroupingMode,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralSettingsSwitch
              checked={isProjectGroupingEnabled(values.sidebarProjectGroupingMode)}
              onCheckedChange={updateProjectGrouping}
              aria-label="Project Grouping"
            />
          }
        />

        <SettingsRow
          {...searchableSetting("auto-settle-inactive-threads")}
          description="Sidebar threads with no activity for this long settle automatically. Threads on merged or closed change requests always settle."
          resetAction={
            values.sidebarAutoSettleAfterDays !== defaults.sidebarAutoSettleAfterDays ? (
              <SettingResetButton
                label="auto-settle"
                onClick={() =>
                  onUpdate({
                    sidebarAutoSettleAfterDays: defaults.sidebarAutoSettleAfterDays,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralSettingsSwitch
              checked={values.sidebarAutoSettleAfterDays !== null}
              settingControl="auto-settle"
              onCheckedChange={(enabled) =>
                onUpdate({
                  sidebarAutoSettleAfterDays: enabled
                    ? (defaults.sidebarAutoSettleAfterDays ?? 3)
                    : null,
                })
              }
              aria-label="Auto-settle inactive threads"
            />
          }
        />

        {values.sidebarAutoSettleAfterDays !== null ? (
          <SettingsRow
            className="general-settings-row--nested"
            title="Days of inactivity before auto-settle"
            description="Any new activity un-settles a thread automatically."
            control={
              <GeneralSettingsTextInput
                ariaLabel="Days of inactivity before auto-settle"
                onCommit={(value) => {
                  const days = Number(value);
                  if (Number.isInteger(days) && days >= 1 && days <= 90) {
                    onUpdate({ sidebarAutoSettleAfterDays: days });
                  }
                }}
                value={String(values.sidebarAutoSettleAfterDays)}
              />
            }
          />
        ) : null}

        <SettingsRow
          {...searchableSetting("time-format")}
          description="System default follows your browser or OS clock preference."
          resetAction={
            values.timestampFormat !== defaults.timestampFormat ? (
              <SettingResetButton
                label="time format"
                onClick={() => onUpdate({ timestampFormat: defaults.timestampFormat })}
              />
            ) : null
          }
          control={
            <GeneralSettingsSelect
              ariaLabel="Timestamp format"
              onValueChange={(timestampFormat) => onUpdate({ timestampFormat })}
              options={TIMESTAMP_OPTIONS}
              value={values.timestampFormat}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("hide-whitespace-changes")}
          description="Set whether the diff panel ignores whitespace-only edits by default."
          resetAction={
            values.diffIgnoreWhitespace !== defaults.diffIgnoreWhitespace ? (
              <SettingResetButton
                label="diff whitespace changes"
                onClick={() =>
                  onUpdate({
                    diffIgnoreWhitespace: defaults.diffIgnoreWhitespace,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralSettingsSwitch
              checked={values.diffIgnoreWhitespace}
              onCheckedChange={(diffIgnoreWhitespace) => onUpdate({ diffIgnoreWhitespace })}
              aria-label="Hide whitespace changes by default"
            />
          }
        />

        <SettingsRow
          {...searchableSetting("provider-update-checks")}
          description="Check installed provider CLIs for newer available versions."
          resetAction={
            values.enableProviderUpdateChecks !== defaults.enableProviderUpdateChecks ? (
              <SettingResetButton
                label="provider update checks"
                onClick={() =>
                  onUpdate({
                    enableProviderUpdateChecks: defaults.enableProviderUpdateChecks,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralSettingsSwitch
              checked={values.enableProviderUpdateChecks}
              disabled={serverControlsDisabled}
              onCheckedChange={(enableProviderUpdateChecks) =>
                onUpdate({ enableProviderUpdateChecks })
              }
              aria-label="Check provider versions"
            />
          }
        />

        {backgroundActivityContent}

        <SettingsRow
          {...searchableSetting("new-threads")}
          description="Pick the default workspace mode for newly created draft threads."
          resetAction={
            values.defaultThreadEnvMode !== defaults.defaultThreadEnvMode ||
            values.newWorktreesStartFromOrigin !== defaults.newWorktreesStartFromOrigin ? (
              <SettingResetButton
                label="new threads"
                onClick={() =>
                  onUpdate({
                    defaultThreadEnvMode: defaults.defaultThreadEnvMode,
                    newWorktreesStartFromOrigin: defaults.newWorktreesStartFromOrigin,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralSettingsSelect
              ariaLabel="Default thread mode"
              onValueChange={(defaultThreadEnvMode) => onUpdate({ defaultThreadEnvMode })}
              options={THREAD_MODE_OPTIONS}
              value={values.defaultThreadEnvMode}
              width="wide"
            />
          }
        />

        {values.defaultThreadEnvMode === "worktree" ? (
          <SettingsRow
            className="general-settings-row--nested"
            title={searchableSetting("start-from-origin").title}
            description="Creates the worktree from the latest matching branch on origin instead of your local branch."
            resetAction={
              values.newWorktreesStartFromOrigin !== defaults.newWorktreesStartFromOrigin ? (
                <SettingResetButton
                  label="new worktrees start from origin"
                  onClick={() =>
                    onUpdate({
                      newWorktreesStartFromOrigin: defaults.newWorktreesStartFromOrigin,
                    })
                  }
                />
              ) : null
            }
            control={
              <GeneralSettingsSwitch
                checked={values.newWorktreesStartFromOrigin}
                disabled={serverControlsDisabled}
                onCheckedChange={(newWorktreesStartFromOrigin) =>
                  onUpdate({ newWorktreesStartFromOrigin })
                }
                aria-label="Start new worktrees from origin by default"
              />
            }
          />
        ) : null}

        <SettingsRow
          {...searchableSetting("add-project-starts-in")}
          description={'Leave empty to use "~/" when the Add Project browser opens.'}
          resetAction={
            values.addProjectBaseDirectory !== defaults.addProjectBaseDirectory ? (
              <SettingResetButton
                label="add project base directory"
                onClick={() =>
                  onUpdate({
                    addProjectBaseDirectory: defaults.addProjectBaseDirectory,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralSettingsTextInput
              ariaLabel="Add project base directory"
              onCommit={(addProjectBaseDirectory) => onUpdate({ addProjectBaseDirectory })}
              placeholder="~/"
              value={values.addProjectBaseDirectory}
            />
          }
        />

        <SettingsRow
          {...searchableSetting("archive-confirmation")}
          description="Require a second click on the inline archive action before a thread is archived."
          resetAction={
            values.confirmThreadArchive !== defaults.confirmThreadArchive ? (
              <SettingResetButton
                label="archive confirmation"
                onClick={() =>
                  onUpdate({
                    confirmThreadArchive: defaults.confirmThreadArchive,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralSettingsSwitch
              checked={values.confirmThreadArchive}
              onCheckedChange={(confirmThreadArchive) => onUpdate({ confirmThreadArchive })}
              aria-label="Confirm thread archiving"
            />
          }
        />

        <SettingsRow
          {...searchableSetting("delete-confirmation")}
          description="Ask before deleting a thread and its chat history."
          resetAction={
            values.confirmThreadDelete !== defaults.confirmThreadDelete ? (
              <SettingResetButton
                label="delete confirmation"
                onClick={() =>
                  onUpdate({
                    confirmThreadDelete: defaults.confirmThreadDelete,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralSettingsSwitch
              checked={values.confirmThreadDelete}
              onCheckedChange={(confirmThreadDelete) => onUpdate({ confirmThreadDelete })}
              aria-label="Confirm thread deletion"
            />
          }
        />

        <SettingsRow
          {...searchableSetting("text-generation-model")}
          description="Default model for generated text like thread titles and source control content. Source control settings can override it with a dedicated source control writer model."
          resetAction={
            textGenerationModelDirty && onResetTextGenerationModel ? (
              <SettingResetButton
                label="text generation model"
                onClick={onResetTextGenerationModel}
              />
            ) : null
          }
          status={textGenerationModelStatus}
          control={textGenerationModelControl}
          unavailable={textGenerationModelUnavailable}
        />
      </SettingsSection>

      <GeneralSettingsLegacySection>
        <SettingsRow
          {...searchableSetting("legacy-plan-mode")}
          description="Brings back the Build/Plan toggle in the composer along with the /plan and /default commands and the Shift+Tab shortcut. While off, every thread runs in build mode."
          control={
            <GeneralSettingsSwitch
              checked={values.planModeEnabled}
              settingControl="legacy-plan-mode"
              onCheckedChange={(planModeEnabled) => onUpdate({ planModeEnabled })}
              aria-label="Plan mode (legacy)"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("legacy-token-streaming")}
          description="Paints assistant output token by token instead of in complete chunks. Not recommended: it is significantly slower, and long responses become harder to follow. Kept only for compatibility with the old behavior."
          control={
            <GeneralSettingsSwitch
              checked={values.enableLegacyTokenStreaming}
              disabled={serverControlsDisabled}
              settingControl="legacy-token-streaming"
              onCheckedChange={(enableLegacyTokenStreaming) =>
                onUpdate({ enableLegacyTokenStreaming })
              }
              aria-label="Stream token by token (legacy)"
            />
          }
        />
        <SettingsRow
          {...searchableSetting("legacy-sidebar")}
          description="Brings back the original sidebar with per-project thread trees. The default sidebar shows one flat list: active work as rich cards, settled threads as compact rows."
          control={
            <GeneralSettingsSwitch
              checked={values.legacySidebarEnabled}
              settingControl="legacy-sidebar"
              onCheckedChange={(legacySidebarEnabled) => onUpdate({ legacySidebarEnabled })}
              aria-label="Sidebar (legacy)"
            />
          }
        />
      </GeneralSettingsLegacySection>

      <SettingsSection title="About">
        {aboutContent ?? (
          <SettingsRow title={`Version ${versionLabel}`} description={versionDescription} />
        )}
        <SettingsRow
          {...searchableSetting("diagnostics")}
          description={diagnosticsDescription}
          control={
            diagnosticsControl ?? (
              <GeneralSettingsValueButton ariaLabel="View diagnostics" label="View diagnostics" />
            )
          }
        />
      </SettingsSection>
    </SettingsPageContainer>
  );
}

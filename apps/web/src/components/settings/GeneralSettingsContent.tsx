import type { ReactNode } from "react";

import {
  MAX_GLASS_OPACITY,
  MIN_GLASS_OPACITY,
  isProjectGroupingEnabled,
  projectGroupingModeFromToggle,
} from "@t3tools/client-runtime/presentation/settings";

import {
  GeneralSettingsGlassOpacity,
  GeneralSettingsSelect,
  GeneralSettingsSwitch,
  GeneralSettingsTextInput,
  GeneralSettingsValueButton,
  SettingResetButton,
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "./generalSettingsHost";

export type GeneralThemePreference = "system" | "light" | "dark";
export type GeneralTimestampFormat = "locale" | "12-hour" | "24-hour";
export type GeneralThreadMode = "local" | "worktree";
export type GeneralProjectGroupingMode = "repository" | "repository_path" | "separate";

export interface GeneralSettingsValues {
  readonly addProjectBaseDirectory: string;
  readonly autoOpenPlanSidebar: boolean;
  readonly confirmThreadArchive: boolean;
  readonly confirmThreadDelete: boolean;
  readonly defaultThreadEnvMode: GeneralThreadMode;
  readonly diffIgnoreWhitespace: boolean;
  readonly enableAssistantStreaming: boolean;
  readonly enableProviderUpdateChecks: boolean;
  readonly glassOpacity: number;
  readonly newWorktreesStartFromOrigin: boolean;
  readonly sidebarProjectGroupingMode: GeneralProjectGroupingMode;
  readonly timestampFormat: GeneralTimestampFormat;
  readonly wordWrap: boolean;
}

export type GeneralSettingsPatch = Partial<GeneralSettingsValues>;

export interface GeneralSettingsContentProps {
  readonly aboutVersionControl?: ReactNode;
  readonly defaults: GeneralSettingsValues;
  readonly diagnosticsControl?: ReactNode;
  readonly diagnosticsDescription: string;
  readonly errorContent?: ReactNode;
  readonly onProjectGroupingChange?: (enabled: boolean) => void;
  readonly onResetTextGenerationModel?: () => void;
  readonly onThemeChange: (value: GeneralThemePreference) => void;
  readonly onUpdate: (patch: GeneralSettingsPatch) => void;
  readonly serverControlsDisabled?: boolean;
  readonly textGenerationModelControl: ReactNode;
  readonly textGenerationModelDirty: boolean;
  readonly theme: GeneralThemePreference;
  readonly values: GeneralSettingsValues;
  readonly versionDescription?: string;
  readonly versionLabel: string;
}

const THEME_OPTIONS = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
] as const;

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
  aboutVersionControl,
  defaults,
  diagnosticsControl,
  diagnosticsDescription,
  errorContent,
  onProjectGroupingChange,
  onResetTextGenerationModel,
  onThemeChange,
  onUpdate,
  serverControlsDisabled = false,
  textGenerationModelControl,
  textGenerationModelDirty,
  theme,
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
          title="Theme"
          description="Choose how T3 Code looks across the app."
          resetAction={
            theme !== "system" ? (
              <SettingResetButton label="theme" onClick={() => onThemeChange("system")} />
            ) : null
          }
          control={
            <GeneralSettingsSelect
              ariaLabel="Theme preference"
              onValueChange={onThemeChange}
              options={THEME_OPTIONS}
              value={theme}
            />
          }
        />

        <SettingsRow
          title="Glass opacity"
          description="Control how transparent glass surfaces are. Higher values make menus, dialogs, and the composer more solid."
          resetAction={
            values.glassOpacity !== defaults.glassOpacity ? (
              <SettingResetButton
                label="glass opacity"
                onClick={() => onUpdate({ glassOpacity: defaults.glassOpacity })}
              />
            ) : null
          }
          control={
            <GeneralSettingsGlassOpacity
              max={MAX_GLASS_OPACITY}
              min={MIN_GLASS_OPACITY}
              onValueChange={(glassOpacity) => onUpdate({ glassOpacity })}
              value={values.glassOpacity}
            />
          }
        />

        <SettingsRow
          title="Project Grouping"
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
          title="Time format"
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
          title="Word wrap"
          description="Wrap long lines in code blocks, tables, diffs, and file previews by default."
          resetAction={
            values.wordWrap !== defaults.wordWrap ? (
              <SettingResetButton
                label="word wrapping"
                onClick={() => onUpdate({ wordWrap: defaults.wordWrap })}
              />
            ) : null
          }
          control={
            <GeneralSettingsSwitch
              checked={values.wordWrap}
              onCheckedChange={(wordWrap) => onUpdate({ wordWrap })}
              aria-label="Wrap code, tables, diffs, and file previews by default"
            />
          }
        />

        <SettingsRow
          title="Hide whitespace changes"
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
          title="Assistant output"
          description="Show token-by-token output while a response is in progress."
          resetAction={
            values.enableAssistantStreaming !== defaults.enableAssistantStreaming ? (
              <SettingResetButton
                label="assistant output"
                onClick={() =>
                  onUpdate({
                    enableAssistantStreaming: defaults.enableAssistantStreaming,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralSettingsSwitch
              checked={values.enableAssistantStreaming}
              disabled={serverControlsDisabled}
              onCheckedChange={(enableAssistantStreaming) => onUpdate({ enableAssistantStreaming })}
              aria-label="Stream assistant messages"
            />
          }
        />

        <SettingsRow
          title="Provider update checks"
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

        <SettingsRow
          title="Auto-open task panel"
          description="Open the right-side plan and task panel automatically when steps appear."
          resetAction={
            values.autoOpenPlanSidebar !== defaults.autoOpenPlanSidebar ? (
              <SettingResetButton
                label="auto-open task panel"
                onClick={() =>
                  onUpdate({
                    autoOpenPlanSidebar: defaults.autoOpenPlanSidebar,
                  })
                }
              />
            ) : null
          }
          control={
            <GeneralSettingsSwitch
              checked={values.autoOpenPlanSidebar}
              onCheckedChange={(autoOpenPlanSidebar) => onUpdate({ autoOpenPlanSidebar })}
              aria-label="Open the task panel automatically"
            />
          }
        />

        <SettingsRow
          title="New threads"
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
            title="Start from origin"
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
          title="Add project starts in"
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
          title="Archive confirmation"
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
          title="Delete confirmation"
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
          title="Text generation model"
          description="Configure the model used for generated commit messages, PR titles, and similar Git text."
          resetAction={
            textGenerationModelDirty && onResetTextGenerationModel ? (
              <SettingResetButton
                label="text generation model"
                onClick={onResetTextGenerationModel}
              />
            ) : null
          }
          control={textGenerationModelControl}
        />
      </SettingsSection>

      <SettingsSection title="About">
        <SettingsRow
          title={`Version ${versionLabel}`}
          description={versionDescription}
          control={aboutVersionControl}
        />
        <SettingsRow
          title="Diagnostics"
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

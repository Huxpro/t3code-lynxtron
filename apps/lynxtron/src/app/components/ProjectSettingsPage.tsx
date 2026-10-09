import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "@lynx-js/react";
import type { ProjectScriptIcon, T3ProjectFileScript } from "@t3tools/contracts";

import {
  deriveProjectGroupingOverrideKey,
  type ProjectGroupingSettings,
} from "../../../../web/src/logicalProject";
import { useClientSettings, useUpdateClientSettings } from "../../../../web/src/hooks/useSettings";
import { useViewportSnapshot } from "../../../../web/src/hooks/useViewportSnapshot";
import { shortcutLabelForCommand } from "../../../../web/src/keybindings";
import { commandForProjectScript } from "../../../../web/src/projectScripts";
import {
  buildSidebarProjectSnapshots,
  type SidebarProjectGroupMember,
  type SidebarProjectSnapshot,
} from "../../../../web/src/sidebarProjectGrouping";
import { usePrimaryEnvironmentId } from "../../../../web/src/state/environments";
import { useProjects, useThreadShells } from "../../../../web/src/state/entities";
import {
  EMPTY_PROJECT_SCRIPT_INPUT,
  editorRequestForScript,
  type ProjectScriptEditorRequest,
} from "../../../../web/src/components/projectScriptEditor.logic";
import {
  countThreadsByProjectMember,
  findProjectGroupKey,
  importableProjectFileScripts,
  isProjectGroupingSelection,
  nextProjectGroupingOverrides,
  nextProjectScriptsForSubmit,
  PROJECT_GROUPING_SELECTIONS,
  projectCheckoutLabel,
  projectFileScriptInput,
  projectGroupingOptionLabel,
  projectGroupingTriggerLabel,
  projectMemberKey,
  projectRemovalConfirmationLines,
  projectRemovalRowCopy,
  projectSettingsUnavailableMessage,
  projectThreadCountLabel,
  resolveProjectRename,
  resolveRegroupedProjectKey,
  sortProjectSettingsGroups,
  type ProjectGroupingSelection,
} from "../../../../web/src/components/settings/ProjectSettingsPanel.logic";
import {
  SettingsPageContainer,
  SettingsRow,
  SettingsSection,
} from "../../../../web/src/components/settings/settingsLayout";
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from "../../../../web/src/components/ui/select";
import { Button } from "../../../../web/src/components/ui/button";
import { useNativeInputValue } from "../hooks/useNativeInputValue";
import { stackedThreadToast, toastManager } from "../../../../web/src/components/ui/toast";
import { useT3ProjectFileState } from "../hooks/useT3ProjectFileScripts";
import { clientCapabilities } from "../platform/clientCapabilities";
import { showNativeConfirm, showNativeContextMenu } from "../platform/clientCapabilities.lynx";
import { projectSettingsPath } from "../projectSettingsRoute";
import { navigate } from "../router";
import { t3ClientActions, useT3ClientState } from "../state/t3Client";
import { Icon } from "./Icon";
import {
  persistProjectScripts,
  ProjectActionDialog,
  projectScriptIconName,
} from "./ProjectActionDialog";
import { SmallButton, SmallIconButton } from "./SettingsControls";

const TOPBAR_HEIGHT = 52;

function selectProjectGroupingSettings(settings: ProjectGroupingSettings): ProjectGroupingSettings {
  return {
    sidebarProjectGroupingMode: settings.sidebarProjectGroupingMode,
    sidebarProjectGroupingOverrides: settings.sidebarProjectGroupingOverrides,
  };
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "An error occurred.";
}

function reportFailure(title: string, cause: unknown): void {
  toastManager.add(stackedThreadToast({ type: "error", title, description: errorMessage(cause) }));
}

/** Logical project groups for the settings page, sorted by display name. */
export function useProjectSettingsGroups(): SidebarProjectSnapshot[] {
  const projects = useProjects();
  const settings = useClientSettings(selectProjectGroupingSettings);
  const primaryEnvironmentId = usePrimaryEnvironmentId();
  const { serverConfig } = useT3ClientState();
  const environmentLabel = serverConfig?.environment.label ?? null;
  return useMemo(
    () =>
      sortProjectSettingsGroups(
        buildSidebarProjectSnapshots({
          projects: [...projects],
          settings,
          primaryEnvironmentId,
          resolveEnvironmentLabel: () => environmentLabel,
        }),
      ),
    [environmentLabel, primaryEnvironmentId, projects, settings],
  );
}

/** Opens the settings page of the project group that holds `project`. */
export function useOpenProjectSettings(): (project: {
  readonly environmentId: string;
  readonly id: string;
}) => void {
  const groups = useProjectSettingsGroups();
  return useCallback(
    (project) => {
      const projectKey = findProjectGroupKey(groups, project);
      if (projectKey) navigate(projectSettingsPath(projectKey));
    },
    [groups],
  );
}

/**
 * Lynx host of Web's `/projects/$projectKey` page: the breadcrumb header plus
 * the project's settings, rendered beside the main sidebar.
 */
export function ProjectSettingsPage({ projectKey }: { readonly projectKey: string }) {
  const groups = useProjectSettingsGroups();
  const selected = groups.find((group) => group.projectKey === projectKey) ?? null;

  // Remember the members of the last rendered group so a grouping-rule change
  // (which changes the group key) can follow the project to its new group.
  const lastSelectionRef = useRef<{ key: string; memberKeys: string[] } | null>(null);
  useEffect(() => {
    if (!selected) return;
    lastSelectionRef.current = {
      key: selected.projectKey,
      memberKeys: selected.memberProjects.map((member) => member.physicalProjectKey),
    };
  }, [selected]);
  useEffect(() => {
    const successorKey = resolveRegroupedProjectKey({
      groups,
      projectKey,
      last: lastSelectionRef.current,
    });
    if (successorKey) navigate(projectSettingsPath(successorKey), { replace: true });
  }, [groups, projectKey]);

  const openProjectMenu = useCallback(() => {
    void showNativeContextMenu(
      groups.map((group) => ({ id: group.projectKey, label: group.displayName })),
    )
      .then((clicked) => {
        if (clicked) navigate(projectSettingsPath(clicked), { replace: true });
      })
      .catch(() => undefined);
  }, [groups]);

  return (
    <view className="settings-main project-settings-page" data-project-settings-page={projectKey}>
      <view className="settings-topbar project-settings-topbar lynx-titlebar-drag-region">
        <text className="project-settings-topbar__crumb">Projects</text>
        <Icon
          name="chevron-right"
          size={14}
          color="#818181"
          className="project-settings-topbar__separator"
        />
        {selected ? (
          <view
            className="project-settings-topbar__switch lynx-titlebar-no-drag"
            aria-label="Switch project"
            bindtap={openProjectMenu}
          >
            <text className="project-settings-topbar__title" text-maxline="1">
              {selected.displayName}
            </text>
            <Icon name="chevron-down" size={14} color="#818181" />
          </view>
        ) : (
          <text className="project-settings-topbar__title project-settings-topbar__title--muted">
            Unavailable project
          </text>
        )}
      </view>
      {selected ? (
        <ProjectDetail key={selected.projectKey} group={selected} />
      ) : (
        <ProjectSettingsScroll>
          <text className="project-settings-empty">
            {projectSettingsUnavailableMessage(groups.length)}
          </text>
        </ProjectSettingsScroll>
      )}
    </view>
  );
}

function ProjectSettingsScroll({ children }: { readonly children: ReactNode }) {
  const viewport = useViewportSnapshot();
  return (
    <scroll-view
      scroll-y
      scroll-orientation="vertical"
      style={{ height: `${Math.max(0, viewport.height - TOPBAR_HEIGHT)}px` }}
      className="settings-scroll project-settings-scroll"
    >
      <view flatten={false} className="settings-content project-settings-content">
        {children}
      </view>
    </scroll-view>
  );
}

// Group-shared fields live on each physical project record, so a group-level
// edit fans out to every member. Names the environment a partial fan-out
// stopped on.
async function renameAllMembers(group: SidebarProjectSnapshot, title: string): Promise<void> {
  for (const member of group.memberProjects) {
    try {
      await t3ClientActions.updateProject(member.id, title);
    } catch (cause) {
      reportFailure(
        group.memberProjects.length > 1
          ? `Failed to rename project on ${member.environmentLabel ?? "the current environment"}`
          : "Failed to rename project",
        cause,
      );
      throw cause;
    }
  }
}

function ProjectNameField({ group }: { readonly group: SidebarProjectSnapshot }) {
  const viewport = useViewportSnapshot();
  const [draft, setDraft] = useState(group.displayName);
  const [committing, setCommitting] = useState(false);
  const committingRef = useRef(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  // Blur, Enter, the tap-outside layer, and leaving the page can all commit;
  // the ref keeps one rename in flight.
  const commit = useCallback(() => {
    if (committingRef.current) return;
    const rename = resolveProjectRename(draftRef.current, group);
    if (rename.kind === "empty") {
      toastManager.add({ type: "warning", title: "Project title cannot be empty" });
      setDraft(group.displayName);
      return;
    }
    if (rename.kind === "unchanged") {
      setDraft(group.displayName);
      return;
    }
    committingRef.current = true;
    setCommitting(true);
    // Success re-keys this field on the new display name; failure restores it.
    void renameAllMembers(group, rename.title).catch(() => {
      committingRef.current = false;
      setDraft(group.displayName);
      setCommitting(false);
    });
  }, [group]);

  // Leaving the page commits a pending edit, as a blur does on Web.
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(
    () => () => {
      if (draftRef.current !== group.displayName) commitRef.current();
    },
    [group.displayName],
  );

  useEffect(() => {
    if (!viewport.testResize) return;
    const target = globalThis as {
      __T3_LYNXTRON_PROJECT_SETTINGS_NAME_FIXTURE__?: (value: string) => boolean;
    };
    const fixture = (value: string) => {
      setDraft(value);
      return true;
    };
    target.__T3_LYNXTRON_PROJECT_SETTINGS_NAME_FIXTURE__ = fixture;
    return () => {
      if (target.__T3_LYNXTRON_PROJECT_SETTINGS_NAME_FIXTURE__ === fixture) {
        delete target.__T3_LYNXTRON_PROJECT_SETTINGS_NAME_FIXTURE__;
      }
    };
  }, [viewport.testResize]);

  const native = useNativeInputValue(draft);
  const dirty = !committing && draft !== group.displayName;
  return (
    <>
      {/* Lynx inputs keep focus when the user taps elsewhere, so a transparent
          layer commits the edit, like a blur on Web. */}
      {dirty ? <view className="project-settings-name-dismiss" bindtap={commit} /> : null}
      <input
        ref={native.ref}
        className="project-settings-name-input"
        aria-label="Project name"
        bindinput={(event: { detail?: { value?: unknown } }) => {
          if (typeof event.detail?.value !== "string") return;
          native.noteInput(event.detail.value);
          setDraft(event.detail.value);
        }}
        bindconfirm={commit}
        bindblur={commit}
      />
    </>
  );
}

function ScriptIconView({ icon }: { readonly icon: ProjectScriptIcon }) {
  return (
    <Icon
      name={projectScriptIconName(icon)}
      size={16}
      color="#818181"
      className="project-settings-script__icon"
    />
  );
}

function ProjectDetail({ group }: { readonly group: SidebarProjectSnapshot }) {
  const { serverConfig } = useT3ClientState();
  const threads = useThreadShells();
  const projectGroupingSettings = useClientSettings(selectProjectGroupingSettings);
  const updateClientSettings = useUpdateClientSettings();
  const keybindings = serverConfig?.keybindings ?? [];

  const representative =
    group.memberProjects.find(
      (member) => member.environmentId === group.environmentId && member.id === group.id,
    ) ?? group.memberProjects[0]!;
  const threadCountByMember = useMemo(() => countThreadsByProjectMember(threads), [threads]);

  // ----- checkout selection and scripts -----
  const [selectedCheckoutKey, setSelectedCheckoutKey] = useState(representative.physicalProjectKey);
  const selectedCheckout =
    group.memberProjects.find((member) => member.physicalProjectKey === selectedCheckoutKey) ??
    representative;
  const scripts = selectedCheckout.scripts;
  const t3File = useT3ProjectFileState(selectedCheckout.workspaceRoot);
  const importableScripts = useMemo(
    () => importableProjectFileScripts(scripts, t3File.scripts),
    [scripts, t3File.scripts],
  );
  const [editorRequest, setEditorRequest] = useState<ProjectScriptEditorRequest | null>(null);
  // Script writes replace the whole array, so two overlapping writes computed
  // from the same snapshot would drop each other's changes. One at a time.
  const [isSavingScripts, setIsSavingScripts] = useState(false);

  const importFileScript = useCallback(
    (fileScript: T3ProjectFileScript) => {
      if (isSavingScripts) return;
      const payload = projectFileScriptInput(fileScript);
      const next = nextProjectScriptsForSubmit(scripts, null, payload);
      setIsSavingScripts(true);
      void persistProjectScripts({
        projectId: selectedCheckout.id,
        scripts: next.scripts,
        keybinding: payload.keybinding,
        command: commandForProjectScript(next.scriptId),
        keybindings,
      })
        .catch((cause) =>
          setEditorRequest({
            scriptId: null,
            initial: payload,
            error: cause instanceof Error ? cause.message : "Failed to import action.",
          }),
        )
        .finally(() => setIsSavingScripts(false));
    },
    [isSavingScripts, keybindings, scripts, selectedCheckout.id],
  );
  const openImportMenu = useCallback(() => {
    void showNativeContextMenu(
      importableScripts.map((fileScript, index) => ({
        id: String(index),
        label: `${fileScript.name} · ${fileScript.command}`,
      })),
    )
      .then((clicked) => {
        const fileScript = clicked === null ? undefined : importableScripts[Number(clicked)];
        if (fileScript) importFileScript(fileScript);
      })
      .catch(() => undefined);
  }, [importFileScript, importableScripts]);

  // ----- checkouts -----
  const updateGroupingPreference = useCallback(
    (member: SidebarProjectGroupMember, selection: ProjectGroupingSelection) => {
      updateClientSettings({
        sidebarProjectGroupingOverrides: nextProjectGroupingOverrides(
          projectGroupingSettings.sidebarProjectGroupingOverrides,
          deriveProjectGroupingOverrideKey(member),
          selection,
        ),
      });
    },
    [projectGroupingSettings.sidebarProjectGroupingOverrides, updateClientSettings],
  );

  const removeMembers = useCallback(
    async (members: ReadonlyArray<SidebarProjectGroupMember>) => {
      const memberKeys = new Set(members.map(projectMemberKey));
      const threadCount = threads.filter((thread) =>
        memberKeys.has(
          projectMemberKey({ environmentId: thread.environmentId, id: thread.projectId }),
        ),
      ).length;
      const [message = "", ...detail] = projectRemovalConfirmationLines({
        groupDisplayName: group.displayName,
        groupMemberCount: group.memberProjects.length,
        members,
        threadCount,
      });
      const confirmed = await showNativeConfirm({
        message,
        detail: detail.join("\n"),
        confirmLabel:
          members.length === group.memberProjects.length
            ? projectRemovalRowCopy(members.length).actionLabel
            : "Remove checkout",
      }).catch(() => false);
      if (!confirmed) return;
      for (const member of members) {
        const memberThreadCount = threadCountByMember.get(projectMemberKey(member)) ?? 0;
        try {
          await t3ClientActions.deleteProject(member.id, memberThreadCount > 0);
        } catch (cause) {
          reportFailure(`Failed to remove "${member.title}"`, cause);
          return;
        }
        t3ClientActions.discardProjectDraft(member.id);
      }
      // The project's settings page just deleted itself; there is no projects
      // listing to fall back to, so leave for the chat.
      if (members.length === group.memberProjects.length) navigate("/", { replace: true });
    },
    [group.displayName, group.memberProjects.length, threadCountByMember, threads],
  );

  const selectedCheckoutThreadCount =
    threadCountByMember.get(projectMemberKey(selectedCheckout)) ?? 0;
  const selectedCheckoutGrouping: ProjectGroupingSelection =
    projectGroupingSettings.sidebarProjectGroupingOverrides?.[
      deriveProjectGroupingOverrideKey(selectedCheckout)
    ] ?? "inherit";
  const selectedCheckoutLabel = projectCheckoutLabel(selectedCheckout);
  const removalCopy = projectRemovalRowCopy(group.memberProjects.length);

  return (
    <>
      <ProjectSettingsScroll>
        <SettingsPageContainer className="project-settings-panel">
          <SettingsSection title="Project">
            <SettingsRow
              className="project-settings-name-row"
              title="Name"
              description="The shared name for this project group in the sidebar and thread lists."
              control={
                <ProjectNameField key={`${group.projectKey}:${group.displayName}`} group={group} />
              }
            />
          </SettingsSection>

          <SettingsSection
            title="Checkout"
            headerAction={
              group.memberProjects.length > 1 ? (
                <Select
                  value={selectedCheckout.physicalProjectKey}
                  onValueChange={(value) => setSelectedCheckoutKey(value)}
                >
                  <SelectTrigger aria-label="Selected checkout">
                    <SelectValue>{selectedCheckoutLabel}</SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {group.memberProjects.map((member) => (
                      <SelectItem key={member.physicalProjectKey} value={member.physicalProjectKey}>
                        {`${projectCheckoutLabel(member)} · ${member.workspaceRoot}`}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              ) : undefined
            }
          >
            <view className="project-settings-checkout">
              <view
                className="project-settings-checkout__path"
                aria-label="Copy checkout path"
                bindtap={() => {
                  void clientCapabilities.clipboard
                    .writeText(selectedCheckout.workspaceRoot)
                    .then(() =>
                      toastManager.add({
                        type: "success",
                        title: "Path copied",
                        description: selectedCheckout.workspaceRoot,
                      }),
                    )
                    .catch((cause: unknown) => reportFailure("Failed to copy path", cause));
                }}
              >
                <text className="project-settings-checkout__path-label" text-maxline="1">
                  {selectedCheckout.workspaceRoot}
                </text>
                <Icon name="copy" size={16} color="#818181" />
              </view>
              <text className="project-settings-checkout__threads">
                {projectThreadCountLabel(selectedCheckoutThreadCount)}
              </text>
            </view>
            <SettingsRow
              title="Project grouping"
              description="How this checkout joins project groups in the sidebar. Changing it can move you to a different project group."
              control={
                <Select
                  value={selectedCheckoutGrouping}
                  onValueChange={(value) => {
                    if (isProjectGroupingSelection(value)) {
                      updateGroupingPreference(selectedCheckout, value);
                    }
                  }}
                >
                  <SelectTrigger aria-label={`Grouping rule for ${selectedCheckoutLabel}`}>
                    <SelectValue>
                      {projectGroupingTriggerLabel(
                        selectedCheckoutGrouping,
                        projectGroupingSettings.sidebarProjectGroupingMode,
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectPopup>
                    {PROJECT_GROUPING_SELECTIONS.map((selection) => (
                      <SelectItem key={selection} value={selection}>
                        {projectGroupingOptionLabel(selection)}
                      </SelectItem>
                    ))}
                  </SelectPopup>
                </Select>
              }
            />
            {group.memberProjects.length > 1 ? (
              <SettingsRow
                title="Remove checkout"
                description="Removes this checkout and its threads from the project group. Files on disk are not touched."
                control={
                  <SmallButton
                    label="Remove checkout"
                    variant="destructive-outline"
                    icon={<Icon name="trash-2" size={14} color="#f87171" />}
                    onTap={() => void removeMembers([selectedCheckout])}
                  />
                }
              />
            ) : null}
            <view className="project-settings-actions-header">
              <view className="project-settings-actions-header__text">
                <text className="project-settings-actions-header__title">Actions</text>
                <text className="project-settings-actions-header__description">
                  {`Saved and run only in ${selectedCheckoutLabel}.`}
                </text>
              </view>
              <view className="project-settings-actions-header__buttons">
                {importableScripts.length > 0 ? (
                  <Button
                    className="project-settings-import-scripts"
                    disabled={isSavingScripts}
                    onClick={openImportMenu}
                    size="xs"
                    variant="ghost"
                  >
                    Import scripts
                    <Icon name="chevron-down" size={14} color="#818181" />
                  </Button>
                ) : null}
                <SmallButton
                  className="project-settings-add-action"
                  label="Add action"
                  disabled={isSavingScripts}
                  icon={<Icon name="plus" size={14} color="#818181" />}
                  onTap={() =>
                    setEditorRequest({ scriptId: null, initial: EMPTY_PROJECT_SCRIPT_INPUT })
                  }
                />
              </view>
            </view>
            {scripts.length === 0 ? (
              <text className="project-settings-actions-empty">
                No actions configured for this checkout.
              </text>
            ) : (
              scripts.map((script) => {
                const shortcutLabel = shortcutLabelForCommand(
                  keybindings,
                  commandForProjectScript(script.id),
                  "MacIntel",
                );
                return (
                  <view
                    key={script.id}
                    className="project-settings-script"
                    data-project-settings-script={script.id}
                  >
                    <ScriptIconView icon={script.icon} />
                    <text className="project-settings-script__name" text-maxline="1">
                      {script.name}
                    </text>
                    <text className="project-settings-script__command" text-maxline="1">
                      {script.command}
                    </text>
                    {script.runOnWorktreeCreate ? (
                      <text className="project-settings-script__badge">setup</text>
                    ) : null}
                    {script.previewUrl ? (
                      <text className="project-settings-script__badge">preview · desktop only</text>
                    ) : null}
                    {shortcutLabel ? (
                      <text className="project-settings-script__shortcut">{shortcutLabel}</text>
                    ) : null}
                    <SmallIconButton
                      className="project-settings-script__edit"
                      label={`Edit ${script.name}`}
                      disabled={isSavingScripts}
                      icon={<Icon name="settings" size={14} color="#818181" />}
                      onTap={() => setEditorRequest(editorRequestForScript(script, keybindings))}
                    />
                  </view>
                );
              })
            )}
            {t3File.status === "invalid" ? (
              <SettingsRow
                className="project-settings-t3-invalid"
                title="t3.json is invalid"
                description="A t3.json exists in this checkout but fails to parse, so every action and icon it declares is ignored. Check the JSON syntax and icon values."
              />
            ) : null}
          </SettingsSection>

          <SettingsSection title="Danger">
            <SettingsRow
              title={removalCopy.title}
              description={removalCopy.description}
              control={
                <SmallButton
                  className="project-settings-remove-project"
                  label={removalCopy.actionLabel}
                  variant="destructive-outline"
                  icon={<Icon name="trash-2" size={14} color="#f87171" />}
                  onTap={() => void removeMembers(group.memberProjects)}
                />
              }
            />
          </SettingsSection>
        </SettingsPageContainer>
      </ProjectSettingsScroll>

      {/* Outside the scroll view so the fixed dialog covers the window. */}
      {editorRequest ? (
        <ProjectActionDialog
          project={selectedCheckout}
          request={editorRequest}
          onClose={() => setEditorRequest(null)}
        />
      ) : null}
    </>
  );
}

import { useCallback, useState } from "@lynx-js/react";
import type { SidebarProjectGroupingMode } from "@t3tools/contracts";

import type { SidebarProjectSettingsMember } from "../../../../web/src/components/sidebar/SidebarProjectListHost.types";
import { deriveProjectGroupingOverrideKey } from "../../../../web/src/logicalProject";
import { useClientSettings, useUpdateClientSettings } from "../../../../web/src/hooks/useSettings";
import { t3ClientActions } from "../state/t3Client";
import { Icon } from "./Icon";

const GROUPING_OPTIONS: ReadonlyArray<{
  readonly value: SidebarProjectGroupingMode | "inherit";
  readonly label: string;
}> = [
  { value: "inherit", label: "Use global default" },
  { value: "repository", label: "Group by repository" },
  { value: "repository_path", label: "Group by repository and path" },
  { value: "separate", label: "Keep projects separate" },
];

const GROUPING_LABELS: Record<SidebarProjectGroupingMode, string> = {
  repository: "Group by repository",
  repository_path: "Group by repository and path",
  separate: "Keep projects separate",
};

function groupingLabel(
  value: SidebarProjectGroupingMode | "inherit",
  defaultMode: SidebarProjectGroupingMode,
): string {
  return value === "inherit" ? `Default (${GROUPING_LABELS[defaultMode]})` : GROUPING_LABELS[value];
}

function stopPropagation(event: { stopPropagation?: () => void }): void {
  event.stopPropagation?.();
}

export function ProjectSettingsDialog({
  members,
  onClose,
}: {
  readonly members: readonly SidebarProjectSettingsMember[];
  readonly onClose: () => void;
}) {
  const settings = useClientSettings((value) => ({
    sidebarProjectGroupingMode: value.sidebarProjectGroupingMode,
    sidebarProjectGroupingOverrides: value.sidebarProjectGroupingOverrides as Record<
      string,
      SidebarProjectGroupingMode
    >,
  }));
  const updateSettings = useUpdateClientSettings();
  const [nameDrafts, setNameDrafts] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((member) => [member.id, member.title])),
  );
  const [groupingMenuProjectId, setGroupingMenuProjectId] = useState<string | null>(null);
  const [confirmingRemoveProjectId, setConfirmingRemoveProjectId] = useState<string | null>(null);
  const [pendingProjectId, setPendingProjectId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const singleMember = members.length === 1 ? (members[0] ?? null) : null;

  const commitName = useCallback(
    (member: SidebarProjectSettingsMember) => {
      const title = nameDrafts[member.id]?.trim() ?? "";
      if (!title) {
        setNameDrafts((current) => ({ ...current, [member.id]: member.title }));
        setError("Project name cannot be empty.");
        return;
      }
      if (title === member.title) return;
      setPendingProjectId(member.id);
      setError(null);
      void t3ClientActions
        .updateProject(member.id, title)
        .catch((cause) => {
          setNameDrafts((current) => ({ ...current, [member.id]: member.title }));
          setError(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => setPendingProjectId(null));
    },
    [nameDrafts],
  );

  const selectGrouping = useCallback(
    (member: SidebarProjectSettingsMember, selection: SidebarProjectGroupingMode | "inherit") => {
      const key = deriveProjectGroupingOverrideKey(member);
      const nextOverrides = { ...settings.sidebarProjectGroupingOverrides };
      if (selection === "inherit") delete nextOverrides[key];
      else nextOverrides[key] = selection;
      updateSettings({ sidebarProjectGroupingOverrides: nextOverrides });
      setGroupingMenuProjectId(null);
    },
    [settings.sidebarProjectGroupingOverrides, updateSettings],
  );

  const removeProject = useCallback(
    (member: SidebarProjectSettingsMember) => {
      setPendingProjectId(member.id);
      setError(null);
      void t3ClientActions
        .deleteProject(member.id, true)
        .then(() => {
          setConfirmingRemoveProjectId(null);
          onClose();
        })
        .catch((cause) => {
          setError(cause instanceof Error ? cause.message : String(cause));
        })
        .finally(() => setPendingProjectId(null));
    },
    [onClose],
  );

  return (
    <>
      <view className="project-settings-overlay" bindtap={onClose} />
      <view
        className="project-settings-dialog flex flex-col"
        aria-label="Project settings"
        data-project-settings-dialog="true"
        bindtap={stopPropagation}
      >
        <view className="project-settings-dialog__close" aria-label="Close" bindtap={onClose}>
          <Icon name="x" size={16} color="#818181" />
        </view>
        <view className="project-settings-dialog__header flex flex-col">
          <text className="project-settings-dialog__title">Project settings</text>
          <text className="project-settings-dialog__description">
            Manage project names, grouping rules, and environments.
          </text>
          {members.map((member) => (
            <view
              key={`summary:${member.id}`}
              className="project-settings-dialog__summary flex flex-row"
            >
              <Icon name="folder" size={13} color="#818181" />
              <text className="project-settings-path" text-maxline="1">
                {member.workspaceRoot}
              </text>
              <text className="project-settings-environment">
                {member.environmentLabel ?? "Current environment"}
              </text>
            </view>
          ))}
        </view>
        <scroll-view className="project-settings-dialog__body" scroll-orientation="vertical">
          {members.map((member) => {
            const overrideKey = deriveProjectGroupingOverrideKey(member);
            const selection =
              settings.sidebarProjectGroupingOverrides[overrideKey] ?? ("inherit" as const);
            const pending = pendingProjectId === member.id;
            const confirmingRemove = confirmingRemoveProjectId === member.id;
            return (
              <view key={member.id} className="project-settings-member flex flex-col">
                <view className="project-settings-fields flex flex-row">
                  <view className="project-settings-field flex flex-col">
                    <text className="project-settings-field__label">Project name</text>
                    <input
                      className="project-settings-name-input"
                      aria-label={`Project name in ${member.environmentLabel ?? "current environment"}`}
                      {...({ value: nameDrafts[member.id] ?? member.title } as object)}
                      bindinput={(event: { detail?: { value?: unknown } }) => {
                        if (typeof event.detail?.value !== "string") return;
                        setNameDrafts((current) => ({
                          ...current,
                          [member.id]: event.detail?.value as string,
                        }));
                      }}
                      bindblur={() => commitName(member)}
                      bindconfirm={() => commitName(member)}
                    />
                  </view>
                  <view className="project-settings-field">
                    <text className="project-settings-field__label">Grouping rule</text>
                    <view
                      className="project-settings-grouping-trigger flex flex-row"
                      aria-label={`Grouping rule for ${member.environmentLabel ?? "current environment"}`}
                      bindtap={() =>
                        setGroupingMenuProjectId((current) =>
                          current === member.id ? null : member.id,
                        )
                      }
                    >
                      <text className="project-settings-grouping-trigger__label" text-maxline="1">
                        {groupingLabel(selection, settings.sidebarProjectGroupingMode)}
                      </text>
                      <Icon name="chevron-down" size={14} color="#818181" />
                    </view>
                    {groupingMenuProjectId === member.id ? (
                      <view className="project-settings-grouping-menu flex flex-col">
                        {GROUPING_OPTIONS.map((option) => (
                          <view
                            key={option.value}
                            className={
                              selection === option.value
                                ? "project-settings-grouping-option project-settings-grouping-option--selected"
                                : "project-settings-grouping-option"
                            }
                            data-project-grouping-option={option.value}
                            bindtap={() => selectGrouping(member, option.value)}
                          >
                            <text className="project-settings-grouping-option__label">
                              {option.label}
                            </text>
                            {selection === option.value ? (
                              <Icon name="check" size={14} color="#f5f5f5" />
                            ) : null}
                          </view>
                        ))}
                      </view>
                    ) : null}
                  </view>
                </view>
                {confirmingRemove ? (
                  <view className="project-settings-remove-confirm">
                    <text className="project-settings-remove-confirm__title">
                      Remove {member.title}?
                    </text>
                    <text className="project-settings-remove-confirm__description">
                      This removes the project and its conversation history. This action cannot be
                      undone.
                    </text>
                    <view className="project-settings-remove-confirm__actions">
                      <view
                        className="project-settings-dialog__button"
                        bindtap={() => setConfirmingRemoveProjectId(null)}
                      >
                        <text className="project-settings-dialog__button-label">Cancel</text>
                      </view>
                      <view
                        className={`project-settings-dialog__button project-settings-dialog__button--danger${
                          pending ? " project-settings-dialog__button--disabled" : ""
                        }`}
                        aria-disabled={pending ? "true" : "false"}
                        bindtap={pending ? undefined : () => removeProject(member)}
                      >
                        <text className="project-settings-dialog__button-label project-settings-dialog__button-label--danger">
                          {pending ? "Removing…" : "Confirm remove"}
                        </text>
                      </view>
                    </view>
                  </view>
                ) : members.length > 1 ? (
                  <view
                    className="project-settings-remove flex flex-row"
                    bindtap={() => setConfirmingRemoveProjectId(member.id)}
                  >
                    <Icon name="trash-2" size={14} color="#f87171" />
                    <text className="project-settings-remove__label">Remove project</text>
                  </view>
                ) : null}
              </view>
            );
          })}
          {error ? <text className="project-settings-dialog__error">{error}</text> : null}
        </scroll-view>
        <view className="project-settings-dialog__footer flex flex-row">
          {singleMember && confirmingRemoveProjectId !== singleMember.id ? (
            <view
              className="project-settings-dialog__button project-settings-dialog__button--danger"
              bindtap={() => setConfirmingRemoveProjectId(singleMember.id)}
            >
              <Icon name="trash-2" size={14} color="#f87171" />
              <text className="project-settings-dialog__button-label project-settings-dialog__button-label--danger">
                Remove project
              </text>
            </view>
          ) : null}
          <view
            className="project-settings-dialog__button project-settings-dialog__button--primary"
            bindtap={onClose}
          >
            <text className="project-settings-dialog__button-label project-settings-dialog__button-label--primary">
              Close
            </text>
          </view>
        </view>
      </view>
    </>
  );
}
